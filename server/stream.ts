import type { RequestHandler } from 'express';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';

export function streamProxy(open: (serviceId: string, signal: AbortSignal) => Promise<Response>): RequestHandler {
  return async (req, res) => {
    const serviceId = req.params.serviceId;
    if (typeof serviceId !== 'string' || !/^\d+$/.test(serviceId)) {
      res.status(400).end('Invalid service ID');
      return;
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    // Register before awaiting headers: tuning can be cancelled before the
    // upstream has sent even its first byte.
    res.once('close', abort);
    if (res.destroyed) abort();
    try {
      const response = await open(serviceId, controller.signal);
      if (controller.signal.aborted) {
        await response.body?.cancel();
        return;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        res.status(response.ok ? 502 : response.status).end('Stream unavailable');
        return;
      }
      res.status(response.status);
      res.setHeader('Content-Type', response.headers.get('content-type') ?? 'video/mp2t');
      res.setHeader('Cache-Control', 'no-store');
      if (response.headers.has('content-length')) res.setHeader('Content-Length', response.headers.get('content-length')!);
      // pipeline handles backpressure and destroys the source on downstream
      // close, including while waiting for the response buffer to drain.
      await pipeline(Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>), res, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted || res.destroyed) return;
      if (!res.headersSent) res.status(502).json({ error: error instanceof Error ? error.message : '映像を取得できませんでした' });
      else res.destroy();
    } finally {
      controller.abort();
      res.off('close', abort);
    }
  };
}
