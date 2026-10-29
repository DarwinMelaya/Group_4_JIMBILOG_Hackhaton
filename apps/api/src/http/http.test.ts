import express from 'express';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import { AppError, errorHandler, notFoundHandler } from './errors.js';
import { createLogger, redact, REDACTED } from './logger.js';
import { accessLog, requestId } from './middleware.js';

function harness(lines: string[]) {
  const logger = createLogger((l) => lines.push(l));
  const app = express();
  app.use(requestId);
  app.use(accessLog(logger));
  app.get('/boom', () => {
    throw new Error('db password=hunter2 at C:\\secret\\path.ts:12');
  });
  app.get('/app-error', () => {
    throw new AppError(409, 'conflict', 'Conflict.');
  });
  app.get('/zod', () => {
    z.object({ a: z.string() }).parse({});
  });
  app.get('/ok', (_req, res) => {
    res.json({ ok: true });
  });
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}

describe('correlation id (x-request-id)', () => {
  it('generates one when absent', async () => {
    const res = await request(harness([])).get('/ok');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('propagates a well-formed inbound id', async () => {
    const res = await request(harness([])).get('/ok').set('x-request-id', 'client-req-12345');
    expect(res.headers['x-request-id']).toBe('client-req-12345');
  });
  it('replaces malformed or oversized inbound ids', async () => {
    const app = harness([]);
    for (const bad of ['short', 'has space in it!!', 'x'.repeat(200), 'a<script>alert(1)</script>']) {
      const res = await request(app).get('/ok').set('x-request-id', bad);
      expect(res.headers['x-request-id']).not.toBe(bad);
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
  it('appears in error bodies and logs', async () => {
    const lines: string[] = [];
    const res = await request(harness(lines)).get('/boom').set('x-request-id', 'trace-abcdef01');
    expect(res.body.error.requestId).toBe('trace-abcdef01');
    expect(lines.some((l) => l.includes('trace-abcdef01'))).toBe(true);
  });
});

describe('centralized error handler', () => {
  it('maps unknown errors to a generic 500 with no stack or message leak', async () => {
    const lines: string[] = [];
    const res = await request(harness(lines)).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatchObject({ code: 'internal_error', message: 'Something went wrong.' });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/hunter2|secret|\.ts|stack|at /);
    expect(lines.join('\n')).not.toMatch(/hunter2|secret\\path|stack/);
    expect(res.headers['cache-control']).toBe('no-store');
  });
  it('maps AppError and ZodError to stable codes', async () => {
    const app = harness([]);
    const a = await request(app).get('/app-error');
    expect([a.status, a.body.error.code]).toEqual([409, 'conflict']);
    const z2 = await request(app).get('/zod');
    expect([z2.status, z2.body.error.code]).toEqual([400, 'validation_failed']);
    expect(JSON.stringify(z2.body)).not.toContain('expected');
  });
});

describe('redacted structured logging', () => {
  it('redacts sensitive keys deeply', () => {
    const out = redact({
      path: '/x',
      headers: { authorization: 'Bearer abc', cookie: 'sid=1' },
      booking: { phone: '0917', email: 'a@b.invalid', secretToken: 'zzz', nested: [{ password: 'p' }] },
    }) as Record<string, unknown>;
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/Bearer abc|sid=1|0917|a@b\.invalid|zzz|"p"/);
    expect(text).toContain(REDACTED);
    expect(out.path).toBe('/x');
  });
  it('emits JSON lines that omit query strings', async () => {
    const lines: string[] = [];
    await request(harness(lines)).get('/ok?secret=abc123&email=a@b.invalid');
    const rec = JSON.parse(lines[0] ?? '{}');
    expect(rec).toMatchObject({ level: 'info', msg: 'request', method: 'GET', path: '/ok', status: 200 });
    expect(lines.join('')).not.toMatch(/abc123|a@b\.invalid/);
  });
});
