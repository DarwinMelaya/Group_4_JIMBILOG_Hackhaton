import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { isLoopbackHost, loadEnv, resolveHost } from './env.js';
import { runJobsOnce, startBackgroundJobs } from './jobs.js';
import { demoteLapsedClinics, updateVerification } from './governance/clinic-governance.js';
import { ADMIN_A, STAFF_A, createBooking, login, makeHarness, type Harness, type Session } from './staff/test-support.js';
import { addPublishEvidence, makeRealClinic } from './governance/test-support.js';
import { MockTransport } from './notifications/mock-transport.js';

let h: Harness;
let app: ReturnType<Harness['build']>;
let staff: Session;
const T0 = new Date('2026-10-30T04:00:00Z');
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  h = await makeHarness();
  app = h.build();
  staff = await login(app, STAFF_A);
});
afterAll(async () => {
  await h.db.close();
});
beforeEach(() => {
  h.clock.now = T0;
});

async function publishedRealClinic(label: string): Promise<{ id: string; slug: string }> {
  const c = await makeRealClinic(h.db, label);
  await h.db.query(
    `update clinics set status = 'published', verification_level = 'provider_confirmed', verification_source = 'test fixture', last_verified_at = now() where id = $1`,
    [c.id],
  );
  return c;
}

/** Evidence that is already expired (created in the past, expiry in the past). */
async function addExpiredEvidence(clinicId: string): Promise<void> {
  await h.db.query(
    `insert into clinic_verification_evidence (clinic_id, evidence_type, evidence_reference, status, recorded_by, verified_by, verified_at, expires_at, created_at)
     values ($1, 'partnership_agreement', 'FIXTURE-OLD-001', 'accepted', gen_random_uuid(), gen_random_uuid(), now() - interval '3 days', now() - interval '1 day', now() - interval '3 days')`,
    [clinicId],
  );
}

describe('S9-3 (2) background jobs', () => {
  it('runJobsOnce purges bookings past retention and isolates job failures', async () => {
    const b = await createBooking(app, h.db);
    await h.db.query(`update booking_requests set retention_expires_at = $2::timestamptz where id = $1`, [b.id, '2026-10-31T00:00:00Z']);
    const keep = await createBooking(app, h.db);
    const s = await runJobsOnce(h.db, new Date('2026-11-01T00:00:00Z'), new MockTransport());
    expect(s.failed).toEqual([]);
    expect(s.purgedBookings).toBeGreaterThanOrEqual(1);
    const left = await h.db.query<{ id: string }>('select id from booking_requests where id = any($1::uuid[])', [[b.id, keep.id]]);
    expect(left.rows.map((r) => r.id)).not.toContain(b.id);
    // A failing job does not stop the others.
    const broken = { transaction: () => Promise.reject(new Error('x')), query: h.db.query.bind(h.db) } as unknown as typeof h.db;
    const s2 = await runJobsOnce(broken, T0, new MockTransport());
    expect(s2.failed.length).toBeGreaterThan(0);
  });

  it('startBackgroundJobs is a no-op outside DEMO + development/test', () => {
    const stop = startBackgroundJobs(h.db, { ...h.env, DEMO_MODE: false, NODE_ENV: 'production' });
    expect(typeof stop).toBe('function');
    stop();
  });

  it('startBackgroundJobs ticks on its interval and stop() clears it', async () => {
    const b = await createBooking(app, h.db);
    await h.db.query(`update booking_requests set retention_expires_at = '2026-10-31T00:00:00Z' where id = $1`, [b.id]);
    const stop = startBackgroundJobs(h.db, h.env, { intervalMs: 10, now: () => new Date('2026-11-02T00:00:00Z') });
    await sleep(400);
    expect((await h.db.query('select 1 from booking_requests where id = $1', [b.id])).rows).toHaveLength(0);
    stop();
    await sleep(100);
    const b2 = await createBooking(app, h.db);
    await h.db.query(`update booking_requests set retention_expires_at = '2026-10-31T00:00:00Z' where id = $1`, [b2.id]);
    await sleep(150);
    expect((await h.db.query('select 1 from booking_requests where id = $1', [b2.id])).rows).toHaveLength(1);
    await h.db.query('delete from booking_requests where id = $1', [b2.id]);
  });
});

describe('S9-3 (4) retention', () => {
  it('rows past retention are hidden from the staff queue, detail and decisions even before the purge runs', async () => {
    const b = await createBooking(app, h.db);
    const base = '/api/v1/staff/clinics/demo-clinic-a/booking-requests';
    const list = async (): Promise<string[]> =>
      ((await request(app).get(base).set('Cookie', staff.cookie)).body as { items: { id: string }[] }).items.map((i) => i.id);
    expect(await list()).toContain(b.id);
    // (the clock stays put so the staff session remains valid; only the retention instant moves into the past)
    await h.db.query(`update booking_requests set retention_expires_at = '2026-10-29T00:00:00Z' where id = $1`, [b.id]);
    expect(await list()).not.toContain(b.id);
    expect((await request(app).get(`${base}/${b.id}`).set('Cookie', staff.cookie)).status).toBe(404);
    const patch = await request(app)
      .patch(`${base}/${b.id}/status`)
      .set('Cookie', staff.cookie)
      .set('X-CSRF-Token', staff.csrf)
      .set('If-Match', '"1"')
      .send({ status: 'cancelled' });
    expect(patch.status).toBe(404);
  });
});

describe('S9-3 (5) evidence lapse', () => {
  it('demotes published real clinics with only expired evidence, audits it as system, and never touches DEMO clinics', async () => {
    const lapsed = await publishedRealClinic('lapsed');
    await addExpiredEvidence(lapsed.id);
    const healthy = await publishedRealClinic('healthy');
    await addPublishEvidence(h.db, healthy.id);
    const demoBefore = await h.db.query<{ n: number }>(`select count(*)::int as n from clinics where is_demo and status = 'published'`);

    expect(await demoteLapsedClinics(h.db, new Date())).toBe(1);
    const st = await h.db.query<{ id: string; status: string }>('select id, status from clinics where id = any($1::uuid[])', [[lapsed.id, healthy.id]]);
    expect(Object.fromEntries(st.rows.map((r) => [r.id, r.status]))).toEqual({ [lapsed.id]: 'in_review', [healthy.id]: 'published' });
    const demoAfter = await h.db.query<{ n: number }>(`select count(*)::int as n from clinics where is_demo and status = 'published'`);
    expect(demoAfter.rows[0]?.n).toBe(demoBefore.rows[0]?.n);

    const audit = await h.db.query<{ actor_kind: string; actor_user_id: string | null; metadata: Record<string, unknown> }>(
      `select actor_kind, actor_user_id, metadata from audit_events where action = 'governance.clinic_status_changed' and target_id = $1`,
      [lapsed.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ actor_kind: 'system', actor_user_id: null, metadata: { from_status: 'published', to_status: 'in_review', outcome: 'evidence_lapsed' } });
    expect(await demoteLapsedClinics(h.db, new Date())).toBe(0); // idempotent
  });

  it('a published clinic with only expired evidence is not served by the public API (read-time guard); valid evidence is served', async () => {
    const c = await publishedRealClinic('guard');
    await addExpiredEvidence(c.id);
    expect((await request(app).get(`/api/v1/public/clinics/${c.slug}`)).status).toBe(404);
    const list = await request(app).get('/api/v1/public/clinics?pageSize=50');
    expect(JSON.stringify(list.body)).not.toContain(c.slug);
    await addPublishEvidence(h.db, c.id);
    expect((await request(app).get(`/api/v1/public/clinics/${c.slug}`)).status).toBe(200);
    // DEMO clinics need no evidence.
    expect((await request(app).get('/api/v1/public/clinics/demo-clinic-a')).status).toBe(200);
  });
});

describe('S9-3 (6) updateVerification records the real source', () => {
  it('uses the supplied source, the clinic source, and admin_downgrade only for a real lowering', async () => {
    const c = await publishedRealClinic('src');
    await addPublishEvidence(h.db, c.id);
    const actor = (await h.db.query<{ id: string }>(`select id from staff_users where email = $1`, [ADMIN_A])).rows[0]?.id ?? '';
    const sources = async (): Promise<string[]> =>
      (await h.db.query<{ source: string }>('select source from clinic_verification_records where clinic_id = $1 order by created_at, id', [c.id])).rows.map((r) => r.source);
    const version = async (): Promise<number> => (await h.db.query<{ version: number }>('select version from clinics where id = $1', [c.id])).rows[0]?.version ?? 0;

    await updateVerification(h.db, c.id, actor, { expectedVersion: await version(), addressVerification: 'verified' }, T0);
    expect(await sources()).toEqual(['test fixture']); // the clinic's source, not admin_downgrade
    await updateVerification(h.db, c.id, actor, { expectedVersion: await version(), contactVerification: 'verified', verificationSource: 'MOA field visit' }, T0);
    expect((await sources()).at(-1)).toBe('MOA field visit');
    await updateVerification(h.db, c.id, actor, { expectedVersion: await version(), verificationLevel: 'unverified' }, T0);
    expect((await sources()).at(-1)).toBe('admin_downgrade');
  });
});

describe('S9-3 (7) idempotency replay precedes validation', () => {
  it('replays a stored request even when its preferred date is now out of the advance window', async () => {
    const key = 's9-3-replay-key-0001-abcdefghij';
    const body = { clinicId: 'demo-clinic-a', ageBand: '18_plus', preferredDate: '2026-10-31', preferredWindow: 'morning', acknowledgedDisclosure: true }; // earliest allowed day at T0
    const first = await request(app).post('/api/v1/public/booking-requests').set('Idempotency-Key', key).send(body);
    expect(first.status).toBe(201);
    h.clock.now = new Date(T0.getTime() + 20 * 3_600_000); // 20 h later: inside the 24 h key lifetime, but 2026-10-31 is no longer allowed
    const replay = await request(app).post('/api/v1/public/booking-requests').set('Idempotency-Key', key).send(body);
    expect(replay.status, JSON.stringify(replay.body)).toBe(200);
    expect(replay.body).toMatchObject({ alreadyCreated: true, reference: first.body.reference });
    expect(replay.body.secret).toBeUndefined();
    // A new key with the stale date is still validated.
    const fresh = await request(app).post('/api/v1/public/booking-requests').set('Idempotency-Key', 's9-3-replay-key-0002-abcdefghij').send(body);
    expect(fresh.body.error?.code).toBe('date_out_of_range');
    // The same key with a different body is still a conflict.
    const conflict = await request(app).post('/api/v1/public/booking-requests').set('Idempotency-Key', key).send({ ...body, preferredWindow: 'afternoon' });
    expect(conflict.status).toBe(409);
  });
});

describe('S9-3 (9) bind host, proxy trust and legacy cookie', () => {
  it('binds 127.0.0.1 in DEMO_MODE by default, 0.0.0.0 otherwise, HOST overrides', () => {
    expect(resolveHost(loadEnv({}))).toBe('127.0.0.1');
    expect(resolveHost(loadEnv({ DEMO_MODE: 'false', BOOKING_SECRET_KEY: 'x'.repeat(32) }))).toBe('0.0.0.0');
    expect(resolveHost(loadEnv({ HOST: '::1' }))).toBe('::1');
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
  });

  it('TRUST_PROXY_HOPS defaults to 0 (nothing trusted) and is wired to express', () => {
    expect(loadEnv({}).TRUST_PROXY_HOPS).toBe(0);
    expect(() => loadEnv({ TRUST_PROXY_HOPS: '-1' })).toThrow();
    expect(app.get('trust proxy')).toBeFalsy();
    const proxied = h.build({}, loadEnv({ TRUST_PROXY_HOPS: '1' }));
    expect(proxied.get('trust proxy')).toBe(1);
  });

  it('login and logout also expire a stale cookie under the old /api/v1/staff path', async () => {
    const res = await request(app).post('/api/v1/staff/login').send({ email: STAFF_A, password: 'demo-staff-only-2026' });
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies[0]).toMatch(/Path=\/api\/v1;/);
    expect(cookies.some((c) => /Path=\/api\/v1\/staff;/.test(c) && /Max-Age=0/.test(c))).toBe(true);
    const sess = { cookie: cookies[0]?.split(';')[0] ?? '', csrf: (res.body as { csrfToken: string }).csrfToken };
    const out = await request(app).post('/api/v1/staff/logout').set('Cookie', sess.cookie).set('X-CSRF-Token', sess.csrf);
    const outCookies = out.headers['set-cookie'] as unknown as string[];
    expect(outCookies.some((c) => /Path=\/api\/v1\/staff;/.test(c) && /Max-Age=0/.test(c))).toBe(true);
  });
});
