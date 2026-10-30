import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PGlite } from '@electric-sql/pglite';
import {
  BookingConfigSchema,
  BookingCreatedSchema,
  BookingLookupResponseSchema,
  BookingReplaySchema,
  BOOKING_REFERENCE_RE,
} from '@kalinga/shared';
import { createApp } from '../app.js';
import { openDatabase } from '../db/client.js';
import { seedDemoData } from '../db/seed.js';
import { loadEnv } from '../env.js';
import { createLogger } from '../http/logger.js';
import { DEMO_BOOKING_KEY, generateReference, generateSecret, hmacHex, safeEqualHex } from './crypto.js';
import { DemoFixtureMinorPolicy, EvidenceGatedMinorPolicy, createMinorPolicy } from './minor-policy.js';
import { WindowLimiter } from './rate-limit.js';

const demoEnv = loadEnv({});
const KEY = Buffer.from(DEMO_BOOKING_KEY, 'utf8');

let db: PGlite;
let clock = new Date('2026-10-30T04:00:00Z'); // 12:00 in Asia/Manila
let logLines: string[] = [];
let app: ReturnType<typeof createApp>;

const A = 'demo-clinic-a'; // service optional, contact optional, notes optional, low disclosure
const B = 'demo-clinic-b'; // service required, contact hidden, notes hidden
const C = 'demo-clinic-c'; // config present but disabled
const D = 'demo-clinic-d'; // no config row
const E = 'demo-clinic-e'; // contact preference required
const F = 'demo-clinic-f'; // service hidden

const goodBody = (over: Record<string, unknown> = {}) => ({
  clinicId: A,
  ageBand: '18_plus',
  preferredDate: '2026-11-03',
  preferredWindow: 'morning',
  acknowledgedDisclosure: true,
  ...over,
});

let keyCounter = 0;
const newKey = () => `test-key-${String(++keyCounter).padStart(8, '0')}-abcdef`;

const create = (body: unknown, key: string | null = newKey(), target = app) => {
  const r = request(target).post('/api/v1/public/booking-requests').send(body as object);
  return key === null ? r : r.set('Idempotency-Key', key);
};
const lookup = (body: unknown, target = app) => request(target).post('/api/v1/public/booking-requests/lookup').send(body as object);

beforeAll(async () => {
  db = await openDatabase();
  await seedDemoData(db, demoEnv);
  app = buildApp();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  clock = new Date('2026-10-30T04:00:00Z');
  logLines = [];
  await db.exec('delete from lookup_attempts; delete from idempotency_keys; delete from booking_requests;');
});

type BookingOpts = NonNullable<NonNullable<Parameters<typeof createApp>[0]>['booking']>;
function buildApp(booking: BookingOpts = {}) {
  return createApp({
    env: demoEnv,
    logger: createLogger((l) => logLines.push(l)),
    db,
    booking: { now: () => clock, createIpLimit: 1000, lookupIpLimit: 1000, ...booking },
  });
}

async function rows(table: string): Promise<Record<string, unknown>[]> {
  return (await db.query<Record<string, unknown>>(`select * from ${table}`)).rows;
}

describe('crypto helpers', () => {
  it('generates KAL- references and 256-bit independent secrets', () => {
    const refs = new Set(Array.from({ length: 200 }, generateReference));
    expect(refs.size).toBe(200);
    for (const r of refs) expect(r).toMatch(BOOKING_REFERENCE_RE);
    const s = generateSecret();
    expect(s).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
    expect(generateSecret()).not.toBe(s);
  });

  it('compares digests in constant time form and rejects malformed input', () => {
    const h = hmacHex(KEY, 'secret', 'x');
    expect(safeEqualHex(h, h)).toBe(true);
    expect(safeEqualHex(h, hmacHex(KEY, 'secret', 'y'))).toBe(false);
    expect(safeEqualHex(h, '')).toBe(false);
    expect(safeEqualHex(h, 'abcd')).toBe(false);
    // Domain separation: the same value hashes differently per purpose.
    expect(hmacHex(KEY, 'secret', 'x')).not.toBe(hmacHex(KEY, 'reference', 'x'));
  });

  it('window limiter blocks after the limit and recovers after the window', () => {
    let t = 0;
    const l = new WindowLimiter(2, 1000, () => t);
    expect(l.hit('k')).toBeNull();
    expect(l.hit('k')).toBeNull();
    expect(l.hit('k')).toBe(1);
    expect(l.hit('other')).toBeNull();
    t = 1500;
    expect(l.hit('k')).toBeNull();
  });
});

describe('minor policy adapter', () => {
  const base = { clinicId: 'c1', isDemoClinic: false, demoMode: false };
  const evidence = { evidenceId: 'EV-1', policyVersion: '1', effectiveFrom: new Date('2026-01-01'), clinicIds: ['c1'] };

  it('always rejects under-15 and treats 18+ as not applicable', () => {
    const p = new EvidenceGatedMinorPolicy({ realMinorBookingEnabled: true, evidence });
    expect(p.evaluate({ ...base, ageBand: 'under_15' })).toEqual({ outcome: 'rejected', code: 'under_15_not_supported' });
    expect(new DemoFixtureMinorPolicy(p).evaluate({ ...base, isDemoClinic: true, demoMode: true, ageBand: 'under_15' })).toEqual({
      outcome: 'rejected',
      code: 'under_15_not_supported',
    });
    expect(p.evaluate({ ...base, ageBand: '18_plus' })).toEqual({ outcome: 'not_applicable' });
  });

  it('rejects 15-17 without evidence, when not enabled, unmapped, or not yet effective', () => {
    const rejected = { outcome: 'rejected', code: 'minor_policy_not_configured' };
    expect(new EvidenceGatedMinorPolicy({ realMinorBookingEnabled: false }).evaluate({ ...base, ageBand: '15_17' })).toEqual(rejected);
    expect(new EvidenceGatedMinorPolicy({ realMinorBookingEnabled: false, evidence }).evaluate({ ...base, ageBand: '15_17' })).toEqual(rejected);
    expect(new EvidenceGatedMinorPolicy({ realMinorBookingEnabled: true, evidence }).evaluate({ ...base, clinicId: 'other', ageBand: '15_17' })).toEqual(rejected);
    const future = { ...evidence, effectiveFrom: new Date('2999-01-01') };
    expect(new EvidenceGatedMinorPolicy({ realMinorBookingEnabled: true, evidence: future }).evaluate({ ...base, ageBand: '15_17' })).toEqual(rejected);
    // Evidence never unlocks a demo clinic as a real flow.
    expect(new EvidenceGatedMinorPolicy({ realMinorBookingEnabled: true, evidence }).evaluate({ ...base, isDemoClinic: true, ageBand: '15_17' })).toEqual(rejected);
  });

  it('is eligible only with enabled flag, mapped clinic and effective evidence (unreachable via env today)', () => {
    const p = new EvidenceGatedMinorPolicy({ realMinorBookingEnabled: true, evidence, now: () => new Date('2026-06-01') });
    expect(p.evaluate({ ...base, ageBand: '15_17' })).toEqual({ outcome: 'eligible', policyVersion: '1', evidenceId: 'EV-1' });
    // env.ts forbids the flag, so the factory can never produce an eligible policy.
    const fromEnv = createMinorPolicy({ DEMO_MODE: false, REAL_MINOR_BOOKING_ENABLED: false }, evidence);
    expect(fromEnv.evaluate({ ...base, ageBand: '15_17' }).outcome).toBe('rejected');
  });

  it('the DEMO fixture applies only in demo mode on a demo clinic', () => {
    const p = createMinorPolicy({ DEMO_MODE: true, REAL_MINOR_BOOKING_ENABLED: false });
    expect(p.evaluate({ ...base, isDemoClinic: true, demoMode: true, ageBand: '15_17' }).outcome).toBe('demo_only');
    expect(p.evaluate({ ...base, isDemoClinic: false, demoMode: true, ageBand: '15_17' }).outcome).toBe('rejected');
    expect(p.evaluate({ ...base, isDemoClinic: true, demoMode: false, ageBand: '15_17' }).outcome).toBe('rejected');
    // In a non-demo environment the fixture is not even installed.
    expect(createMinorPolicy({ DEMO_MODE: false, REAL_MINOR_BOOKING_ENABLED: false })).toBeInstanceOf(EvidenceGatedMinorPolicy);
  });
});

describe('booking schema constraints', () => {
  const insert = (over: Record<string, unknown> = {}) => {
    const v = {
      reference: 'KAL-ABCDEFGHIJ',
      secret_hash: 'a'.repeat(64),
      slug: A,
      age_band: '18_plus',
      is_demo: true,
      minor: false,
      ...over,
    };
    return db.query(
      `insert into booking_requests (reference, secret_hash, clinic_id, preferred_date, preferred_window, age_band, is_demo, is_demo_minor_flow, retention_expires_at)
       select $1, $2, id, '2026-11-03', 'any', $3::booking_age_band, $4, $5, now() + interval '30 days' from clinics where slug = $6`,
      [v.reference, v.secret_hash, v.age_band, v.is_demo, v.minor, v.slug],
    );
  };

  it('accepts a valid demo request and rejects malformed references and verifiers', async () => {
    await insert();
    await expect(insert({ reference: 'KAL-ABCDEFGHIJ' })).rejects.toThrow(/duplicate|unique/i);
    await expect(insert({ reference: 'kal-abcdefghij' })).rejects.toThrow(/booking_requests_reference_check|check/i);
    await expect(insert({ reference: 'KAL-ABCDEFGH1J' })).rejects.toThrow(/check/i);
    await expect(insert({ reference: 'KAL-BBBBBBBBBB', secret_hash: 'plain-secret' })).rejects.toThrow(/check/i);
  });

  it('never stores under-15 and never stores a real (non-demo-flow) 15-17 request', async () => {
    await expect(insert({ age_band: 'under_15' })).rejects.toThrow(/booking_requests_no_under_15/);
    await expect(insert({ age_band: '15_17', minor: false })).rejects.toThrow(/booking_requests_minor_demo_only/);
    await expect(insert({ age_band: '18_plus', minor: true })).rejects.toThrow(/booking_requests_demo_minor_consistent/);
    await insert({ reference: 'KAL-CCCCCCCCCC', age_band: '15_17', minor: true });
  });

  it('keeps the request demo flag consistent with its clinic', async () => {
    await expect(insert({ is_demo: false })).rejects.toThrow(/demo flag must match/);
  });

  it('has RLS on every booking table and denies kalinga_public everything but enabled configs', async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname in ('clinic_booking_config','booking_requests','idempotency_keys','lookup_attempts')`,
    );
    expect(r.rows.length).toBe(4);
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
    await insert();
    await db.exec(`select set_config('kalinga.demo_mode', 'true', false)`);
    await db.exec('set role kalinga_public');
    try {
      const cfg = await db.query<{ n: number }>('select count(*)::int as n from clinic_booking_config');
      expect(cfg.rows[0]?.n).toBe(4); // A, B, E, F enabled; C disabled; D absent
      await expect(db.query('select * from booking_requests')).rejects.toThrow(/permission denied/);
      await expect(db.query('select * from idempotency_keys')).rejects.toThrow(/permission denied/);
      await expect(db.query('select * from lookup_attempts')).rejects.toThrow(/permission denied/);
      await expect(db.query('delete from booking_requests')).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
      await db.exec(`select set_config('kalinga.demo_mode', '', false)`);
    }
  });
});

describe('GET booking-config', () => {
  it('returns the clinic-specific dynamic config with disclosure, no-store and request-only', async () => {
    const res = await request(app).get(`/api/v1/public/clinics/${B}/booking-config`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const cfg = BookingConfigSchema.parse(res.body);
    expect(cfg.requestOnly).toBe(true);
    expect(cfg.isDemo).toBe(true);
    expect(cfg.fields.service.mode).toBe('required');
    expect(cfg.fields.service.options).toEqual(['sti_testing']); // only services listed as available
    expect(cfg.fields.contactPreference.mode).toBe('hidden');
    expect(cfg.disclosure.dataFields).toEqual(['ageBand', 'preferredDate', 'preferredWindow', 'service']);
    expect(cfg.disclosure.purpose).toMatch(/DEMO/);
    expect(cfg.dateRange).toEqual({ minDate: '2026-10-31', maxDate: '2026-11-20' });
    expect(cfg.ageBands).toEqual([
      { value: 'under_15', availability: 'unavailable' },
      { value: '15_17', availability: 'demo_only' },
      { value: '18_plus', availability: 'accepted' },
    ]);
  });

  it('differs per clinic and hides fields the clinic does not collect', async () => {
    const f = BookingConfigSchema.parse((await request(app).get(`/api/v1/public/clinics/${F}/booking-config`)).body);
    expect(f.fields.service).toEqual({ mode: 'hidden', options: [] });
    expect(f.disclosure.dataFields).not.toContain('service');
    const e = BookingConfigSchema.parse((await request(app).get(`/api/v1/public/clinics/${E}/booking-config`)).body);
    expect(e.fields.contactPreference.mode).toBe('required');
    expect(e.fields.notes.maxLength).toBe(120);
  });

  it('answers 404 for disabled, unconfigured, draft, unknown and (outside demo mode) demo clinics', async () => {
    for (const slug of [C, D, 'demo-clinic-g', 'nope']) {
      const res = await request(app).get(`/api/v1/public/clinics/${slug}/booking-config`);
      expect(res.status).toBe(404);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect((await request(app).get(`/api/v1/public/clinics/${C}/booking-config`)).body.error.code).toBe('booking_not_available');
    const prod = createApp({ env: loadEnv({ NODE_ENV: 'production', DEMO_MODE: 'false' }), logger: createLogger(() => undefined), db });
    expect((await request(prod).get(`/api/v1/public/clinics/${A}/booking-config`)).status).toBe(404);
  });
});

describe('POST booking-requests: happy path and secrecy', () => {
  it('creates a pending REQUEST with a reference and a one-time secret, no-store, hashed at rest', async () => {
    const res = await create(goodBody({ service: 'hiv_testing', contactPreference: 'none', notes: 'Prefer a quiet time' }));
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = BookingCreatedSchema.parse(res.body);
    expect(body.status).toBe('pending');
    expect(body.requestOnly).toBe(true);
    expect(body.demo).toBe(true);
    expect(body.demoMinorFlow).toBe(false);
    expect(body.reference).toMatch(BOOKING_REFERENCE_RE);
    expect(body.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(res.body)).not.toMatch(/confirmed/i);

    const stored = await rows('booking_requests');
    expect(stored).toHaveLength(1);
    const row = stored[0] as Record<string, unknown>;
    expect(row.status).toBe('pending');
    expect(row.secret_hash).not.toBe(body.secret);
    expect(row.secret_hash).toBe(hmacHex(KEY, 'secret', body.secret));
    // The secret appears nowhere in any persisted table.
    for (const t of ['booking_requests', 'idempotency_keys', 'lookup_attempts', 'clinic_booking_config']) {
      expect(JSON.stringify(await rows(t))).not.toContain(body.secret);
    }
    // Retention is the clinic's configured number of days from the (injected) creation time.
    expect(new Date(String(row.retention_expires_at)).toISOString()).toBe('2026-11-29T04:00:00.000Z');
  });

  it('does not log the reference, secret or verifier on create, lookup success or lookup failure', async () => {
    const res = await create(goodBody());
    const { reference, secret } = res.body as { reference: string; secret: string };
    await lookup({ reference, secret }).expect(200);
    await lookup({ reference, secret: 'wrong-secret-value' }).expect(404);
    await lookup({ reference: 'KAL-AAAAAAAAAA', secret }).expect(404);
    const logs = logLines.join('\n');
    expect(logs.length).toBeGreaterThan(0);
    expect(logs).not.toContain(secret);
    expect(logs).not.toContain(reference);
    expect(logs).not.toContain('wrong-secret-value');
    expect(logs).not.toContain(hmacHex(KEY, 'secret', secret));
    expect(logs).not.toContain('Idempotency');
  });

  it('rejects unknown/identifying keys, a missing acknowledgement and a non-JSON body', async () => {
    for (const extra of [{ name: 'Someone' }, { dateOfBirth: '2000-01-01' }, { phone: '0917' }, { symptoms: 'x' }]) {
      const res = await create(goodBody(extra));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_failed');
    }
    expect((await create(goodBody({ acknowledgedDisclosure: false }))).status).toBe(400);
    const { acknowledgedDisclosure, ...noAck } = goodBody();
    void acknowledgedDisclosure;
    expect((await create(noAck)).status).toBe(400);
    expect((await create(goodBody({ preferredDate: '2026-02-30' }))).status).toBe(400);
    expect(await rows('booking_requests')).toHaveLength(0);
  });

  it('enforces clinic field rules: hidden, required, offered services, notes length and the Manila date window', async () => {
    const code = async (body: Record<string, unknown>) => (await create(goodBody(body))).body.error?.code;
    expect(await code({ clinicId: F, service: 'hiv_testing' })).toBe('field_not_collected');
    expect(await code({ clinicId: B })).toBe('field_required');
    expect(await code({ clinicId: B, service: 'hiv_testing' })).toBe('service_not_offered'); // listed unknown, not available
    expect(await code({ clinicId: B, contactPreference: 'sms', service: 'sti_testing' })).toBe('field_not_collected');
    expect(await code({ clinicId: E })).toBe('field_required');
    expect(await code({ clinicId: E, contactPreference: 'sms', notes: 'x'.repeat(121) })).toBe('notes_too_long');
    expect(await code({ preferredDate: '2026-10-30' })).toBe('date_out_of_range'); // today: below the 1-day minimum
    expect(await code({ preferredDate: '2026-12-31' })).toBe('date_out_of_range');
    expect((await create(goodBody({ clinicId: B, service: 'sti_testing', preferredDate: '2026-11-20' }))).status).toBe(201);
    expect(await code({ clinicId: B, service: 'sti_testing', preferredDate: '2026-11-21' })).toBe('date_out_of_range');
    // 17:00 UTC is already the next calendar day in Asia/Manila, so today's Manila date is 2026-10-31.
    clock = new Date('2026-10-30T17:00:00Z');
    expect(await code({ preferredDate: '2026-10-31' })).toBe('date_out_of_range');
    expect((await create(goodBody({ preferredDate: '2026-11-01' }))).status).toBe(201);
  });

  it('refuses disabled, unconfigured and unknown clinics, and real clinics (real booking is off)', async () => {
    expect((await create(goodBody({ clinicId: C }))).body.error.code).toBe('booking_not_available');
    expect((await create(goodBody({ clinicId: D }))).body.error.code).toBe('booking_not_available');
    expect((await create(goodBody({ clinicId: 'nope' }))).status).toBe(404);
    await db.exec(`
      insert into clinics (slug, name, municipality, status, verification_level, verification_source, last_verified_at)
      values ('fixture-real', 'Fixture Real Clinic', 'Boac', 'published', 'provider_confirmed', 'fixture', now());
      insert into clinic_booking_config (clinic_id, enabled, disclosure_purpose, disclosure_recipient, disclosure_cancellation)
      select id, true, 'p', 'r', 'c' from clinics where slug = 'fixture-real';
      -- S9-3: the public read guard needs unexpired partnership evidence for a published real clinic.
      insert into clinic_verification_evidence (clinic_id, evidence_type, evidence_reference, status, recorded_by, verified_by, verified_at, expires_at)
      select id, 'partnership_agreement', 'FIXTURE-MOA-001', 'accepted', gen_random_uuid(), gen_random_uuid(), now(), now() + interval '1 year'
      from clinics where slug = 'fixture-real';`);
    try {
      const res = await create(goodBody({ clinicId: 'fixture-real' }));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('real_booking_disabled');
      expect(await rows('booking_requests')).toHaveLength(0);
    } finally {
      await db.exec(`delete from clinics where slug = 'fixture-real'`);
    }
  });
});

describe('idempotency and replay', () => {
  it('requires a well-formed Idempotency-Key header', async () => {
    const missing = await create(goodBody(), null);
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('idempotency_key_required');
    expect((await create(goodBody(), 'short')).body.error.code).toBe('idempotency_key_invalid');
    expect((await create(goodBody(), 'has spaces and is long enough!!')).body.error.code).toBe('idempotency_key_invalid');
    expect(await rows('booking_requests')).toHaveLength(0);
  });

  it('replays the same key + body as 200 "already created" WITHOUT a new or repeated secret', async () => {
    const key = newKey();
    const first = await create(goodBody(), key);
    expect(first.status).toBe(201);
    const second = await create(goodBody(), key);
    expect(second.status).toBe(200);
    expect(second.headers['cache-control']).toBe('no-store');
    const replay = BookingReplaySchema.parse(second.body);
    expect(replay.alreadyCreated).toBe(true);
    expect(replay.reference).toBe(first.body.reference);
    expect(replay.status).toBe('pending');
    expect(JSON.stringify(second.body)).not.toContain(first.body.secret);
    expect('secret' in second.body).toBe(false);
    expect(await rows('booking_requests')).toHaveLength(1);
    expect(await rows('idempotency_keys')).toHaveLength(1);
    // The key itself is not stored, only its HMAC.
    expect(JSON.stringify(await rows('idempotency_keys'))).not.toContain(key);
  });

  it('returns 409 when a key is reused with a different body, and treats concurrent duplicates as one request', async () => {
    const key = newKey();
    expect((await create(goodBody(), key)).status).toBe(201);
    const other = await create(goodBody({ preferredWindow: 'afternoon' }), key);
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('idempotency_key_conflict');

    const k2 = newKey();
    const results = await Promise.all([create(goodBody(), k2), create(goodBody(), k2), create(goodBody(), k2)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(await rows('booking_requests')).toHaveLength(2);
  });

  it('forgets keys after 24 hours', async () => {
    const key = newKey();
    expect((await create(goodBody(), key)).status).toBe(201);
    clock = new Date(clock.getTime() + 25 * 3_600_000);
    expect((await create(goodBody({ preferredDate: '2026-11-04' }), key)).status).toBe(201);
    expect(await rows('booking_requests')).toHaveLength(2);
  });

  it('a rejected request consumes no key and creates nothing', async () => {
    const key = newKey();
    expect((await create(goodBody({ ageBand: 'under_15' }), key)).status).toBe(422);
    expect(await rows('idempotency_keys')).toHaveLength(0);
    expect((await create(goodBody(), key)).status).toBe(201);
  });
});

describe('minor handling over the API', () => {
  it('rejects under-15 with guidance and stores nothing', async () => {
    const res = await create(goodBody({ ageBand: 'under_15' }));
    expect(res.status).toBe(422);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.error.code).toBe('under_15_not_supported');
    expect(res.body.error.message).toMatch(/not available for this age group/);
    expect(await rows('booking_requests')).toHaveLength(0);
  });

  it('rejects 15-17 when no approved procedure is configured (fail closed), even on a demo clinic', async () => {
    const closed = buildApp({ policy: new EvidenceGatedMinorPolicy({ realMinorBookingEnabled: false }) });
    const res = await create(goodBody({ ageBand: '15_17' }), newKey(), closed);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('minor_policy_not_configured');
    expect(await rows('booking_requests')).toHaveLength(0);
    const cfg = BookingConfigSchema.parse((await request(closed).get(`/api/v1/public/clinics/${A}/booking-config`)).body);
    expect(cfg.ageBands.find((b) => b.value === '15_17')?.availability).toBe('unavailable');
  });

  it('accepts a 15-17 request only as a labelled DEMO minor flow in demo mode', async () => {
    const res = await create(goodBody({ ageBand: '15_17' }));
    expect(res.status).toBe(201);
    const body = BookingCreatedSchema.parse(res.body);
    expect(body.demo).toBe(true);
    expect(body.demoMinorFlow).toBe(true);
    const row = (await rows('booking_requests'))[0] as Record<string, unknown>;
    expect(row.is_demo_minor_flow).toBe(true);
    expect(row.is_demo).toBe(true);
    expect(row.age_band).toBe('15_17');
  });

  it('never installs the demo minor fixture outside demo mode', async () => {
    const prod = createApp({
      env: loadEnv({ NODE_ENV: 'production', DEMO_MODE: 'false', BOOKING_SECRET_KEY: 'x'.repeat(40) }),
      logger: createLogger(() => undefined),
      db,
    });
    // Demo clinics are invisible there (404), and the policy would reject 15-17 anyway.
    expect((await create(goodBody({ ageBand: '15_17' }), newKey(), prod)).status).toBe(404);
    expect(await rows('booking_requests')).toHaveLength(0);
  });

  it('answers 503 (not a crash or a weak key) when a non-demo environment has no BOOKING_SECRET_KEY', async () => {
    const prod = createApp({ env: loadEnv({ NODE_ENV: 'production', DEMO_MODE: 'false' }), logger: createLogger(() => undefined), db });
    const res = await create(goodBody(), newKey(), prod);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('booking_unavailable');
  });
});

describe('POST booking-requests/lookup', () => {
  async function made(over: Record<string, unknown> = {}) {
    const res = await create(goodBody(over));
    return res.body as { reference: string; secret: string };
  }

  it('is POST-only: GET variants with credentials in the URL do not exist', async () => {
    const { reference, secret } = await made();
    const g = await request(app).get(`/api/v1/public/booking-requests/lookup?reference=${reference}&secret=${secret}`);
    expect(g.status).toBe(404);
    const g2 = await request(app).get(`/api/v1/public/booking-requests/${reference}`);
    expect(g2.status).toBe(404);
  });

  it('returns only status, clinic name and clinic-supplied notes, with no-store and no echo of preferences', async () => {
    const { reference, secret } = await made({ notes: 'private note text', service: 'hiv_testing' });
    const res = await lookup({ reference, secret });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = BookingLookupResponseSchema.parse(res.body);
    expect(body.status).toBe('pending');
    expect(body.requestOnly).toBe(true);
    expect(body.clinic.name).toBe('DEMO Clinic A – Fictitious');
    expect(body.clinicNote).toBeNull();
    expect(Object.keys(body).sort()).toEqual(['clinic', 'clinicNote', 'demo', 'reference', 'requestOnly', 'status', 'updatedAt', 'visitInstructions']);
    expect(JSON.stringify(res.body)).not.toMatch(/private note text|hiv_testing|preferred|age/i);
  });

  it('accepts a differently cased/padded reference and shows clinic-supplied decisions once staff set them', async () => {
    const { reference, secret } = await made();
    await db.query(
      `update booking_requests set status = 'alternative_offered', clinic_note = 'DEMO note', visit_instructions = 'DEMO instructions' where reference = $1`,
      [reference],
    );
    const body = BookingLookupResponseSchema.parse((await lookup({ reference: `  ${reference.toLowerCase()} `, secret }).expect(200)).body);
    expect(body.status).toBe('alternative_offered');
    expect(body.clinicNote).toBe('DEMO note');
    expect(body.visitInstructions).toBe('DEMO instructions');
  });

  it('gives an identical generic failure for unknown reference, wrong secret, malformed reference and expired requests', async () => {
    const { reference, secret } = await made();
    const wrong = await lookup({ reference, secret: generateSecret() });
    const unknown = await lookup({ reference: 'KAL-ZZZZZZZZZZ', secret });
    const malformed = await lookup({ reference: 'not a reference', secret });
    for (const r of [wrong, unknown, malformed]) {
      expect(r.status).toBe(404);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body.error.code).toBe('lookup_failed');
    }
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(wrong.body.error.message).toBe(malformed.body.error.message);
    clock = new Date(clock.getTime() + 31 * 86_400_000); // past the 30-day retention
    const expired = await lookup({ reference, secret });
    expect(expired.status).toBe(404);
    expect(expired.body.error.code).toBe('lookup_failed');
    expect(expired.body.error.message).toBe(wrong.body.error.message);
  });

  it('rejects malformed bodies (extra keys, missing fields) as plain validation errors', async () => {
    expect((await lookup({ reference: 'KAL-AAAAAAAAAA' })).status).toBe(400);
    expect((await lookup({ reference: 'KAL-AAAAAAAAAA', secret: 'x', extra: 1 })).status).toBe(400);
    expect((await lookup({ reference: 'x'.repeat(65), secret: 'x' })).status).toBe(400);
  });

  it('locks a reference after 5 failures for 15 minutes (even with the right secret), then recovers', async () => {
    const { reference, secret } = await made();
    for (let i = 0; i < 5; i += 1) expect((await lookup({ reference, secret: `wrong-${i}` })).status).toBe(404);
    const locked = await lookup({ reference, secret });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('lookup_throttled');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(locked.headers['retry-after'])).toBeLessThanOrEqual(900);
    expect(locked.headers['cache-control']).toBe('no-store');

    // Stored by hash only; the reference itself is not in lookup_attempts.
    const attempts = await rows('lookup_attempts');
    expect(attempts).toHaveLength(1);
    expect(JSON.stringify(attempts)).not.toContain(reference);
    expect((attempts[0] as Record<string, unknown>).reference_hash).toBe(hmacHex(KEY, 'reference', reference));

    clock = new Date(clock.getTime() + 14 * 60_000);
    expect((await lookup({ reference, secret })).status).toBe(429);
    clock = new Date(clock.getTime() + 2 * 60_000);
    expect((await lookup({ reference, secret })).status).toBe(200);
    expect(await rows('lookup_attempts')).toHaveLength(0); // success clears the counter
  });

  it('throttles unknown references exactly like known ones (no enumeration oracle)', async () => {
    const ghost = 'KAL-QQQQQQQQQQ';
    for (let i = 0; i < 5; i += 1) expect((await lookup({ reference: ghost, secret: 'abc' })).status).toBe(404);
    const locked = await lookup({ reference: ghost, secret: 'abc' });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('lookup_throttled');
  });

  it('failures older than the window do not accumulate', async () => {
    const { reference, secret } = await made();
    for (let i = 0; i < 4; i += 1) await lookup({ reference, secret: 'nope' });
    clock = new Date(clock.getTime() + 16 * 60_000);
    for (let i = 0; i < 4; i += 1) await lookup({ reference, secret: 'nope' });
    expect((await lookup({ reference, secret })).status).toBe(200);
  });

  it('applies a coarse per-IP limiter across references, with Retry-After', async () => {
    const limited = buildApp({ lookupIpLimit: 3 });
    for (let i = 0; i < 3; i += 1) expect((await lookup({ reference: `KAL-AAAAAAAAA${'ABC'[i]}`, secret: 'x' }, limited)).status).toBe(404);
    const res = await lookup({ reference: 'KAL-AAAAAAAAAD', secret: 'x' }, limited);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('lookup_throttled');
    expect(res.headers['retry-after']).toBeDefined();
    const createLimited = buildApp({ createIpLimit: 1 });
    expect((await create(goodBody(), newKey(), createLimited)).status).toBe(201);
    expect((await create(goodBody(), newKey(), createLimited)).status).toBe(429);
  });
});
