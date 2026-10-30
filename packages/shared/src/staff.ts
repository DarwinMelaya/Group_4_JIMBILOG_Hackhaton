import { z } from 'zod';
import { BOOKING_AGE_BANDS, BOOKING_CONTACT_PREFERENCES, BOOKING_STATUSES, BOOKING_WINDOWS, type BookingStatus } from './booking.js';
import { CLINIC_SERVICE_CATEGORIES } from './clinics.js';

/**
 * Staff authentication and booking-queue contract (S6). Dev-equivalent auth (decision D-005 / gap G-AUTH): the same
 * shapes are meant to survive a move to Supabase Auth.
 */
export const STAFF_ROLES = ['clinic_staff', 'clinic_admin', 'provincial_admin', 'technical_admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Only these roles (with a membership of the clinic) may read or decide that clinic's booking requests. */
export const CLINIC_BOOKING_ROLES = ['clinic_staff', 'clinic_admin'] as const;
export type ClinicBookingRole = (typeof CLINIC_BOOKING_ROLES)[number];

export const STAFF_CSRF_HEADER = 'X-CSRF-Token';
export const STAFF_SESSION_COOKIE = 'kalinga_staff_session';

export const STAFF_NOTE_MAX = 200; // single line; the public note is this plus a short generated visit-time prefix (<= 300 total)
export const STAFF_INSTRUCTIONS_MAX = 500;

export const StaffLoginRequestSchema = z
  .object({ email: z.string().trim().toLowerCase().min(3).max(200), password: z.string().min(1).max(200) })
  .strict();
export type StaffLoginRequest = z.infer<typeof StaffLoginRequestSchema>;

const MembershipSchema = z
  .object({ clinicId: z.string().uuid(), clinicSlug: z.string(), clinicName: z.string(), role: z.enum(['clinic_staff', 'clinic_admin']) })
  .strict();

export const StaffMeSchema = z
  .object({
    user: z.object({ id: z.string().uuid(), email: z.string(), displayName: z.string(), role: z.enum(STAFF_ROLES), isDemo: z.boolean() }).strict(),
    memberships: z.array(MembershipSchema),
    /** Session-bound CSRF token: send it back in the X-CSRF-Token header on every state-changing staff request. */
    csrfToken: z.string().min(32),
    sessionExpiresAt: z.string(),
  })
  .strict();
export type StaffMe = z.infer<typeof StaffMeSchema>;

/** Same shape as /me: logging in returns the identity and the CSRF token (the session token itself is an httpOnly cookie). */
export const StaffLoginResponseSchema = StaffMeSchema;
export type StaffLoginResponse = StaffMe;

// ---- Booking decision rules ----------------------------------------------------------------------------------------

/**
 * Staff-driven transition matrix. Terminal states (confirmed, cancelled, expired) allow nothing: a confirmed visit that
 * must be called off is handled by the clinic outside this prototype's scope. `expired` is set only by the system job.
 */
export const STAFF_BOOKING_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  pending: ['confirmed', 'alternative_offered', 'cancelled'],
  alternative_offered: ['confirmed', 'cancelled'],
  confirmed: [],
  cancelled: [],
  expired: [],
};

export function canStaffTransition(from: BookingStatus, to: BookingStatus): boolean {
  return STAFF_BOOKING_TRANSITIONS[from].includes(to);
}

/** Plain text only: no control characters (a block may keep 
  	) and no angle brackets (markup is rejected, never "cleaned"). */
function isPlain(s: string, allowWhitespaceControls: boolean): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (ch === '<' || ch === '>' || c === 0x7f) return false;
    if (c < 0x20 && !(allowWhitespaceControls && (c === 0x09 || c === 0x0a || c === 0x0d))) return false;
  }
  return true;
}
const plainLine = (max: number) => z.string().trim().min(1).max(max).refine((s) => isPlain(s, false), 'plain text only');
const plainBlock = (max: number) => z.string().trim().min(1).max(max).refine((s) => isPlain(s, true), 'plain text only');

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'not a real calendar date');
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use 24-hour HH:MM');

const common = {
  clinicNote: plainLine(STAFF_NOTE_MAX).optional(),
  visitInstructions: plainBlock(STAFF_INSTRUCTIONS_MAX).optional(),
};

/** Body of PATCH /staff/clinics/:clinicId/booking-requests/:id/status. Dates and times are Asia/Manila local. */
export const StaffBookingTransitionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('confirmed'), visitDate: isoDate, visitTime: clock, ...common }).strict(),
  z.object({ status: z.literal('alternative_offered'), alternativeDate: isoDate, alternativeTime: clock, ...common }).strict(),
  z.object({ status: z.literal('cancelled'), clinicNote: common.clinicNote }).strict(),
]);
export type StaffBookingTransition = z.infer<typeof StaffBookingTransitionSchema>;

export const StaffBookingListQuerySchema = z
  .object({
    status: z.enum(BOOKING_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .strict();
export type StaffBookingListQuery = z.infer<typeof StaffBookingListQuerySchema>;

/** Queue row: minimal metadata only (no notes, no secret hash). */
export const StaffBookingItemSchema = z
  .object({
    id: z.string().uuid(),
    reference: z.string(),
    status: z.enum(BOOKING_STATUSES),
    version: z.number().int().min(1),
    preferredDate: z.string(),
    preferredWindow: z.enum(BOOKING_WINDOWS),
    service: z.enum(CLINIC_SERVICE_CATEGORIES).nullable(),
    ageBand: z.enum(BOOKING_AGE_BANDS),
    isDemo: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type StaffBookingItem = z.infer<typeof StaffBookingItemSchema>;

export const StaffBookingListSchema = z
  .object({ items: z.array(StaffBookingItemSchema), total: z.number().int(), limit: z.number().int(), offset: z.number().int() })
  .strict();
export type StaffBookingList = z.infer<typeof StaffBookingListSchema>;

/** Detail adds the requester's optional notes and the clinic's own decision fields. Never the secret verifier. */
export const StaffBookingDetailSchema = StaffBookingItemSchema.extend({
  clinic: z.object({ id: z.string().uuid(), slug: z.string(), name: z.string() }).strict(),
  contactPreference: z.enum(BOOKING_CONTACT_PREFERENCES).nullable(),
  notes: z.string().nullable(),
  isDemoMinorFlow: z.boolean(),
  /** Exactly what the public status lookup shows. */
  clinicNote: z.string().nullable(),
  visitInstructions: z.string().nullable(),
  visitStartsAt: z.string().nullable(),
  alternativeStartsAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  allowedTransitions: z.array(z.enum(BOOKING_STATUSES)),
}).strict();
export type StaffBookingDetail = z.infer<typeof StaffBookingDetailSchema>;
