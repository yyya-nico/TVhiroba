import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, get, type Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import viteConfig from '../vite.config';
import { streamProxy } from './stream';

async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

for (const viaVite of [false, true]) for (const mode of ['pending headers', 'streaming', 'backpressure'] as const) {
  test(`repeated tuning releases upstream during ${mode} (${viaVite ? 'Vite proxy' : 'direct'})`, { timeout: 15000 }, async () => {
    let active = 0;
    let opened = 0;
    const upstream = createServer((_req, res) => {
      active++;
      opened++;
      res.once('close', () => { active--; });
      if (mode === 'pending headers') return;
      res.writeHead(200, { 'Content-Type': 'video/mp2t' });
      const chunk = Buffer.alloc(mode === 'backpressure' ? 1024 * 1024 : 188);
      const timer = setInterval(() => res.write(chunk), 5);
      res.once('close', () => clearInterval(timer));
      res.write(chunk);
    });
    const upstreamUrl = await listen(upstream);
    const app = express();
    app.get('/stream/:serviceId', streamProxy((_id, signal) => fetch(upstreamUrl, { signal })));
    const proxy = createServer(app);
    const proxyUrl = await listen(proxy);
    const vite = viaVite ? await createViteServer({
      configFile: false,
      server: { host: '127.0.0.1', port: 0, proxy: { '/stream': {
        ...viteConfig.server!.proxy!['/api'] as object, target: proxyUrl,
      } } },
    }) : null;
    await vite?.listen();
    const clientUrl = vite ? `http://127.0.0.1:${(vite.httpServer!.address() as { port: number }).port}` : proxyUrl;
    const until = async (condition: () => boolean) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (condition()) return;
        await delay(5);
      }
      assert.fail(`connection was not released: active=${active}, opened=${opened}`);
    };
    try {
      for (let index = 0; index < 15; index++) {
        const client = get(`${clientUrl}/stream/${index}`);
        client.on('error', () => {});
        const response = mode === 'pending headers' ? null : once(client, 'response');
        await until(() => opened === index + 1);
        if (response) {
          const [incoming] = await response;
          incoming.on('error', () => {});
          if (mode === 'streaming') incoming.resume();
          else await delay(30);
        }
        client.destroy();
        await until(() => active === 0);
      }
    } finally {
      await vite?.close();
      proxy.closeAllConnections();
      upstream.closeAllConnections();
      await Promise.all([new Promise<void>((resolve) => proxy.close(() => resolve())), new Promise<void>((resolve) => upstream.close(() => resolve()))]);
    }
  });
}
