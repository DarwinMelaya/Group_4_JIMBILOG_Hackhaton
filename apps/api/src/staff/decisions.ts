import { canStaffTransition, type BookingStatus, type StaffBookingTransition } from '@kalinga/shared';
import { AppError } from '../http/errors.js';

const MANILA = '+08:00'; // Asia/Manila is UTC+8 all year (no daylight saving).
const MAX_AHEAD_DAYS = 180;

/** `2026-11-03` + `10:00` Asia/Manila -> UTC instant. */
export function manilaInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${MANILA}`);
}

/** Human-neutral Manila rendering used inside the public note: `2026-11-03 10:00`. */
export function formatManila(d: Date): string {
  const m = new Date(d.getTime() + 8 * 3_600_000).toISOString();
  return `${m.slice(0, 10)} ${m.slice(11, 16)}`;
}

export interface DecisionFields {
  status: BookingStatus;
  visitStartsAt: Date | null;
  alternativeStartsAt: Date | null;
  /** Exactly what is written to booking_requests.clinic_note (<= 300 chars) and shown by the public lookup. */
  clinicNote: string | null;
  /** booking_requests.visit_instructions (<= 500). null leaves nothing to show. */
  visitInstructions: string | null;
}

/**
 * Pure: checks the state machine and the time rules and computes the columns to write. The visit time is placed in the
 * clinic note as a short generated prefix so the existing public lookup (note + instructions only) shows it; the
 * structured instants are kept in visit_starts_at / alternative_starts_at for staff views.
 */
export function planTransition(from: BookingStatus, input: StaffBookingTransition, now: Date): DecisionFields {
  if (!canStaffTransition(from, input.status)) {
    throw new AppError(409, 'illegal_transition', 'That status change is not allowed from the current status.');
  }
  const limit = now.getTime() + MAX_AHEAD_DAYS * 86_400_000;
  const future = (d: Date): Date => {
    if (Number.isNaN(d.getTime()) || d.getTime() <= now.getTime() || d.getTime() > limit) {
      throw new AppError(400, 'visit_time_invalid', 'Choose a time in the future (within 180 days), in Asia/Manila time.');
    }
    return d;
  };
  switch (input.status) {
    case 'confirmed': {
      const at = future(manilaInstant(input.visitDate, input.visitTime));
      const prefix = `Visit time (Asia/Manila): ${formatManila(at)}.`;
      return {
        status: 'confirmed',
        visitStartsAt: at,
        alternativeStartsAt: null,
        clinicNote: input.clinicNote ? `${prefix} ${input.clinicNote}` : prefix,
        visitInstructions: input.visitInstructions ?? null,
      };
    }
    case 'alternative_offered': {
      const at = future(manilaInstant(input.alternativeDate, input.alternativeTime));
      const prefix = `Clinic proposes another time (Asia/Manila): ${formatManila(at)}. Not yet confirmed.`;
      return {
        status: 'alternative_offered',
        visitStartsAt: null,
        alternativeStartsAt: at,
        clinicNote: input.clinicNote ? `${prefix} ${input.clinicNote}` : prefix,
        visitInstructions: input.visitInstructions ?? null,
      };
    }
    case 'cancelled':
      return { status: 'cancelled', visitStartsAt: null, alternativeStartsAt: null, clinicNote: input.clinicNote ?? null, visitInstructions: null };
  }
}

// ---- Expiry of stale pending requests (pure) -----------------------------------------------------------------------

export const PENDING_STALE_AFTER_DAYS = 14;

export interface ExpiryCandidate {
  id: string;
  status: BookingStatus;
  createdAt: Date;
  /** Preferred local date (Asia/Manila), `YYYY-MM-DD`. */
  preferredDate: string;
}

/**
 * A pending request is stale when nobody decided it for `staleAfterDays`, or when its preferred date has already passed
 * (in Asia/Manila). Only `pending` ever expires; an offered alternative waits for the requester.
 */
export function isStalePending(c: ExpiryCandidate, now: Date, staleAfterDays = PENDING_STALE_AFTER_DAYS): boolean {
  if (c.status !== 'pending') return false;
  const ageMs = now.getTime() - c.createdAt.getTime();
  const today = new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  return ageMs >= staleAfterDays * 86_400_000 || c.preferredDate < today;
}

export function selectStalePending(candidates: readonly ExpiryCandidate[], now: Date, staleAfterDays = PENDING_STALE_AFTER_DAYS): string[] {
  return candidates.filter((c) => isStalePending(c, now, staleAfterDays)).map((c) => c.id);
}
