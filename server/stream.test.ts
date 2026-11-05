import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, get, type Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import express from 'express';
import { streamProxy } from './stream';

async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

for (const mode of ['pending headers', 'streaming', 'backpressure'] as const) {
  test(`repeated tuning releases upstream during ${mode}`, { timeout: 15000 }, async () => {
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
    const until = async (condition: () => boolean) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (condition()) return;
        await delay(5);
      }
      assert.fail(`connection was not released: active=${active}, opened=${opened}`);
    };
    try {
      for (let index = 0; index < 15; index++) {
        const client = get(`${proxyUrl}/stream/${index}`);
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
      proxy.closeAllConnections();
      upstream.closeAllConnections();
      await Promise.all([new Promise<void>((resolve) => proxy.close(() => resolve())), new Promise<void>((resolve) => upstream.close(() => resolve()))]);
    }
  });
}
