import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../env.js';
import { adminRouter } from './routes.js';
import { ADMIN, call, clinicIdOf, loginAll, makeHarness, type App, type Harness, type Sessions } from './test-support.js';

type Role = 'staffA' | 'adminA' | 'prov' | 'tech';
const ALL: Role[] = ['staffA', 'adminA', 'prov', 'tech'];

interface Endpoint {
  method: 'get' | 'post' | 'patch' | 'delete';
  route: string; // express route pattern as registered
  path: (ids: { clinic: string; any: string }) => string;
  allowed: Role[];
}

const E = (method: Endpoint['method'], route: string, path: Endpoint['path'], allowed: Role[]): Endpoint => ({ method, route, path, allowed });

const ENDPOINTS: Endpoint[] = [
  E('get', '/config', () => `${ADMIN}/config`, ['tech']),
  E('get', '/clinics', () => `${ADMIN}/clinics`, ['prov', 'tech']),
  E('get', '/clinics/:clinicId/evidence', (i) => `${ADMIN}/clinics/${i.clinic}/evidence`, ['prov', 'tech']),
  E('post', '/clinics/:clinicId/evidence', (i) => `${ADMIN}/clinics/${i.clinic}/evidence`, ['prov']),
  E('post', '/clinics/:clinicId/evidence/:evidenceId/review', (i) => `${ADMIN}/clinics/${i.clinic}/evidence/${i.any}/review`, ['prov']),
  E('post', '/clinics/:clinicId/evidence/:evidenceId/expire', (i) => `${ADMIN}/clinics/${i.clinic}/evidence/${i.any}/expire`, ['prov']),
  E('patch', '/clinics/:clinicId/verification', (i) => `${ADMIN}/clinics/${i.clinic}/verification`, ['prov']),
  E('patch', '/clinics/:clinicId/status', (i) => `${ADMIN}/clinics/${i.clinic}/status`, ['prov']),
  E('get', '/minor-booking-readiness', () => `${ADMIN}/minor-booking-readiness`, ['prov', 'tech']),
  E('get', '/clinics/:clinicId/minor-sop-mappings', (i) => `${ADMIN}/clinics/${i.clinic}/minor-sop-mappings`, ['prov', 'tech']),
  E('post', '/clinics/:clinicId/minor-sop-mappings', (i) => `${ADMIN}/clinics/${i.clinic}/minor-sop-mappings`, ['prov']),
  E('post', '/clinics/:clinicId/minor-sop-mappings/:mappingId/revoke', (i) => `${ADMIN}/clinics/${i.clinic}/minor-sop-mappings/${i.any}/revoke`, ['prov']),
  E('get', '/articles', () => `${ADMIN}/articles`, ['prov']),
  E('post', '/articles/:slug/localizations/:locale/transition', () => `${ADMIN}/articles/sti-basics-overview/localizations/en/transition`, ['prov']),
  E('get', '/reports/summary', () => `${ADMIN}/reports/summary`, ['prov', 'tech', 'adminA']),
  E('get', '/reports/export.csv', () => `${ADMIN}/reports/export.csv`, ['prov', 'tech', 'adminA']),
  E('get', '/staff', () => `${ADMIN}/staff`, ['prov', 'tech', 'adminA']),
  E('get', '/staff/invites', () => `${ADMIN}/staff/invites`, ['prov', 'tech', 'adminA']),
  E('post', '/staff/invites', () => `${ADMIN}/staff/invites`, ['prov', 'tech', 'adminA']),
  E('post', '/staff/invites/:inviteId/revoke', (i) => `${ADMIN}/staff/invites/${i.any}/revoke`, ['prov', 'tech', 'adminA']),
  E('post', '/staff/:userId/memberships', (i) => `${ADMIN}/staff/${i.any}/memberships`, ['prov', 'tech', 'adminA']),
  E('delete', '/staff/:userId/memberships/:clinicId', (i) => `${ADMIN}/staff/${i.any}/memberships/${i.clinic}`, ['prov', 'tech', 'adminA']),
  E('post', '/staff/:userId/deactivate', (i) => `${ADMIN}/staff/${i.any}/deactivate`, ['prov', 'tech']),
];

let h: Harness;
let app: App;
let S: Sessions;
let ids: { clinic: string; any: string };

beforeAll(async () => {
  h = await makeHarness();
  app = h.build();
  S = await loginAll(app);
  ids = { clinic: await clinicIdOf(h.db, 'demo-clinic-a'), any: '00000000-0000-4000-8000-000000000000' };
});
afterAll(async () => {
  await h.db.close();
});

const session = (r: Role) => S[r];
const writes = ENDPOINTS.filter((e) => e.method !== 'get');

describe('/api/v1/admin authorisation matrix', () => {
  it('covers every route the admin router registers (no endpoint can be added without a matrix row)', () => {
    const router = adminRouter({ env: loadEnv({}), getDb: () => undefined }) as unknown as { stack?: Array<{ route?: { path: string; methods: Record<string, boolean> } }> };
    const registered = (router.stack || []).flatMap((l) => (l.route ? Object.keys(l.route.methods || {}).map((m) => `${m} ${l.route?.path}`) : [])).sort();
    expect(ENDPOINTS.map((e) => `${e.method} ${e.route}`).sort()).toEqual(registered);
  });

  it.each(ENDPOINTS.map((e) => [`${e.method.toUpperCase()} ${e.route}`, e] as const))('%s: 401 without a session', async (_n, e) => {
    const res = await call(app, null, e.method, e.path(ids), e.method === 'get' ? undefined : {});
    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it.each(ENDPOINTS.map((e) => [`${e.method.toUpperCase()} ${e.route}`, e] as const))('%s: 403 for every role not allowed, never for an allowed one', async (_n, e) => {
    for (const r of ALL) {
      const res = await call(app, session(r), e.method, e.path(ids), e.method === 'get' ? undefined : {});
      if (e.allowed.includes(r)) expect(res.status, `${r} should pass the role gate`).not.toBe(403);
      else expect(res.status, `${r} must be forbidden`).toBe(403);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it.each(writes.map((e) => [`${e.method.toUpperCase()} ${e.route}`, e] as const))('%s: writes need the CSRF header even for an allowed role', async (_n, e) => {
    const role = e.allowed[0] as Role;
    const res = await call(app, session(role), e.method, e.path(ids), {}, false);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: 'csrf_rejected' } });
    const wrong = await call(app, session(role), e.method, e.path(ids), {}).set('X-CSRF-Token', 'x'.repeat(43));
    expect(wrong.status).toBe(403);
  });

  it('rejects a cross-site Origin on writes', async () => {
    const res = await call(app, S.prov, 'post', `${ADMIN}/staff/${ids.any}/deactivate`).set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });

  it('does not accept a role claim from the client', async () => {
    const res = await call(app, S.staffA, 'get', `${ADMIN}/clinics`).set('X-Role', 'provincial_admin').query({ role: 'provincial_admin' });
    expect(res.status).toBe(403);
    const body = await call(app, S.staffA, 'post', `${ADMIN}/staff/invites`, { email: 'a@example.test', role: 'technical_admin', actorRole: 'technical_admin' });
    expect(body.status).toBe(403);
  });
});
