import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import type { ApiError } from '@kalinga/shared';
import type { Logger } from './logger.js';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

const GENERIC: Record<number, [string, string]> = {
  400: ['bad_request', 'The request could not be understood.'],
  404: ['not_found', 'Not found.'],
  405: ['method_not_allowed', 'Method not allowed.'],
  413: ['payload_too_large', 'Request body too large.'],
  415: ['unsupported_media_type', 'Unsupported media type.'],
};

function envelope(res: Response, status: number, code: string, message: string): void {
  const body: ApiError = { error: { code, message, requestId: String(res.getHeader('x-request-id') ?? '') } };
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  envelope(res, 404, 'not_found', 'Not found.');
};

/** Centralized handler: stable codes, generic messages, no stack or internal detail in responses. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof AppError) {
      envelope(res, err.status, err.code, err.publicMessage);
      return;
    }
    if (err instanceof ZodError) {
      envelope(res, 400, 'validation_failed', 'The request failed validation.');
      return;
    }
    const status = (err as { status?: unknown } | null)?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      const [code, message] = GENERIC[status] ?? ['bad_request', 'The request could not be processed.'];
      envelope(res, status, code, message);
      return;
    }
    // Log the error class only (never the stack or message); never expose it to the client.
    logger.log('error', 'unhandled_error', {
      requestId: res.getHeader('x-request-id'),
      method: req.method,
      path: req.path,
      errorName: err instanceof Error ? err.name : typeof err,
    });
    envelope(res, 500, 'internal_error', 'Something went wrong.');
  };
}
