import type { MiddlewareHandler } from 'hono';
import { KeelError } from '../../util/errors.js';

/**
 * Reject requests whose declared Content-Length exceeds `maxBytes`.
 *
 * For JSON POSTs (the only kind Keel accepts on /v1/*), real clients always
 * set Content-Length. Requests without it are caught by Node's own
 * `--max-http-header-size` / body-size defaults — we don't need to stream-tee
 * the body in userspace.
 *
 * Default is 1 MiB. Even a 200-message chat conversation rarely exceeds
 * 200 KiB; anything bigger is almost certainly abuse or a buggy client.
 */
export function sizeLimit(maxBytes: number): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method;
    if (method === 'GET' || method === 'HEAD' || method === 'DELETE') {
      await next();
      return;
    }
    const declared = c.req.header('content-length');
    if (declared) {
      const n = Number.parseInt(declared, 10);
      if (Number.isFinite(n) && n > maxBytes) {
        throw new KeelError('payload_too_large', `request body exceeds ${maxBytes} bytes`, {
          details: { declared_bytes: n, max_bytes: maxBytes },
        });
      }
    }
    await next();
  };
}
