import type { PGlite } from '@electric-sql/pglite';
import {
  ClinicDetailSchema,
  ClinicSummarySchema,
  PRIVACY_PRACTICE_KEYS,
  VERIFICATION_STALE_AFTER_DAYS,
  type ClinicDetail,
  type ClinicListQuery,
  type ClinicListResponse,
  type ClinicPractice,
  type ClinicService,
  type ClinicSummary,
  type VerificationFreshness,
} from '@kalinga/shared';

/** Escape LIKE/ILIKE metacharacters so user text is matched literally (used with ESCAPE '\'). */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Publish-guard predicate shared by every public read (mirrors the RLS policy `clinics_public_read`).
 * $1 = demo mode, $2 = now. A clinic is public only if published; demo (fictitious) clinics only in demo mode. S9-3 read-time
 * guard: a real (non-demo) clinic is also not served unless it still has accepted, unexpired partnership evidence, so a
 * lapse hides it immediately even before the background demotion job has run.
 */
const PUBLIC_CLINIC = `(c.status = 'published' and (not c.is_demo or $1::boolean)
  and (c.is_demo or exists (select 1 from clinic_verification_evidence e where e.clinic_id = c.id and e.status = 'accepted'
    and e.evidence_type = 'partnership_agreement' and e.expires_at > $2::timestamptz)))`;

interface ClinicRow {
  id: string;
  slug: string;
  name: string;
  is_demo: boolean;
  description: string | null;
  municipality: string;
  barangay: string | null;
  address_text: string | null;
  address_verification: string;
  phone: string | null;
  email: string | null;
  contact_note: string | null;
  contact_verification: string;
  verification_level: string;
  verification_source: string | null;
  last_verified_at: string | null;
}

interface ServiceRow {
  clinic_id: string;
  service_category: string;
  availability: string;
  verification_status: string;
  svc_verified_at: string | null;
  fee_tier: string | null;
  amount_php_min: string | null;
  amount_php_max: string | null;
  pricing_note: string | null;
  fee_verification: string | null;
  fee_verified_at: string | null;
}

interface PracticeRow {
  clinic_id: string;
  practice_key: string;
  practice_status: string;
  verification_status: string;
  last_verified_at: string | null;
}

export function freshnessOf(lastVerifiedAt: string | null, now: Date): VerificationFreshness {
  if (!lastVerifiedAt) return 'never';
  const ageDays = (now.getTime() - new Date(lastVerifiedAt).getTime()) / 86_400_000;
  return ageDays > VERIFICATION_STALE_AFTER_DAYS ? 'stale' : 'recent';
}

const COLUMNS = `c.id, c.slug, c.name, c.is_demo, c.description, c.municipality, c.barangay, c.address_text,
  c.address_verification, c.phone, c.email, c.contact_note, c.contact_verification, c.verification_level,
  c.verification_source, c.last_verified_at::text as last_verified_at`;

function iso(v: string | null): string | null {
  return v === null ? null : new Date(v).toISOString();
}

function num(v: string | null): number | null {
  return v === null ? null : Number(v);
}

/** Load services (with pricing) and privacy practices for the given clinics and assemble contract objects. */
async function assemble(db: PGlite, rows: ClinicRow[], now: Date): Promise<ClinicDetail[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const services = await db.query<ServiceRow>(
    `select s.clinic_id, s.service_category, s.availability, s.verification_status, s.last_verified_at::text as svc_verified_at,
            p.fee_tier, p.amount_php_min::text as amount_php_min, p.amount_php_max::text as amount_php_max, p.pricing_note,
            p.verification_status as fee_verification, p.last_verified_at::text as fee_verified_at
     from clinic_services s
     left join clinic_pricing p on p.clinic_id = s.clinic_id and p.service_category = s.service_category
     where s.clinic_id = any($1::uuid[])
     order by s.service_category`,
    [ids],
  );
  const practices = await db.query<PracticeRow>(
    `select clinic_id, practice_key, practice_status, verification_status, last_verified_at::text as last_verified_at
     from clinic_privacy_practices where clinic_id = any($1::uuid[])`,
    [ids],
  );
  return rows.map((r) => {
    const svc: ClinicService[] = services.rows
      .filter((s) => s.clinic_id === r.id)
      .map((s) => ({
        category: s.service_category as ClinicService['category'],
        availability: s.availability as ClinicService['availability'],
        verification: s.verification_status as ClinicService['verification'],
        verifiedAt: iso(s.svc_verified_at),
        fee: {
          tier: (s.fee_tier ?? 'unknown') as ClinicService['fee']['tier'],
          minPhp: num(s.amount_php_min),
          maxPhp: num(s.amount_php_max),
          note: s.pricing_note,
          verification: (s.fee_verification ?? 'unknown') as ClinicService['fee']['verification'],
          verifiedAt: iso(s.fee_verified_at),
        },
      }));
    // Every documented practice key is always present; a missing row is explicitly "unknown".
    const prac: ClinicPractice[] = PRIVACY_PRACTICE_KEYS.map((key) => {
      const p = practices.rows.find((x) => x.clinic_id === r.id && x.practice_key === key);
      const status = (p?.practice_status ?? 'unknown') as ClinicPractice['status'];
      const verification = (p?.verification_status ?? 'unknown') as ClinicPractice['verification'];
      return { key, status, verification, confirmed: status === 'confirmed' && verification === 'verified', verifiedAt: iso(p?.last_verified_at ?? null) };
    });
    const unknowns: string[] = [];
    if (r.address_verification !== 'verified') unknowns.push('address');
    if (r.contact_verification !== 'verified') unknowns.push('contact');
    for (const s of svc) {
      if (s.availability === 'unknown' || s.verification !== 'verified') unknowns.push(`service:${s.category}`);
      if (s.fee.tier === 'unknown' || s.fee.verification !== 'verified') unknowns.push(`fee:${s.category}`);
    }
    for (const p of prac) if (!p.confirmed && p.status !== 'not_supported') unknowns.push(`practice:${p.key}`);
    const lastVerifiedAt = iso(r.last_verified_at);
    return ClinicDetailSchema.parse({
      id: r.id,
      slug: r.slug,
      name: r.name,
      isDemo: r.is_demo,
      municipality: r.municipality,
      verification: {
        level: r.verification_level,
        source: r.verification_source,
        lastVerifiedAt,
        freshness: freshnessOf(lastVerifiedAt, now),
        staleAfterDays: VERIFICATION_STALE_AFTER_DAYS,
      },
      services: svc,
      practices: prac,
      description: r.description,
      barangay: r.barangay,
      address: { text: r.address_text, verification: r.address_verification },
      contact: { phone: r.phone, email: r.email, note: r.contact_note, verification: r.contact_verification },
      unknowns,
    });
  });
}

export async function listClinics(
  db: PGlite,
  demoMode: boolean,
  query: ClinicListQuery,
  now: Date = new Date(),
): Promise<ClinicListResponse> {
  const params: unknown[] = [demoMode, now.toISOString()];
  let where = PUBLIC_CLINIC;
  if (query.municipality) {
    params.push(query.municipality);
    where += ` and c.municipality = $${params.length}`;
  }
  if (query.service) {
    params.push(query.service);
    where += ` and exists (select 1 from clinic_services s where s.clinic_id = c.id and s.service_category = $${params.length} and s.availability = 'available')`;
  }
  if (query.feeTier) {
    params.push(query.feeTier);
    const tier = params.length;
    let svcClause = '';
    if (query.service) {
      params.push(query.service);
      svcClause = ` and p.service_category = $${params.length}`;
    }
    where += ` and exists (select 1 from clinic_pricing p where p.clinic_id = c.id and p.fee_tier = $${tier}${svcClause})`;
  }
  if (query.privacy) {
    params.push(query.privacy);
    where += ` and exists (select 1 from clinic_privacy_practices pp where pp.clinic_id = c.id and pp.practice_key = $${params.length}
      and pp.practice_status = 'confirmed' and pp.verification_status = 'verified')`;
  }
  if (query.q) {
    params.push(`%${escapeLike(query.q)}%`);
    const n = params.length;
    where += ` and (c.name ilike $${n} escape '\\' or c.municipality ilike $${n} escape '\\' or c.description ilike $${n} escape '\\')`;
  }
  const from = `from clinics c where ${where}`;
  const total = await db.query<{ n: number }>(`select count(*)::int as n ${from}`, params);
  const rows = await db.query<ClinicRow>(
    `select ${COLUMNS} ${from} order by c.name asc, c.slug asc limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  );
  const details = await assemble(db, rows.rows, now);
  return {
    items: details.map((d) => ClinicSummarySchema.parse(summaryOf(d))),
    page: query.page,
    pageSize: query.pageSize,
    total: total.rows[0]?.n ?? 0,
  };
}

function summaryOf(d: ClinicDetail): ClinicSummary {
  return {
    id: d.id,
    slug: d.slug,
    name: d.name,
    isDemo: d.isDemo,
    municipality: d.municipality,
    verification: d.verification,
    services: d.services,
    practices: d.practices,
  };
}

/** Look up by uuid or slug. Unpublished, draft and (outside demo mode) demo clinics are indistinguishable from absent. */
export async function getClinic(db: PGlite, demoMode: boolean, idOrSlug: string, now: Date = new Date()): Promise<ClinicDetail | null> {
  const res = await db.query<ClinicRow>(
    `select ${COLUMNS} from clinics c where ${PUBLIC_CLINIC} and (c.id::text = $3 or c.slug = $3)`,
    [demoMode, now.toISOString(), idOrSlug],
  );
  return (await assemble(db, res.rows, now))[0] ?? null;
}

/** All publicly visible clinics (optionally in one municipality) as full details, for the pathway matcher. */
export async function listPublishedClinicDetails(
  db: PGlite,
  demoMode: boolean,
  municipality: string | undefined,
  now: Date = new Date(),
): Promise<ClinicDetail[]> {
  const params: unknown[] = [demoMode, now.toISOString()];
  let where = PUBLIC_CLINIC;
  if (municipality) {
    params.push(municipality);
    where += ` and c.municipality = $3`;
  }
  const rows = await db.query<ClinicRow>(`select ${COLUMNS} from clinics c where ${where} order by c.name, c.slug`, params);
  return assemble(db, rows.rows, now);
}
