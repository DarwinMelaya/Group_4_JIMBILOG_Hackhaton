import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PGlite } from '@electric-sql/pglite';
import { ClinicDetailSchema, ClinicListResponseSchema, MUNICIPALITIES, PRIVACY_PRACTICE_KEYS } from '@kalinga/shared';
import { createApp } from '../app.js';
import { openDatabase } from '../db/client.js';
import { seedDemoData } from '../db/seed.js';
import { loadEnv } from '../env.js';
import { silentLogger } from '../http/logger.js';
import { escapeLike, freshnessOf } from './repository.js';

const demoEnv = loadEnv({});
let db: PGlite;
let app: ReturnType<typeof createApp>;
let prodApp: ReturnType<typeof createApp>;

beforeAll(async () => {
  db = await openDatabase();
  await seedDemoData(db, demoEnv);
  app = createApp({ env: demoEnv, logger: silentLogger, db });
  prodApp = createApp({ env: loadEnv({ NODE_ENV: 'production', DEMO_MODE: 'false' }), logger: silentLogger, db });
});
afterAll(async () => {
  await db.close();
});

async function cleanFixtures(): Promise<void> {
  await db.query(`delete from clinics where slug like 'fixture-%'`);
}

const REAL_BASE = `insert into clinics (slug, name, municipality, status, verification_level, verification_source, last_verified_at)`;

describe('clinic seed', () => {
  it('is idempotent and only contains unmistakably fictitious demo clinics', async () => {
    await seedDemoData(db, demoEnv);
    const r = await db.query<Record<string, unknown>>(
      'select slug, name, is_demo, phone, email, verification_level, address_text, status, municipality from clinics order by slug',
    );
    expect(r.rows.length).toBe(7);
    for (const c of r.rows) {
      expect(c.is_demo).toBe(true);
      expect(String(c.name)).toMatch(/^DEMO Clinic [A-G] – Fictitious/);
      expect(c.phone).toBeNull();
      expect(c.email).toBeNull();
      expect(c.verification_level).toBe('demo_fictitious');
      if (c.address_text) expect(String(c.address_text)).toMatch(/fictitious/i);
    }
    // All six Marinduque municipalities are covered by published demo clinics; the draft one is separate.
    const published = r.rows.filter((c) => c.status === 'published').map((c) => c.municipality);
    expect([...new Set(published)].sort()).toEqual([...MUNICIPALITIES].sort());
    expect(r.rows.filter((c) => c.status !== 'published').map((c) => c.slug)).toEqual(['demo-clinic-g']);
  });

  it('is varied: has unknown and unverified facts and a stale and a never-verified listing', async () => {
    const s = await db.query<{ n: number }>(`select count(*)::int as n from clinic_privacy_practices where verification_status = 'unknown'`);
    const u = await db.query<{ n: number }>(`select count(*)::int as n from clinic_services where verification_status = 'unverified'`);
    expect(s.rows[0]?.n).toBeGreaterThan(0);
    expect(u.rows[0]?.n).toBeGreaterThan(0);
    const never = await db.query<{ n: number }>(`select count(*)::int as n from clinics where last_verified_at is null and status = 'published'`);
    expect(never.rows[0]?.n).toBe(1);
  });
});

describe('DB constraints and publishing guard', () => {
  it('rejects a demo clinic carrying a real verification level, contacts, or a non-DEMO name', async () => {
    const ins = (name: string, level: string, phone: string | null, address: string | null) =>
      db.query(
        `insert into clinics (slug, name, is_demo, municipality, verification_level, phone, address_text)
         values ('fixture-demo-bad', $1, true, 'Boac', $2, $3, $4)`,
        [name, level, phone, address],
      );
    await expect(ins('DEMO Fixture', 'verified_real', null, null)).rejects.toThrow();
    await expect(ins('DEMO Fixture', 'provider_confirmed', null, null)).rejects.toThrow();
    await expect(ins('DEMO Fixture', 'unverified', null, null)).rejects.toThrow();
    await expect(ins('DEMO Fixture', 'demo_fictitious', '+63 000 000 0000', null)).rejects.toThrow();
    await expect(ins('DEMO Fixture', 'demo_fictitious', null, '1 Real Street')).rejects.toThrow();
    await expect(ins('Real Looking Clinic', 'demo_fictitious', null, null)).rejects.toThrow();
    await cleanFixtures();
  });

  it('rejects flipping a seeded demo clinic to a real verification level', async () => {
    await expect(db.query(`update clinics set verification_level = 'verified_real' where slug = 'demo-clinic-a'`)).rejects.toThrow();
    await expect(db.query(`update clinics set is_demo = false where slug = 'demo-clinic-a'`)).rejects.toThrow();
  });

  it('rejects the demo level on a non-demo clinic', async () => {
    await expect(
      db.query(`${REAL_BASE} values ('fixture-real-demolevel', 'Fixture', 'Boac', 'draft', 'demo_fictitious', 'x', now())`),
    ).rejects.toThrow();
  });

  it('refuses to publish a real clinic without a verified level, source and date, and allows it with them', async () => {
    await expect(
      db.query(`${REAL_BASE} values ('fixture-pub-1', 'Fixture 1', 'Boac', 'published', 'unverified', 'src', now())`),
    ).rejects.toThrow();
    await expect(
      db.query(`${REAL_BASE} values ('fixture-pub-2', 'Fixture 2', 'Boac', 'published', 'provider_confirmed', null, now())`),
    ).rejects.toThrow();
    await expect(
      db.query(`${REAL_BASE} values ('fixture-pub-3', 'Fixture 3', 'Boac', 'published', 'provider_confirmed', 'src', null)`),
    ).rejects.toThrow();
    // Drafts are fine unverified, and a verified one may publish.
    await db.query(`${REAL_BASE} values ('fixture-draft', 'Fixture D', 'Boac', 'draft', 'unverified', null, null)`);
    await expect(db.query(`update clinics set status = 'published' where slug = 'fixture-draft'`)).rejects.toThrow();
    await db.query(`${REAL_BASE} values ('fixture-ok', 'Fixture OK', 'Boac', 'published', 'verified_real', 'src', now())`);
    await cleanFixtures();
  });

  it('rejects bad municipality, slug, fee, enum values and a demo clinic with a non-demo verification source', async () => {
    await expect(db.query(`${REAL_BASE} values ('fixture-m', 'F', 'Manila', 'draft', 'unverified', null, null)`)).rejects.toThrow();
    await expect(db.query(`${REAL_BASE} values ('Bad Slug', 'F', 'Boac', 'draft', 'unverified', null, null)`)).rejects.toThrow();
    await expect(
      db.query(`insert into clinic_services (clinic_id, service_category) select id, 'cure_all' from clinics limit 1`),
    ).rejects.toThrow();
    await expect(
      db.query(`insert into clinic_services (clinic_id, service_category, verification_status) select id, 'counselling', 'maybe' from clinics limit 1`),
    ).rejects.toThrow();
    await expect(
      db.query(`insert into clinic_privacy_practices (clinic_id, practice_key) select id, 'guaranteed_anonymous' from clinics limit 1`),
    ).rejects.toThrow();
    await expect(
      db.query(
        `insert into clinic_pricing (clinic_id, service_category, fee_tier, amount_php_min, amount_php_max)
         select id, 'referral', 'low', 500, 100 from clinics limit 1`,
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `insert into clinic_pricing (clinic_id, service_category, fee_tier, verification_status)
         select id, 'referral', 'unknown', 'verified' from clinics limit 1`,
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `insert into clinic_verification_records (clinic_id, scope, status, source, verified_at)
         select id, 'listing', 'verified', 'Provincial Health Office visit', now() from clinics where slug = 'demo-clinic-a'`,
      ),
    ).rejects.toThrow(/demo_fixture/);
    await cleanFixtures();
  });
});

describe('RLS policies (PGlite can run them via SET ROLE)', () => {
  async function asPublic<T>(fn: () => Promise<T>, demoMode: boolean): Promise<T> {
    await db.exec(`select set_config('kalinga.demo_mode', '${demoMode}', false)`);
    await db.exec('set role kalinga_public');
    try {
      return await fn();
    } finally {
      await db.exec('reset role');
      await db.exec(`select set_config('kalinga.demo_mode', '', false)`);
    }
  }

  it('has RLS enabled on every clinic table', async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname in
       ('clinics','clinic_services','clinic_privacy_practices','clinic_pricing','clinic_verification_records')`,
    );
    expect(r.rows.length).toBe(5);
    for (const row of r.rows) expect(row.relrowsecurity).toBe(true);
  });

  it('public role sees no demo clinics unless demo mode is set, and never the draft one', async () => {
    const off = await asPublic(() => db.query<{ slug: string }>('select slug from clinics'), false);
    expect(off.rows).toEqual([]);
    const on = await asPublic(() => db.query<{ slug: string }>('select slug from clinics order by slug'), true);
    expect(on.rows.map((r) => r.slug)).toEqual(['demo-clinic-a', 'demo-clinic-b', 'demo-clinic-c', 'demo-clinic-d', 'demo-clinic-e', 'demo-clinic-f']);
  });

  it('child rows follow the parent clinic visibility', async () => {
    const draft = await asPublic(
      () => db.query(`select 1 from clinic_services s join clinics c on c.id = s.clinic_id where c.slug = 'demo-clinic-g'`),
      true,
    );
    expect(draft.rows.length).toBe(0);
    const direct = await asPublic(() => db.query<{ n: number }>('select count(*)::int as n from clinic_services'), true);
    const all = await db.query<{ n: number }>(`select count(*)::int as n from clinic_services s join clinics c on c.id = s.clinic_id where c.status = 'published'`);
    expect(direct.rows[0]?.n).toBe(all.rows[0]?.n);
    const hidden = await asPublic(() => db.query<{ n: number }>('select count(*)::int as n from clinic_privacy_practices'), false);
    expect(hidden.rows[0]?.n).toBe(0);
  });

  it('public role cannot read verification records or write anything', async () => {
    await expect(asPublic(() => db.query('select * from clinic_verification_records'), true)).rejects.toThrow(/permission denied/);
    await expect(asPublic(() => db.query(`update clinics set name = 'x'`), true)).rejects.toThrow(/permission denied/);
    await expect(asPublic(() => db.query(`delete from clinic_services`), true)).rejects.toThrow(/permission denied/);
    await expect(
      asPublic(() => db.query(`insert into clinics (slug, name, municipality) values ('fixture-rls', 'x', 'Boac')`), true),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('GET /api/v1/public/clinics', () => {
  it('lists only published clinics, contract-valid, DEMO-labelled and cacheable', async () => {
    const res = await request(app).get('/api/v1/public/clinics');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const body = ClinicListResponseSchema.parse(res.body);
    expect(body.total).toBe(6);
    expect(body.items.map((i) => i.slug)).not.toContain('demo-clinic-g');
    for (const c of body.items) {
      expect(c.isDemo).toBe(true);
      expect(c.name).toMatch(/^DEMO .*Fictitious/);
      expect(c.verification.level).toBe('demo_fictitious');
      expect(c.practices.map((p) => p.key)).toEqual([...PRIVACY_PRACTICE_KEYS]);
    }
    expect(body.items.map((i) => i.name)).toEqual([...body.items.map((i) => i.name)].sort());
  });

  it('serves no demo clinics outside demo mode', async () => {
    const res = await request(prodApp).get('/api/v1/public/clinics');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
    expect((await request(prodApp).get('/api/v1/public/clinics/demo-clinic-a')).status).toBe(404);
  });

  it('filters by municipality, service, fee tier and confirmed privacy attribute', async () => {
    const slugs = async (qs: string) =>
      ((await request(app).get(`/api/v1/public/clinics?${qs}`)).body.items as { slug: string }[]).map((i) => i.slug);
    expect(await slugs('municipality=Boac')).toEqual(['demo-clinic-a']);
    expect(await slugs('municipality=Santa%20Cruz')).toEqual(['demo-clinic-d']);
    // Only clinics whose service is available (unknown / unavailable do not count).
    expect(await slugs('service=hiv_testing')).toEqual(['demo-clinic-a', 'demo-clinic-c', 'demo-clinic-e', 'demo-clinic-f']);
    expect(await slugs('service=sti_testing')).toEqual(['demo-clinic-a', 'demo-clinic-b', 'demo-clinic-f']);
    expect(await slugs('feeTier=free')).toEqual(['demo-clinic-a', 'demo-clinic-c', 'demo-clinic-f']);
    expect(await slugs('feeTier=low&service=sti_testing')).toEqual(['demo-clinic-a', 'demo-clinic-f']);
    // Privacy filter requires confirmed AND verified: B's minors_information is confirmed but unverified.
    expect(await slugs('privacy=minors_information')).toEqual(['demo-clinic-e']);
    expect(await slugs('privacy=youth_friendly')).toEqual(['demo-clinic-b', 'demo-clinic-c', 'demo-clinic-e']);
    // Not_supported is not a match for reduced_disclosure_booking either.
    expect(await slugs('privacy=reduced_disclosure_booking')).toEqual(['demo-clinic-a']);
    expect(await slugs('municipality=Boac&service=hiv_testing&feeTier=free&privacy=confidentiality_explained')).toEqual(['demo-clinic-a']);
    expect(await slugs('municipality=Gasan&feeTier=low')).toEqual([]);
  });

  it('searches by text and treats wildcards and SQL as literal', async () => {
    const r = await request(app).get('/api/v1/public/clinics').query({ q: 'clinic c' });
    expect(r.body.items.map((i: { slug: string }) => i.slug)).toEqual(['demo-clinic-c']);
    for (const q of ['%', '_', '%%', '\\']) {
      expect((await request(app).get('/api/v1/public/clinics').query({ q })).body.total).toBe(0);
    }
    const inj = await request(app).get('/api/v1/public/clinics').query({ q: "'; drop table clinics; --" });
    expect(inj.status).toBe(200);
    expect(inj.body.total).toBe(0);
    expect((await db.query<{ n: number }>('select count(*)::int as n from clinics')).rows[0]?.n).toBe(7);
    expect(escapeLike('a%_\\')).toBe('a\\%\\_\\\\');
  });

  it('paginates deterministically', async () => {
    const p1 = await request(app).get('/api/v1/public/clinics?pageSize=4&page=1');
    const p2 = await request(app).get('/api/v1/public/clinics?pageSize=4&page=2');
    expect(p1.body.items.length).toBe(4);
    expect(p2.body.items.length).toBe(2);
    expect(p1.body.total).toBe(6);
    const all = [...p1.body.items, ...p2.body.items].map((i: { slug: string }) => i.slug);
    expect(new Set(all).size).toBe(6);
  });

  it('rejects bad parameters with 400 and a no-store envelope', async () => {
    for (const qs of [
      'municipality=Manila',
      'service=cure_all',
      'feeTier=unknown',
      'privacy=guaranteed_anonymous',
      'page=0',
      'pageSize=999',
      'pageSize=abc',
      'municipality=Boac&municipality=Gasan',
      `q=${'x'.repeat(81)}`,
    ]) {
      const res = await request(app).get(`/api/v1/public/clinics?${qs}`);
      expect(res.status, qs).toBe(400);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.error.code).toBe('validation_failed');
    }
  });
});

describe('GET /api/v1/public/clinics/:id', () => {
  it('returns a profile with explicit unknowns and freshness, by slug or id', async () => {
    const bySlug = await request(app).get('/api/v1/public/clinics/demo-clinic-a');
    expect(bySlug.status).toBe(200);
    expect(bySlug.headers['cache-control']).toBe('public, max-age=60');
    const a = ClinicDetailSchema.parse(bySlug.body);
    const byId = await request(app).get(`/api/v1/public/clinics/${a.id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.slug).toBe('demo-clinic-a');
    expect(a.verification.freshness).toBe('recent');
    expect(a.contact.phone).toBeNull();
    expect(a.contact.email).toBeNull();
    // A's youth_friendly and minors_information are unknown: listed explicitly, never confirmed.
    expect(a.unknowns).toEqual(expect.arrayContaining(['practice:youth_friendly', 'practice:minors_information']));
    expect(a.unknowns).not.toContain('practice:confidentiality_explained');
    expect(a.practices.find((p) => p.key === 'youth_friendly')).toMatchObject({ status: 'unknown', confirmed: false });
    const hiv = a.services.find((s) => s.category === 'hiv_testing');
    expect(hiv).toMatchObject({ availability: 'available', verification: 'verified' });
    expect(hiv?.fee).toMatchObject({ tier: 'free', verification: 'verified' });
    const sti = a.services.find((s) => s.category === 'sti_testing');
    expect(sti?.fee).toMatchObject({ tier: 'low', minPhp: 100, maxPhp: 300 });
    // counselling has no pricing row: fee is explicitly unknown, not free.
    expect(a.services.find((s) => s.category === 'counselling')?.fee).toMatchObject({ tier: 'unknown', verification: 'unknown' });
    expect(a.unknowns).toContain('fee:counselling');
  });

  it('reports stale and never-verified freshness and unconfirmed (not safe) states', async () => {
    const c = ClinicDetailSchema.parse((await request(app).get('/api/v1/public/clinics/demo-clinic-c')).body);
    expect(c.verification.freshness).toBe('stale');
    expect(c.verification.staleAfterDays).toBe(180);
    const d = ClinicDetailSchema.parse((await request(app).get('/api/v1/public/clinics/demo-clinic-d')).body);
    expect(d.verification).toMatchObject({ freshness: 'never', lastVerifiedAt: null });
    expect(d.practices.every((p) => !p.confirmed)).toBe(true);
    expect(d.unknowns).toEqual(expect.arrayContaining(['address', 'contact', ...PRIVACY_PRACTICE_KEYS.map((k) => `practice:${k}`)]));
    const b = ClinicDetailSchema.parse((await request(app).get('/api/v1/public/clinics/demo-clinic-b')).body);
    // confirmed-but-unverified is not a confirmed fact.
    expect(b.practices.find((p) => p.key === 'minors_information')).toMatchObject({ status: 'confirmed', verification: 'unverified', confirmed: false });
    // not_supported is a known fact, not an unknown.
    expect(b.unknowns).not.toContain('practice:reduced_disclosure_booking');
  });

  it('hides draft clinics and answers 404 for unknown or malformed ids', async () => {
    for (const id of ['demo-clinic-g', 'does-not-exist', '00000000-0000-0000-0000-000000000000', 'Bad_Id', '%2e%2e']) {
      const res = await request(app).get(`/api/v1/public/clinics/${id}`);
      expect(res.status, id).toBe(404);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('computes freshness from the verification date', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(freshnessOf(null, now)).toBe('never');
    expect(freshnessOf('2026-05-01T00:00:00Z', now)).toBe('recent');
    expect(freshnessOf('2025-01-01T00:00:00Z', now)).toBe('stale');
  });
});
