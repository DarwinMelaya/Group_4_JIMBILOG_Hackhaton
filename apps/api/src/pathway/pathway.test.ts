import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PGlite } from '@electric-sql/pglite';
import {
  PATHWAY_CONCERNS,
  PathwayMatchRequestSchema,
  PathwayMatchResponseSchema,
  PathwayRankedResponseSchema,
  PathwayUrgentResponseSchema,
  RANKING_BASIS,
  URGENT_ARTICLE_SLUG,
  type PathwayRankedResponse,
} from '@kalinga/shared';
import { createApp } from '../app.js';
import { openDatabase } from '../db/client.js';
import { seedDemoData } from '../db/seed.js';
import { loadEnv } from '../env.js';
import { silentLogger, type Logger } from '../http/logger.js';
import { listPublishedClinicDetails } from '../clinics/repository.js';
import { matchClinics } from './match.js';

const demoEnv = loadEnv({});
const URL = '/api/v1/public/pathway/match';
let db: PGlite;
let app: ReturnType<typeof createApp>;
let prodApp: ReturnType<typeof createApp>;
let noDbApp: ReturnType<typeof createApp>;
const logged: unknown[] = [];
const capture: Logger = { log: (level, msg, fields) => void logged.push({ level, msg, fields }) };

beforeAll(async () => {
  db = await openDatabase();
  await seedDemoData(db, demoEnv);
  app = createApp({ env: demoEnv, logger: capture, db });
  prodApp = createApp({ env: loadEnv({ NODE_ENV: 'production', DEMO_MODE: 'false' }), logger: silentLogger, db });
  noDbApp = createApp({ env: demoEnv, logger: silentLogger });
});
afterAll(async () => {
  await db.close();
});

async function match(body: unknown): Promise<PathwayRankedResponse> {
  const res = await request(app).post(URL).send(body as object);
  expect(res.status).toBe(200);
  return PathwayRankedResponseSchema.parse(res.body);
}
const order = (r: PathwayRankedResponse) => r.matches.map((m) => m.slug.replace('demo-clinic-', ''));

describe('match service: explainable ranking', () => {
  it('with no concerns lists all public clinics deterministically (fresher first, then name)', async () => {
    const r = await match({});
    expect(r.rankingBasis).toBe(RANKING_BASIS);
    expect(r.notMedicalAdvice).toBe(true);
    expect(r.fallback).toBeNull();
    expect(order(r)).toEqual(['a', 'b', 'e', 'f', 'c', 'd']);
    expect(r.matches.map((m) => m.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const m of r.matches) expect(m).toMatchObject({ metCount: 0, unknownCount: 0, whyMayFit: [], remainsUnknown: [], notMet: [], isDemo: true });
  });

  it('privacy: met only on verified+confirmed facts; silence is unknown, not safe', async () => {
    const r = await match({ concerns: ['privacy'] });
    expect(order(r)).toEqual(['a', 'b', 'f', 'c', 'e', 'd']);
    const a = r.matches[0];
    expect(a?.whyMayFit).toHaveLength(1);
    expect(a?.whyMayFit[0]).toMatchObject({ concern: 'privacy', state: 'met' });
    expect(a?.whyMayFit[0]?.attributes.map((x) => x.attribute)).toEqual(['confidentiality_explained', 'reduced_disclosure_booking']);
    // B's reduced-disclosure booking is "not supported" but its confidentiality explanation is confirmed -> still met via one.
    const b = r.matches.find((m) => m.slug === 'demo-clinic-b');
    expect(b?.whyMayFit[0]?.attributes.find((x) => x.attribute === 'reduced_disclosure_booking')).toMatchObject({ confirmed: false, verification: 'verified' });
    // D has nothing confirmed: remains unknown with explicit unconfirmed attributes.
    const d = r.matches.find((m) => m.slug === 'demo-clinic-d');
    expect(d?.whyMayFit).toEqual([]);
    expect(d?.remainsUnknown[0]).toMatchObject({ concern: 'privacy', state: 'unknown' });
    expect(d?.remainsUnknown[0]?.attributes.every((x) => !x.confirmed)).toBe(true);
    expect(d?.unknownCount).toBe(1);
  });

  it('cost: only verified free/low counts; unverified fees stay unknown; verified standard is not met', async () => {
    const r = await match({ concerns: ['cost'] });
    expect(order(r)).toEqual(['a', 'f', 'c', 'b', 'e', 'd']);
    const e = r.matches.find((m) => m.slug === 'demo-clinic-e');
    expect(e?.remainsUnknown[0]?.state).toBe('unknown'); // low but unverified
    expect(e?.whyMayFit).toEqual([]);
    const only = await match({ concerns: ['cost'], municipality: 'Mogpog' });
    expect(only.matches).toHaveLength(1);
    expect(only.matches[0]?.slug).toBe('demo-clinic-b');
  });

  it('overlapping concerns: earlier concerns carry more weight (priority order matters)', async () => {
    const youthFirst = await match({ concerns: ['youth_friendly', 'cost'] });
    const costFirst = await match({ concerns: ['cost', 'youth_friendly'] });
    // C satisfies both and leads either way; the runner-up follows the user's first priority.
    expect(youthFirst.matches[0]?.slug).toBe('demo-clinic-c');
    expect(costFirst.matches[0]?.slug).toBe('demo-clinic-c');
    expect(youthFirst.matches[1]?.slug).toBe('demo-clinic-b');
    expect(costFirst.matches[1]?.slug).toBe('demo-clinic-a');
    expect(youthFirst.matches[0]?.metCount).toBe(2);
  });

  it('minors_info and procedure map to their own documented practices', async () => {
    const minors = await match({ concerns: ['minors_info'] });
    expect(minors.matches[0]?.slug).toBe('demo-clinic-e');
    expect(minors.matches[0]?.whyMayFit[0]?.attributes[0]?.attribute).toBe('minors_information');
    // B's minors info is claimed but unverified -> unknown, not met.
    expect(minors.matches.find((m) => m.slug === 'demo-clinic-b')?.remainsUnknown[0]?.attributes[0]).toMatchObject({ confirmed: false, verification: 'unverified' });
    const proc = await match({ concerns: ['procedure'] });
    expect(proc.matches.filter((m) => m.metCount === 1).map((m) => m.slug.slice(-1)).sort()).toEqual(['a', 'e', 'f']);
  });

  it('municipality is a separate mandatory filter; distance is only evaluated when one is given', async () => {
    const r = await match({ municipality: 'Boac', concerns: ['distance'] });
    expect(order(r)).toEqual(['a']); // the draft DEMO Clinic G in Boac is never public
    expect(r.matches[0]?.whyMayFit[0]).toMatchObject({ concern: 'distance', state: 'met' });
    expect(r.appliedFilters).toMatchObject({ municipality: 'Boac', concerns: ['distance'], notEvaluated: [] });
    const none = await match({ concerns: ['distance'] });
    expect(none.appliedFilters.notEvaluated).toEqual(['distance']);
    expect(none.matches.every((m) => m.metCount === 0 && m.unknownCount === 0)).toBe(true);
    expect(none.matches).toHaveLength(6);
  });

  it('exposes verification freshness and a profile link on every match', async () => {
    const r = await match({});
    const byslug = Object.fromEntries(r.matches.map((m) => [m.slug, m]));
    expect(byslug['demo-clinic-c']?.verification.freshness).toBe('stale');
    expect(byslug['demo-clinic-d']?.verification).toMatchObject({ freshness: 'never', lastVerifiedAt: null });
    expect(byslug['demo-clinic-a']?.profilePath).toBe('/clinics/demo-clinic-a');
  });

  it('no published clinics -> empty list with a browse-all fallback', async () => {
    const res = await request(prodApp).post(URL).send({ concerns: ['privacy'] });
    expect(res.status).toBe(200);
    const body = PathwayRankedResponseSchema.parse(res.body);
    expect(body.matches).toEqual([]);
    expect(body.fallback).toEqual({ kind: 'browse_all_clinics', path: '/clinics' });
  });

  it('is deterministic: identical input gives identical output; pure function matches the API', async () => {
    const req = { concerns: ['privacy', 'cost', 'youth_friendly'], municipality: undefined } as const;
    const one = await request(app).post(URL).send(req);
    const two = await request(app).post(URL).send(req);
    expect(one.body).toEqual(two.body);
    const direct = matchClinics(await listPublishedClinicDetails(db, true, undefined), PathwayMatchRequestSchema.parse(req));
    expect(direct).toEqual(one.body);
  });
});

describe('urgent possible-exposure bypass', () => {
  it('skips ranking entirely and returns professional-assessment guidance without contacts', async () => {
    const res = await request(app).post(URL).send({ urgentExposureWithin72h: true, concerns: ['privacy'], municipality: 'Boac' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = PathwayUrgentResponseSchema.parse(res.body);
    expect(body).not.toHaveProperty('matches');
    expect(body.guidance.articleSlug).toBe(URGENT_ARTICLE_SLUG);
    expect(body.guidance.articlePath).toBe(`/learn/${URGENT_ARTICLE_SLUG}`);
    expect(body.guidance.contacts).toEqual([]);
    expect(body.guidance.clinicalReview).toBe('unreviewed');
  });

  it('works with no database at all (it never touches clinic data)', async () => {
    const res = await request(noDbApp).post(URL).send({ urgentExposureWithin72h: true });
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('urgent');
    // ...while ranking without a database is a 503.
    expect((await request(noDbApp).post(URL).send({})).status).toBe(503);
  });

  it('contains no diagnosis, treatment advice, contact details or links', async () => {
    const res = await request(app).post(URL).send({ urgentExposureWithin72h: true });
    const text = Object.values(res.body.guidance.message as Record<string, string>).join(' ');
    expect(text).toMatch(/qualified health professional|propesyonal sa kalusugan/);
    expect(text).not.toMatch(/https?:|www\.|@|\d{3,}/);
    expect(text).not.toMatch(/\b(take|dose|dosage|prescri\w*|regimen|tablet|pill|you have|you are infected)\b/i);
    expect(text).not.toMatch(/\b(uminom|inumin|dosis|reseta)\b/i);
  });

  it('urgentExposureWithin72h=false behaves as a normal ranked request', async () => {
    const r = await match({ urgentExposureWithin72h: false, concerns: ['cost'] });
    expect(r.mode).toBe('ranked');
  });
});

describe('strict input validation', () => {
  const bad: [string, unknown][] = [
    ['identifier key', { name: 'Juan' }],
    ['contact key', { phone: '09170000000', concerns: ['privacy'] }],
    ['age key', { age: 16 }],
    ['symptom key', { symptoms: ['rash'] }],
    ['unknown concern', { concerns: ['diagnosis'] }],
    ['duplicate concerns', { concerns: ['privacy', 'privacy'] }],
    ['too many concerns', { concerns: [...PATHWAY_CONCERNS, 'privacy'] }],
    ['concerns not an array', { concerns: 'privacy' }],
    ['municipality not in Marinduque', { municipality: 'Manila' }],
    ['municipality not a string', { municipality: 5 }],
    ['urgent as a string', { urgentExposureWithin72h: 'true' }],
    ['urgent as a number', { urgentExposureWithin72h: 1 }],
    ['array body', []],
    ['nested object', { concerns: [{ k: 'privacy' }] }],
  ];
  it.each(bad)('rejects %s with 400 and a no-store envelope', async (_label, body) => {
    const res = await request(app).post(URL).send(body as object);
    expect(res.status).toBe(400);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.error.code).toBe('validation_failed');
  });

  it('rejects malformed JSON and oversized bodies', async () => {
    const malformed = await request(app).post(URL).set('Content-Type', 'application/json').send('{"concerns": [');
    expect(malformed.status).toBe(400);
    const big = await request(app).post(URL).send({ concerns: ['privacy'], pad: 'x'.repeat(20_000) });
    expect([400, 413]).toContain(big.status);
  });

  it('accepts empty and partial bodies', async () => {
    expect((await request(app).post(URL).send({})).status).toBe(200);
    expect((await request(app).post(URL)).status).toBe(200);
    expect(PathwayMatchResponseSchema.safeParse((await request(app).post(URL).send({ municipality: 'Gasan' })).body).success).toBe(true);
  });
});

describe('nothing is stored or logged', () => {
  async function snapshot(): Promise<Record<string, number>> {
    const t = await db.query<{ tablename: string }>(`select tablename from pg_tables where schemaname = 'public' order by tablename`);
    const out: Record<string, number> = {};
    for (const { tablename } of t.rows) {
      out[tablename] = (await db.query<{ n: number }>(`select count(*)::int as n from "${tablename}"`)).rows[0]?.n ?? -1;
    }
    return out;
  }

  it('leaves every table untouched and writes the body nowhere in the logs', async () => {
    const before = await snapshot();
    logged.length = 0;
    const SENTINEL = 'ZZ-sentinel-9f3a1c';
    await request(app).post(URL).send({ concerns: ['privacy', 'cost'], municipality: 'Gasan' });
    await request(app).post(URL).send({ urgentExposureWithin72h: true });
    await request(app).post(URL).send({ nickname: SENTINEL });
    await request(app).post(URL).send({ municipality: SENTINEL });
    await request(app).post(URL).set('Content-Type', 'application/json').send(`{"x": "${SENTINEL}"`);
    expect(await snapshot()).toEqual(before);
    const dump = JSON.stringify(logged);
    expect(logged.length).toBeGreaterThan(0); // access log lines exist...
    expect(dump).not.toContain(SENTINEL);
    expect(dump).not.toMatch(/urgentExposure|privacy|Gasan|concerns|municipality/);
    // ...and are path/status only.
    for (const entry of logged as { msg: string; fields: Record<string, unknown> }[]) {
      expect(Object.keys(entry.fields ?? {}).every((k) => ['requestId', 'method', 'path', 'status', 'durationMs', 'errorName'].includes(k))).toBe(true);
    }
  });

  it('never sets cookies and never caches the response', async () => {
    const res = await request(app).post(URL).send({ concerns: ['privacy'] });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
