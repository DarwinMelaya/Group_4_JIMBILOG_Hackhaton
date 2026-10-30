import { z } from 'zod';
import { CLINIC_SERVICE_CATEGORIES } from './clinics.js';

/**
 * Confidential booking REQUESTS (master prompt F06/F07, section 8). A request is a preference for a date and time
 * window; it is never a reservation and never "confirmed" until authorised clinic staff say so (S6).
 *
 * Statuses (DB enum `booking_status`): pending / confirmed / alternative_offered / cancelled / expired. The public API
 * exposes them as stored. `pending` is shown to people as "Pending clinic review".
 */
export const BOOKING_STATUSES = ['pending', 'confirmed', 'alternative_offered', 'cancelled', 'expired'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Age BANDS only; a date of birth is never collected. */
export const BOOKING_AGE_BANDS = ['under_15', '15_17', '18_plus'] as const;
export type BookingAgeBand = (typeof BOOKING_AGE_BANDS)[number];

export const BOOKING_WINDOWS = ['morning', 'afternoon', 'any'] as const;
export type BookingWindow = (typeof BOOKING_WINDOWS)[number];

/** A preference for how to be reached. No phone number or email is collected in this prototype. */
export const BOOKING_CONTACT_PREFERENCES = ['none', 'phone_call', 'sms', 'email'] as const;
export type BookingContactPreference = (typeof BOOKING_CONTACT_PREFERENCES)[number];

export const FIELD_MODES = ['hidden', 'optional', 'required'] as const;
export type FieldMode = (typeof FIELD_MODES)[number];

/** How a given age band is handled for a given clinic. Real under-18 submission is never "accepted" in this prototype. */
export const AGE_BAND_AVAILABILITY = ['accepted', 'demo_only', 'unavailable'] as const;
export type AgeBandAvailability = (typeof AGE_BAND_AVAILABILITY)[number];

export const BOOKING_REFERENCE_RE = /^KAL-[A-Z2-7]{10}$/;
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** Lookup throttling policy (documented in docs): failures per reference before lockout, window and lockout length. */
export const LOOKUP_MAX_FAILURES = 5;
export const LOOKUP_WINDOW_MINUTES = 15;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'not a real calendar date');

/** GET /api/v1/public/clinics/:id/booking-config. */
export const BookingConfigSchema = z
  .object({
    clinicId: z.string().uuid(),
    slug: z.string(),
    clinicName: z.string(),
    isDemo: z.boolean(),
    /** Always true: a request is not an appointment. Carried so clients cannot present it otherwise. */
    requestOnly: z.literal(true),
    timezone: z.literal('Asia/Manila'),
    lowDisclosureSupported: z.boolean(),
    disclosure: z
      .object({
        /** Every field the clinic asks for, so the form can list them BEFORE anything is entered. */
        dataFields: z.array(z.enum(['ageBand', 'preferredDate', 'preferredWindow', 'service', 'contactPreference', 'notes'])),
        purpose: z.string(),
        recipient: z.string(),
        cancellation: z.string(),
        retentionDays: z.number().int(),
      })
      .strict(),
    fields: z
      .object({
        service: z.object({ mode: z.enum(FIELD_MODES), options: z.array(z.enum(CLINIC_SERVICE_CATEGORIES)) }).strict(),
        contactPreference: z.object({ mode: z.enum(FIELD_MODES), options: z.array(z.enum(BOOKING_CONTACT_PREFERENCES)) }).strict(),
        notes: z.object({ mode: z.enum(FIELD_MODES), maxLength: z.number().int() }).strict(),
      })
      .strict(),
    ageBands: z.array(z.object({ value: z.enum(BOOKING_AGE_BANDS), availability: z.enum(AGE_BAND_AVAILABILITY) }).strict()),
    preferredWindows: z.array(z.enum(BOOKING_WINDOWS)),
    dateRange: z.object({ minDate: isoDate, maxDate: isoDate }).strict(),
  })
  .strict();
export type BookingConfig = z.infer<typeof BookingConfigSchema>;

/**
 * Body of POST /api/v1/public/booking-requests. Strict: unknown keys (names, contacts, dates of birth, symptoms, ...)
 * are rejected. `acknowledgedDisclosure` must be true: the disclosure is shown before collection.
 */
export const BookingCreateRequestSchema = z
  .object({
    clinicId: z.string().trim().min(1).max(80),
    ageBand: z.enum(BOOKING_AGE_BANDS),
    preferredDate: isoDate,
    preferredWindow: z.enum(BOOKING_WINDOWS),
    service: z.enum(CLINIC_SERVICE_CATEGORIES).optional(),
    contactPreference: z.enum(BOOKING_CONTACT_PREFERENCES).optional(),
    notes: z.string().trim().max(500).optional(),
    acknowledgedDisclosure: z.literal(true),
  })
  .strict();
export type BookingCreateRequest = z.infer<typeof BookingCreateRequestSchema>;

const ClinicRefSchema = z.object({ name: z.string(), slug: z.string(), isDemo: z.boolean() }).strict();

/** 201: the ONLY response that ever carries the access secret. */
export const BookingCreatedSchema = z
  .object({
    status: z.literal('pending'),
    /** Always true: this is a request, not a confirmed appointment. */
    requestOnly: z.literal(true),
    demo: z.boolean(),
    demoMinorFlow: z.boolean(),
    reference: z.string().regex(BOOKING_REFERENCE_RE),
    /** Shown once. 256-bit CSPRNG value, base64url. Not recoverable: only a hash is stored. */
    secret: z.string().min(32).max(128),
    clinic: ClinicRefSchema,
    createdAt: z.string(),
  })
  .strict();
export type BookingCreated = z.infer<typeof BookingCreatedSchema>;

/** 200: the same Idempotency-Key and body was already processed. The secret is NOT included and cannot be re-shown. */
export const BookingReplaySchema = z
  .object({
    alreadyCreated: z.literal(true),
    status: z.enum(BOOKING_STATUSES),
    requestOnly: z.literal(true),
    demo: z.boolean(),
    reference: z.string().regex(BOOKING_REFERENCE_RE),
    clinic: ClinicRefSchema,
  })
  .strict();
export type BookingReplay = z.infer<typeof BookingReplaySchema>;

export const BookingCreateResponseSchema = z.union([BookingCreatedSchema, BookingReplaySchema]);
export type BookingCreateResponse = z.infer<typeof BookingCreateResponseSchema>;

/** Body of POST /api/v1/public/booking-requests/lookup. Shapes are loose on purpose: every mismatch is the same generic failure. */
export const BookingLookupRequestSchema = z
  .object({ reference: z.string().min(1).max(64), secret: z.string().min(1).max(128) })
  .strict();
export type BookingLookupRequest = z.infer<typeof BookingLookupRequestSchema>;

/** 200 lookup: status, clinic name and clinic-supplied notes only. The submitted preferences are not echoed. */
export const BookingLookupResponseSchema = z
  .object({
    reference: z.string(),
    status: z.enum(BOOKING_STATUSES),
    requestOnly: z.literal(true),
    demo: z.boolean(),
    clinic: ClinicRefSchema,
    clinicNote: z.string().nullable(),
    visitInstructions: z.string().nullable(),
    updatedAt: z.string(),
  })
  .strict();
export type BookingLookupResponse = z.infer<typeof BookingLookupResponseSchema>;
