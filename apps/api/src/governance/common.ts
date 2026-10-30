import type { PGlite } from '@electric-sql/pglite';
import type { RequestHandler } from 'express';
import type { StaffRole } from '@kalinga/shared';
import { AppError } from '../http/errors.js';
import { currentStaff } from '../staff/middleware.js';

export type Queryable = Pick<PGlite, 'query'>;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CLINIC_REF_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9]+(-[a-z0-9]+)*)$/;

export const notFound = (): AppError => new AppError(404, 'not_found', 'Not found.');
export const forbidden = (): AppError => new AppError(403, 'forbidden', 'You do not have access to this.');
export const versionConflict = (): AppError =>
  new AppError(409, 'version_conflict', 'This record changed since you loaded it. Reload and try again.');

/** Explicit server-side role gate. Runs after requireStaff; the role is re-read from the database on every request. */
export function requireRole(...roles: readonly StaffRole[]): RequestHandler {
  return (_req, res, next) => {
    if (!roles.includes(currentStaff(res).user.role)) throw forbidden();
    next();
  };
}

export function uuidParam(raw: unknown): string {
  const v = String(raw ?? '');
  if (!UUID_RE.test(v)) throw notFound();
  return v;
}

export function clinicRefParam(raw: unknown): string {
  const v = String(raw ?? '');
  if (!CLINIC_REF_RE.test(v) || v.length > 80) throw notFound();
  return v;
}

export function iso(v: Date | string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

/**
 * Maps database constraint/trigger failures that the API could not pre-empt to clean 4xx errors, so a DEMO guard or
 * publish guard never surfaces as a 500 or leaks SQL text.
 */
export function translateDbError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;
  const msg = err instanceof Error ? err.message : '';
  if (msg.includes('demo articles cannot be medically reviewed')) {
    return new AppError(409, 'demo_content_locked', 'DEMO content can never be reviewed or published.');
  }
  if (msg.includes('demo clinics') || msg.includes('clinics_demo_is_fictitious') || msg.includes('clinics_real_not_demo_level')) {
    return new AppError(409, 'demo_clinic_locked', 'DEMO clinics can never be verified or treated as real.');
  }
  if (msg.includes('clinics_published_requires_verification')) {
    return new AppError(422, 'publish_requires_verification', 'A real clinic needs a verification level, source and date before it can be published.');
  }
  if (msg.includes('article_loc_review_requires_reviewer')) {
    return new AppError(422, 'reviewer_required', 'A named reviewer and review date are required.');
  }
  return null;
}

/** Runs a database operation and converts known constraint failures; anything else is rethrown (generic 500). */
export async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw translateDbError(err) ?? err;
  }
}

export interface ClinicRow {
  id: string;
  slug: string;
  name: string;
  is_demo: boolean;
  municipality: string;
  status: 'draft' | 'in_review' | 'published' | 'unpublished';
  verification_level: string;
  verification_source: string | null;
  address_verification: 'verified' | 'unknown' | 'unverified';
  contact_verification: 'verified' | 'unknown' | 'unverified';
  last_verified_at: Date | string | null;
  version: number;
}

const CLINIC_COLUMNS = `id, slug, name, is_demo, municipality, status, verification_level, verification_source,
  address_verification, contact_verification, last_verified_at, version`;

/** Looks a clinic up by id or slug. Inputs must already be validated by clinicRefParam. */
export async function findClinic(q: Queryable, ref: string, forUpdate = false): Promise<ClinicRow | null> {
  const r = await q.query<ClinicRow>(
    `select ${CLINIC_COLUMNS} from clinics where id::text = $1 or slug = $1 ${forUpdate ? 'for update' : ''}`,
    [ref],
  );
  return r.rows[0] ?? null;
}
