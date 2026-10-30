import type { PGlite } from '@electric-sql/pglite';
import {
  STAFF_BOOKING_TRANSITIONS,
  type BookingStatus,
  type StaffBookingDetail,
  type StaffBookingItem,
  type StaffBookingList,
  type StaffBookingListQuery,
  type StaffBookingTransition,
} from '@kalinga/shared';
import { AppError } from '../http/errors.js';
import { recordAudit } from './audit.js';
import { syncRemindersForDecision } from '../notifications/service.js';
import { planTransition, selectStalePending, type ExpiryCandidate } from './decisions.js';
import type { ClinicScope } from './repository.js';

type Queryable = Pick<PGlite, 'query'>;

/** Columns selected for staff views. secret_hash / secret_key_version are deliberately never selected. */
const COLUMNS = `b.id, b.reference, b.status, b.version, b.preferred_date::text as preferred_date, b.preferred_window,
  b.service_category, b.age_band, b.is_demo, b.is_demo_minor_flow, b.contact_preference, b.notes, b.clinic_note,
  b.visit_instructions, b.visit_starts_at::text as visit_starts_at, b.alternative_starts_at::text as alternative_starts_at,
  b.decided_at::text as decided_at, b.created_at::text as created_at, b.updated_at::text as updated_at`;

interface Row {
  id: string;
  reference: string;
  status: BookingStatus;
  version: number;
  preferred_date: string;
  preferred_window: StaffBookingItem['preferredWindow'];
  service_category: StaffBookingItem['service'];
  age_band: StaffBookingItem['ageBand'];
  is_demo: boolean;
  is_demo_minor_flow: boolean;
  contact_preference: StaffBookingDetail['contactPreference'];
  notes: string | null;
  clinic_note: string | null;
  visit_instructions: string | null;
  visit_starts_at: string | null;
  alternative_starts_at: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

const iso = (s: string | null): string | null => (s === null ? null : new Date(s).toISOString());

function toItem(r: Row): StaffBookingItem {
  return {
    id: r.id,
    reference: r.reference,
    status: r.status,
    version: r.version,
    preferredDate: r.preferred_date,
    preferredWindow: r.preferred_window,
    service: r.service_category,
    ageBand: r.age_band,
    isDemo: r.is_demo,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function toDetail(r: Row, clinic: ClinicScope): StaffBookingDetail {
  return {
    ...toItem(r),
    clinic: { id: clinic.clinicId, slug: clinic.clinicSlug, name: clinic.clinicName },
    contactPreference: r.contact_preference,
    notes: r.notes,
    isDemoMinorFlow: r.is_demo_minor_flow,
    clinicNote: r.clinic_note,
    visitInstructions: r.visit_instructions,
    visitStartsAt: iso(r.visit_starts_at),
    alternativeStartsAt: iso(r.alternative_starts_at),
    decidedAt: iso(r.decided_at),
    allowedTransitions: [...STAFF_BOOKING_TRANSITIONS[r.status]],
  };
}

/** Only this clinic's rows (the clinic id comes from the verified scope, never from the request body). */
/** S9-3: rows past retention_expires_at are invisible to staff even before the purge job removes them. */
export async function listQueue(db: Queryable, clinic: ClinicScope, q: StaffBookingListQuery, now: Date = new Date()): Promise<StaffBookingList> {
  const status = q.status ?? null;
  const total = await db.query<{ n: number }>(
    `select count(*)::int as n from booking_requests b where b.clinic_id = $1 and ($2::booking_status is null or b.status = $2::booking_status)
       and b.retention_expires_at > $3::timestamptz`,
    [clinic.clinicId, status, now.toISOString()],
  );
  const rows = await db.query<Row>(
    `select ${COLUMNS} from booking_requests b
     where b.clinic_id = $1 and ($2::booking_status is null or b.status = $2::booking_status) and b.retention_expires_at > $5::timestamptz
     order by b.preferred_date asc, b.created_at asc, b.id asc limit $3 offset $4`,
    [clinic.clinicId, status, q.limit, q.offset, now.toISOString()],
  );
  return { items: rows.rows.map(toItem), total: total.rows[0]?.n ?? 0, limit: q.limit, offset: q.offset };
}

/** null when the request does not exist OR belongs to another clinic (callers answer one identical 404). */
export async function getDetail(db: Queryable, clinic: ClinicScope, id: string, now: Date = new Date()): Promise<StaffBookingDetail | null> {
  const r = await db.query<Row>(
    `select ${COLUMNS} from booking_requests b where b.id = $1 and b.clinic_id = $2 and b.retention_expires_at > $3::timestamptz`,
    [id, clinic.clinicId, now.toISOString()],
  );
  const row = r.rows[0];
  return row ? toDetail(row, clinic) : null;
}

export interface TransitionContext {
  clinic: ClinicScope;
  requestId: string;
  actorUserId: string;
  expectedVersion: number;
  input: StaffBookingTransition;
  now: Date;
}

/**
 * Guarded, optimistic-concurrency transition in one transaction:
 *   1. row locked and scoped to the clinic (other clinic -> 404, identical to "no such request");
 *   2. the caller's If-Match version must equal the stored version (otherwise 409 version_conflict: the loser of two
 *      concurrent decisions lands here);
 *   3. the state machine and time rules are applied (409 illegal_transition / 400 visit_time_invalid);
 *   4. status, clinic_note, visit_instructions (the exact columns the public lookup reads), structured times, decision
 *      stamp and version+1 are written, and an audit event with redacted metadata is appended.
 */
export async function applyTransition(db: PGlite, ctx: TransitionContext): Promise<StaffBookingDetail> {
  return db.transaction(async (tx) => {
    const cur = await tx.query<{ status: BookingStatus; version: number }>(
      `select status, version from booking_requests where id = $1 and clinic_id = $2 and retention_expires_at > $3::timestamptz for update`,
      [ctx.requestId, ctx.clinic.clinicId, ctx.now.toISOString()],
    );
    const row = cur.rows[0];
    if (!row) throw new AppError(404, 'not_found', 'Not found.');
    if (row.version !== ctx.expectedVersion) {
      throw new AppError(409, 'version_conflict', 'This request was changed by someone else. Reload and try again.');
    }
    const plan = planTransition(row.status, ctx.input, ctx.now);
    const at = ctx.now.toISOString();
    const upd = await tx.query<Row>(
      `update booking_requests b set status = $3::booking_status, clinic_note = $4, visit_instructions = $5,
              visit_starts_at = $6::timestamptz, alternative_starts_at = $7::timestamptz, decided_by = $8,
              decided_at = $9::timestamptz, version = b.version + 1, updated_at = $9::timestamptz
       where b.id = $1 and b.clinic_id = $2 and b.version = $10
       returning ${COLUMNS}`,
      [
        ctx.requestId,
        ctx.clinic.clinicId,
        plan.status,
        plan.clinicNote,
        plan.visitInstructions,
        plan.visitStartsAt?.toISOString() ?? null,
        plan.alternativeStartsAt?.toISOString() ?? null,
        ctx.actorUserId,
        at,
        ctx.expectedVersion,
      ],
    );
    const updated = upd.rows[0];
    if (!updated) throw new AppError(409, 'version_conflict', 'This request was changed by someone else. Reload and try again.');
    await recordAudit(tx, {
      actorUserId: ctx.actorUserId,
      actorKind: 'staff',
      action: 'booking_request.status_changed',
      targetType: 'booking_request',
      targetId: ctx.requestId,
      clinicId: ctx.clinic.clinicId,
      metadata: {
        from_status: row.status,
        to_status: plan.status,
        version_before: row.version,
        version_after: updated.version,
        visit_time_set: plan.visitStartsAt !== null || plan.alternativeStartsAt !== null,
        text_added: Boolean(ctx.input.clinicNote) || (ctx.input.status !== 'cancelled' && Boolean(ctx.input.visitInstructions)),
      },
      at: ctx.now,
    });
    // S8-1 additive hook: queue a neutral reminder (opted-in only) on confirm; cancel waiting ones otherwise.
    await syncRemindersForDecision(tx, ctx.requestId, plan.status, ctx.now);
    return toDetail(updated, ctx.clinic);
  });
}

/**
 * Expiry job helper: moves stale pending requests (see isStalePending) to `expired`, one audit row each, no staff actor.
 * Safe to run repeatedly; returns how many were expired. S9-3: the DEMO/dev in-process scheduler (jobs.ts) runs it; a real deployment needs its own scheduler.
 */
export async function expireStalePending(db: PGlite, now: Date, staleAfterDays?: number): Promise<number> {
  return db.transaction(async (tx) => {
    const r = await tx.query<{ id: string; clinic_id: string; created_at: string; preferred_date: string; version: number }>(
      `select id, clinic_id, created_at::text as created_at, preferred_date::text as preferred_date, version
       from booking_requests where status = 'pending' and retention_expires_at > $1::timestamptz for update`,
      [now.toISOString()],
    );
    const byId = new Map(r.rows.map((x) => [x.id, x]));
    const candidates: ExpiryCandidate[] = r.rows.map((x) => ({
      id: x.id,
      status: 'pending',
      createdAt: new Date(x.created_at),
      preferredDate: x.preferred_date,
    }));
    const ids = selectStalePending(candidates, now, staleAfterDays);
    for (const id of ids) {
      const x = byId.get(id);
      if (!x) continue;
      await tx.query(
        `update booking_requests set status = 'expired', version = version + 1, updated_at = $2::timestamptz where id = $1 and status = 'pending'`,
        [id, now.toISOString()],
      );
      await recordAudit(tx, {
        actorUserId: null,
        actorKind: 'system',
        action: 'booking_request.expired',
        targetType: 'booking_request',
        targetId: id,
        clinicId: x.clinic_id,
        metadata: { from_status: 'pending', to_status: 'expired', version_before: x.version, version_after: x.version + 1 },
        at: now,
      });
    }
    return ids.length;
  });
}
