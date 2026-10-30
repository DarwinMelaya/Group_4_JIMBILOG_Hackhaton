import request from 'supertest';
import type { PGlite } from '@electric-sql/pglite';
import { ADMIN_A, PROVINCIAL, STAFF_A, STAFF_B, TECH, login, makeHarness, type Harness, type Session } from '../staff/test-support.js';

export { ADMIN_A, PROVINCIAL, STAFF_A, STAFF_B, TECH, login, makeHarness, type Harness, type Session };

export type App = ReturnType<Harness['build']>;
export const ADMIN = '/api/v1/admin';

export interface Sessions {
  staffA: Session;
  staffB: Session;
  adminA: Session;
  prov: Session;
  tech: Session;
}

export async function loginAll(app: App): Promise<Sessions> {
  const [staffA, staffB, adminA, prov, tech] = await Promise.all([login(app, STAFF_A), login(app, STAFF_B), login(app, ADMIN_A), login(app, PROVINCIAL), login(app, TECH)]);
  return { staffA, staffB, adminA, prov, tech };
}

/** Authenticated call. `csrf: false` omits the CSRF header (to prove writes are protected). */
export function call(app: App, s: Session | null, method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: unknown, csrf = true) {
  let r = request(app)[method](path);
  if (s) r = r.set('Cookie', s.cookie);
  if (s && csrf && method !== 'get') r = r.set('X-CSRF-Token', s.csrf);
  return body === undefined ? r : r.send(body as object);
}

export async function clinicIdOf(db: PGlite, slug: string): Promise<string> {
  const r = await db.query<{ id: string }>('select id from clinics where slug = $1', [slug]);
  return r.rows[0]?.id ?? '';
}

let n = 0;
/** A NON-demo (fictitious test fixture) clinic row, draft and unverified, created by direct SQL. */
export async function makeRealClinic(db: PGlite, label = 'x'): Promise<{ id: string; slug: string; version: number }> {
  n += 1;
  const slug = `test-real-${label}-${n}`;
  const r = await db.query<{ id: string }>(
    `insert into clinics (slug, name, is_demo, municipality) values ($1, $2, false, 'Boac') returning id`,
    [slug, `Test Fixture ${label} ${n}`],
  );
  return { id: r.rows[0]?.id ?? '', slug, version: 1 };
}

/** An editorial (non-demo) article with both localizations in draft, with sections and references present. */
export async function makeEditorialArticle(db: PGlite, label = 'x'): Promise<{ id: string; slug: string }> {
  n += 1;
  const slug = `test-editorial-${label}-${n}`;
  const a = await db.query<{ id: string }>(`insert into articles (slug, topic, content_origin) values ($1, 'basics', 'editorial') returning id`, [slug]);
  const id = a.rows[0]?.id ?? '';
  for (const locale of ['en', 'fil']) {
    await db.query(
      `insert into article_localizations (article_id, locale, title, summary, sections, "references")
       values ($1, $2, 'Test title', 'Test summary', '[{"heading":"h","text":"t"}]'::jsonb, '[{"label":"Citation placeholder"}]'::jsonb)`,
      [id, locale],
    );
  }
  return { id, slug };
}

export async function auditRows(db: PGlite, action?: string): Promise<{ action: string; actor_user_id: string | null; target_type: string; target_id: string | null; clinic_id: string | null; metadata: Record<string, unknown> }[]> {
  const r = await db.query<{ action: string; actor_user_id: string | null; target_type: string; target_id: string | null; clinic_id: string | null; metadata: Record<string, unknown> }>(
    `select action, actor_user_id, target_type, target_id, clinic_id, metadata from audit_events
     where ($1::text is null or action = $1) order by created_at, id`,
    [action ?? null],
  );
  return r.rows;
}

/** Direct-SQL accepted, unexpired partnership evidence for a NON-demo fixture clinic (S9-3: the public read guard requires it). */
export async function addPublishEvidence(db: PGlite, clinicId: string, expiresInDays = 365): Promise<void> {
  await db.query(
    `insert into clinic_verification_evidence (clinic_id, evidence_type, evidence_reference, status, recorded_by, verified_by, verified_at, expires_at)
     values ($1, 'partnership_agreement', 'FIXTURE-MOA-001', 'accepted', gen_random_uuid(), gen_random_uuid(), now(), now() + make_interval(days => $2::int))`,
    [clinicId, expiresInDays],
  );
}
