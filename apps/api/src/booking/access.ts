import type { PGlite } from '@electric-sql/pglite';
import { BOOKING_REFERENCE_RE, LOOKUP_MAX_FAILURES, LOOKUP_WINDOW_MINUTES, type BookingStatus } from '@kalinga/shared';
import { AppError } from '../http/errors.js';
import { hmacHex, safeEqualHex } from './crypto.js';
import { purgeExpired } from './repository.js';

/**
 * The ONE place a public caller proves possession of a booking request's reference + secret. The status lookup and the
 * reminder preference endpoint both use it, so they share the same constant-work comparison, the same persisted
 * per-reference lockout (`lookup_attempts`) and the same indistinguishable failure.
 */
export const ACCESS_LOCKOUT_MS = LOOKUP_WINDOW_MINUTES * 60_000;

export interface AccessBooking {
  id: string;
  reference: string;
  status: BookingStatus;
  is_demo: boolean;
  clinic_name: string;
  clinic_slug: string;
  clinic_note: string | null;
  visit_instructions: string | null;
  visit_starts_at: string | null;
  updated_at: string;
  retention_expires_at: string;
}

export type AccessResult =
  | { kind: 'ok'; booking: AccessBooking }
  | { kind: 'failed' }
  | { kind: 'locked'; retryAfterSeconds: number };

/** Compared against when the reference is unknown, so unknown-reference and wrong-secret do the same work. */
export function dummySecretHash(key: Buffer): string {
  return hmacHex(key, 'secret', 'dummy-secret-for-uniform-timing');
}

/**
 * Must run inside a transaction the caller COMMITS even for failed attempts (the failure counter is written here); the
 * caller turns a `failed`/`locked` result into an error only after the transaction has finished.
 */
export async function verifyBookingAccess(
  tx: Pick<PGlite, 'query'>,
  key: Buffer,
  dummyHash: string,
  input: { reference: string; secret: string },
  t0: Date,
): Promise<AccessResult> {
  const reference = input.reference.trim().toUpperCase();
  const refHash = hmacHex(key, 'reference', reference);
  const providedHash = hmacHex(key, 'secret', input.secret);

  await purgeExpired(tx, t0);
  const attempt = await tx.query<{ failure_count: number; window_started_at: string; locked_until: string | null }>(
    `select failure_count, window_started_at::text as window_started_at, locked_until::text as locked_until
     from lookup_attempts where reference_hash = $1`,
    [refHash],
  );
  const a = attempt.rows[0];
  if (a?.locked_until && new Date(a.locked_until).getTime() > t0.getTime()) {
    return { kind: 'locked', retryAfterSeconds: Math.max(1, Math.ceil((new Date(a.locked_until).getTime() - t0.getTime()) / 1000)) };
  }

  // Always query and always compare (against a dummy hash when the reference is unknown).
  const found = BOOKING_REFERENCE_RE.test(reference)
    ? await tx.query<AccessBooking & { secret_hash: string }>(
        `select b.id, b.reference, b.secret_hash, b.status, b.is_demo, c.name as clinic_name, c.slug as clinic_slug,
                b.clinic_note, b.visit_instructions, b.visit_starts_at::text as visit_starts_at,
                b.updated_at::text as updated_at, b.retention_expires_at::text as retention_expires_at
         from booking_requests b join clinics c on c.id = b.clinic_id where b.reference = $1`,
        [reference],
      )
    : { rows: [] as (AccessBooking & { secret_hash: string })[] };
  const b = found.rows[0];
  const secretOk = safeEqualHex(b?.secret_hash ?? dummyHash, providedHash);
  const live = b !== undefined && new Date(b.retention_expires_at).getTime() > t0.getTime();

  if (b !== undefined && secretOk && live) {
    await tx.query(`delete from lookup_attempts where reference_hash = $1`, [refHash]);
    const { secret_hash: _omit, ...booking } = b;
    void _omit;
    return { kind: 'ok', booking };
  }

  // Failure (unknown reference, wrong secret or expired): identical bookkeeping and identical response.
  const windowOpen = a !== undefined && new Date(a.window_started_at).getTime() + ACCESS_LOCKOUT_MS > t0.getTime();
  const failures = windowOpen && a ? a.failure_count + 1 : 1;
  const windowStart = windowOpen && a ? new Date(a.window_started_at).toISOString() : t0.toISOString();
  const lockedUntil = failures >= LOOKUP_MAX_FAILURES ? new Date(t0.getTime() + ACCESS_LOCKOUT_MS).toISOString() : null;
  await tx.query(
    `insert into lookup_attempts (reference_hash, failure_count, window_started_at, locked_until, last_attempt_at, expires_at)
     values ($1, $2, $3::timestamptz, $4::timestamptz, $5::timestamptz, $6::timestamptz)
     on conflict (reference_hash) do update set failure_count = excluded.failure_count,
       window_started_at = excluded.window_started_at, locked_until = excluded.locked_until,
       last_attempt_at = excluded.last_attempt_at, expires_at = excluded.expires_at`,
    [refHash, failures, windowStart, lockedUntil, t0.toISOString(), new Date(t0.getTime() + 2 * ACCESS_LOCKOUT_MS).toISOString()],
  );
  return { kind: 'failed' };
}

/** Throws the lookup's public errors for a non-ok result; `setRetryAfter` writes the Retry-After header. */
export function throwAccessError(result: Exclude<AccessResult, { kind: 'ok' }>, setRetryAfter: (seconds: number) => void): never {
  if (result.kind === 'locked') {
    setRetryAfter(result.retryAfterSeconds);
    throw new AppError(429, 'lookup_throttled', 'Too many attempts. Please wait before trying again.');
  }
  throw new AppError(404, 'lookup_failed', 'We could not find a request with those details.');
}
