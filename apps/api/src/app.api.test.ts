import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { PublicConfigSchema, ApiErrorSchema } from '@kalinga/shared';
import { createApp } from './app.js';
import { loadEnv } from './env.js';
import { silentLogger } from './http/logger.js';

const app = createApp({ env: loadEnv({}), logger: silentLogger });

describe('GET /api/v1/public/config', () => {
  it('returns the contract-valid safe demo config', async () => {
    const res = await request(app).get('/api/v1/public/config');
    expect(res.status).toBe(200);
    const parsed = PublicConfigSchema.parse(res.body);
    expect(parsed).toMatchObject({
      demoMode: true,
      locales: ['en', 'fil'],
      notificationTransport: 'mock',
      realBookingEnabled: false,
    });
  });

  it('is publicly cacheable and sets security headers', async () => {
    const res = await request(app).get('/api/v1/public/config');
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('never enables real booking even if requested via query/headers', async () => {
    const res = await request(app).get('/api/v1/public/config?realBookingEnabled=true').set('x-demo-mode', 'false');
    expect(res.body.realBookingEnabled).toBe(false);
    expect(res.body.demoMode).toBe(true);
  });
});

describe('error handling', () => {
  it('returns a generic 404 envelope with no-store', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = ApiErrorSchema.parse(res.body);
    expect(body.error.code).toBe('not_found');
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('returns 400 for malformed JSON without leaking parser detail', async () => {
    const res = await request(app).post('/api/v1/anything').set('content-type', 'application/json').send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad_request');
    expect(JSON.stringify(res.body)).not.toMatch(/Unexpected|position|SyntaxError|node_modules/);
  });

  it('returns 413 for oversized bodies', async () => {
    const res = await request(app)
      .post('/api/v1/anything')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ x: 'a'.repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
  });
});
