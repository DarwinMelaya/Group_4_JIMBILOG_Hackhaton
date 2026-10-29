import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from './logger.js';

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

/** Accept a well-formed inbound x-request-id, otherwise generate one; echo it on the response. */
export const requestId: RequestHandler = (req, res, next) => {
  const inbound = req.get('x-request-id');
  const id = inbound !== undefined && REQUEST_ID_RE.test(inbound) ? inbound : randomUUID();
  res.locals.requestId = id;
  res.setHeader('x-request-id', id);
  next();
};

/** One structured line per request: method, path (no query string), status, duration. */
export function accessLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      logger.log('info', 'request', {
        requestId: res.locals.requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - start) / 1e6,
      });
    });
    next();
  };
}

/** Private-by-default caching for the API; routes opt in to public caching explicitly. */
export const noStoreByDefault: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
