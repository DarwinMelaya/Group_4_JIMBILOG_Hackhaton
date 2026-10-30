import type { PGlite } from '@electric-sql/pglite';
import {
  BOOKING_AGE_BANDS,
  BOOKING_CONTACT_PREFERENCES,
  BOOKING_WINDOWS,
  BookingConfigSchema,
  CLINIC_SERVICE_CATEGORIES,
  type AgeBandAvailability,
  type BookingAgeBand,
  type BookingConfig,
  type BookingStatus,
  type ClinicServiceCategory,
  type FieldMode,
} from '@kalinga/shared';
import type { MinorBookingPolicy } from './minor-policy.js';

const MANILA_OFFSET_MS = 8 * 3_600_000; // Asia/Manila is UTC+8 with no daylight saving.

/** Today's calendar date in Asia/Manila as YYYY-MM-DD. */
export function manilaToday(now: Date): string {
  return new Date(now.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface ClinicBookingRow {
  clinic_id: string;
  slug: string;
  name: string;
  is_demo: boolean;
  enabled: boolean | null;
  service_mode: FieldMode | null;
  contact_preference_mode: FieldMode | null;
  notes_mode: FieldMode | null;
  notes_max_length: number | null;
  low_disclosure_supported: boolean | null;
  disclosure_purpose: string | null;
  disclosure_recipient: string | null;
  disclosure_cancellation: string | null;
  min_advance_days: number | null;
  max_advance_days: number | null;
  retention_days: number | null;
}

/** A clinic's booking config that is enabled (all config columns non-null). */
export interface EnabledClinicBooking extends ClinicBookingRow {
  enabled: true;
  service_mode: FieldMode;
  contact_preference_mode: FieldMode;
  notes_mode: FieldMode;
  notes_max_length: number;
  low_disclosure_supported: boolean;
  disclosure_purpose: string;
  disclosure_recipient: string;
  disclosure_cancellation: string;
  min_advance_days: number;
  max_advance_days: number;
  retention_days: number;
  services: ClinicServiceCategory[];
}

/**
 * Publicly visible clinic (same predicate as the clinics module / RLS: published, demo only in demo mode, real clinics only with unexpired evidence) joined with its
 * booking config. Returns null when the clinic is not public. `enabled` is null when the clinic has no config row.
 */
export async function findClinicBooking(db: PGlite, demoMode: boolean, idOrSlug: string, now: Date = new Date()): Promise<ClinicBookingRow | null> {
  const r = await db.query<ClinicBookingRow>(
    `select c.id as clinic_id, c.slug, c.name, c.is_demo, b.enabled, b.service_mode, b.contact_preference_mode, b.notes_mode,
            b.notes_max_length, b.low_disclosure_supported, b.disclosure_purpose, b.disclosure_recipient,
            b.disclosure_cancellation, b.min_advance_days, b.max_advance_days, b.retention_days
     from clinics c left join clinic_booking_config b on b.clinic_id = c.id
     where c.status = 'published' and (not c.is_demo or $1::boolean) and (c.id::text = $2 or c.slug = $2)
       and (c.is_demo or exists (select 1 from clinic_verification_evidence e where e.clinic_id = c.id and e.status = 'accepted'
         and e.evidence_type = 'partnership_agreement' and e.expires_at > $3::timestamptz))`,
    [demoMode, idOrSlug, now.toISOString()],
  );
  return r.rows[0] ?? null;
}

/** The enabled config with every column present, or null when the clinic has no config or booking is disabled. */
export function toEnabled(row: ClinicBookingRow, services: ClinicServiceCategory[]): EnabledClinicBooking | null {
  const { service_mode, contact_preference_mode, notes_mode, notes_max_length, low_disclosure_supported } = row;
  const { disclosure_purpose, disclosure_recipient, disclosure_cancellation } = row;
  const { min_advance_days, max_advance_days, retention_days } = row;
  if (
    row.enabled !== true ||
    service_mode === null ||
    contact_preference_mode === null ||
    notes_mode === null ||
    notes_max_length === null ||
    low_disclosure_supported === null ||
    disclosure_purpose === null ||
    disclosure_recipient === null ||
    disclosure_cancellation === null ||
    min_advance_days === null ||
    max_advance_days === null ||
    retention_days === null
  ) {
    return null;
  }
  return {
    ...row,
    enabled: true,
    service_mode,
    contact_preference_mode,
    notes_mode,
    notes_max_length,
    low_disclosure_supported,
    disclosure_purpose,
    disclosure_recipient,
    disclosure_cancellation,
    min_advance_days,
    max_advance_days,
    retention_days,
    services,
  };
}

/** Services the clinic currently lists as available (a request may name one of these, never anything else). */
export async function availableServices(db: PGlite, clinicId: string): Promise<ClinicServiceCategory[]> {
  const r = await db.query<{ service_category: ClinicServiceCategory }>(
    `select service_category from clinic_services where clinic_id = $1 and availability = 'available' order by service_category`,
    [clinicId],
  );
  return r.rows.map((x) => x.service_category).filter((s) => (CLINIC_SERVICE_CATEGORIES as readonly string[]).includes(s));
}

/** A field with options but no usable options cannot be required (nothing to choose). */
export function effectiveServiceMode(mode: FieldMode, options: readonly unknown[]): FieldMode {
  return options.length === 0 ? 'hidden' : mode;
}

export function bandAvailability(
  policy: MinorBookingPolicy,
  band: BookingAgeBand,
  clinicId: string,
  isDemoClinic: boolean,
  demoMode: boolean,
): AgeBandAvailability {
  const d = policy.evaluate({ ageBand: band, clinicId, isDemoClinic, demoMode });
  switch (d.outcome) {
    case 'not_applicable':
    case 'eligible':
      return 'accepted';
    case 'demo_only':
      return 'demo_only';
    case 'rejected':
      return 'unavailable';
  }
}

export function buildBookingConfig(
  row: EnabledClinicBooking,
  policy: MinorBookingPolicy,
  demoMode: boolean,
  now: Date,
): BookingConfig {
  const today = manilaToday(now);
  const serviceMode = effectiveServiceMode(row.service_mode, row.services);
  const dataFields: BookingConfig['disclosure']['dataFields'] = ['ageBand', 'preferredDate', 'preferredWindow'];
  if (serviceMode !== 'hidden') dataFields.push('service');
  if (row.contact_preference_mode !== 'hidden') dataFields.push('contactPreference');
  if (row.notes_mode !== 'hidden') dataFields.push('notes');
  return BookingConfigSchema.parse({
    clinicId: row.clinic_id,
    slug: row.slug,
    clinicName: row.name,
    isDemo: row.is_demo,
    requestOnly: true,
    timezone: 'Asia/Manila',
    lowDisclosureSupported: row.low_disclosure_supported,
    disclosure: {
      dataFields,
      purpose: row.disclosure_purpose,
      recipient: row.disclosure_recipient,
      cancellation: row.disclosure_cancellation,
      retentionDays: row.retention_days,
    },
    fields: {
      service: { mode: serviceMode, options: serviceMode === 'hidden' ? [] : row.services },
      contactPreference: {
        mode: row.contact_preference_mode,
        options: row.contact_preference_mode === 'hidden' ? [] : [...BOOKING_CONTACT_PREFERENCES],
      },
      notes: { mode: row.notes_mode, maxLength: row.notes_max_length },
    },
    ageBands: BOOKING_AGE_BANDS.map((value) => ({
      value,
      availability: bandAvailability(policy, value, row.clinic_id, row.is_demo, demoMode),
    })),
    preferredWindows: [...BOOKING_WINDOWS],
    dateRange: { minDate: addDays(today, row.min_advance_days), maxDate: addDays(today, row.max_advance_days) },
  });
}

export interface StoredBooking {
  id: string;
  reference: string;
  status: BookingStatus;
  is_demo: boolean;
  clinic_name: string;
  clinic_slug: string;
}

export interface NewBooking {
  reference: string;
  secretHash: string;
  clinicId: string;
  preferredDate: string;
  preferredWindow: string;
  service: string | null;
  contactPreference: string | null;
  notes: string | null;
  ageBand: BookingAgeBand;
  isDemo: boolean;
  isDemoMinorFlow: boolean;
  now: Date;
  retentionDays: number;
}

/** Inserts a booking; returns the new id, or null when the random reference collided (caller retries with a new one). */
export async function insertBooking(tx: Pick<PGlite, 'query'>, b: NewBooking): Promise<string | null> {
  const expires = new Date(b.now.getTime() + b.retentionDays * 86_400_000).toISOString();
  const r = await tx.query<{ id: string }>(
    `insert into booking_requests (reference, secret_hash, clinic_id, preferred_date, preferred_window, service_category,
       contact_preference, notes, age_band, is_demo, is_demo_minor_flow, created_at, updated_at, retention_expires_at)
     values ($1, $2, $3, $4::date, $5, $6, $7, $8, $9::booking_age_band, $10, $11, $12::timestamptz, $12::timestamptz, $13::timestamptz)
     on conflict (reference) do nothing
     returning id`,
    [
      b.reference,
      b.secretHash,
      b.clinicId,
      b.preferredDate,
      b.preferredWindow,
      b.service,
      b.contactPreference,
      b.notes,
      b.ageBand,
      b.isDemo,
      b.isDemoMinorFlow,
      b.now.toISOString(),
      expires,
    ],
  );
  return r.rows[0]?.id ?? null;
}

export async function findBookingByKey(
  tx: Pick<PGlite, 'query'>,
  keyHash: string,
  now: Date,
): Promise<(StoredBooking & { request_fingerprint: string }) | null> {
  const r = await tx.query<StoredBooking & { request_fingerprint: string }>(
    `select b.id, b.reference, b.status, b.is_demo, c.name as clinic_name, c.slug as clinic_slug, k.request_fingerprint
     from idempotency_keys k
     join booking_requests b on b.id = k.booking_request_id
     join clinics c on c.id = b.clinic_id
     where k.scope = 'booking_request' and k.key_hash = $1 and k.expires_at > $2::timestamptz`,
    [keyHash, now.toISOString()],
  );
  return r.rows[0] ?? null;
}

export async function saveIdempotencyKey(
  tx: Pick<PGlite, 'query'>,
  keyHash: string,
  fingerprint: string,
  bookingId: string,
  now: Date,
  ttlMs: number,
): Promise<void> {
  await tx.query(
    `insert into idempotency_keys (scope, key_hash, request_fingerprint, booking_request_id, created_at, expires_at)
     values ('booking_request', $1, $2, $3, $4::timestamptz, $5::timestamptz)`,
    [keyHash, fingerprint, bookingId, now.toISOString(), new Date(now.getTime() + ttlMs).toISOString()],
  );
}

/**
 * Retention: booking requests past retention_expires_at are deleted (reminder preferences, outbox rows and idempotency keys
 * cascade). Returns how many requests were removed. Audit events keep only redacted ids/status tokens and are not touched.
 */
export async function purgeExpiredBookings(tx: Pick<PGlite, 'query'>, now: Date): Promise<number> {
  const r = await tx.query<{ id: string }>(`delete from booking_requests where retention_expires_at <= $1::timestamptz returning id`, [now.toISOString()]);
  return r.rows.length;
}

/** Housekeeping: short-lived keys, disposable throttle rows and booking requests past retention are removed once expired. */
export async function purgeExpired(tx: Pick<PGlite, 'query'>, now: Date): Promise<void> {
  await purgeExpiredBookings(tx, now);
  await tx.query(`delete from idempotency_keys where expires_at <= $1::timestamptz`, [now.toISOString()]);
  await tx.query(`delete from lookup_attempts where expires_at <= $1::timestamptz`, [now.toISOString()]);
}
