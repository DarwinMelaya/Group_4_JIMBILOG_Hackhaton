import { z } from 'zod';
import { LOCALES } from './locales.js';

/**
 * Opt-in NEUTRAL reminders (master prompt F08, S8-1). Delivery is a DEMO mock only: nothing is sent to a real phone or
 * mailbox, and no real contact detail is collected. A reminder carries no clinic, service, date, reference or health
 * wording; it only tells the person to open the app.
 */
export const REMINDER_CHANNELS = ['mock_sms', 'mock_email'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export const REMINDER_KINDS = ['visit_reminder'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const REMINDER_OUTBOX_STATUSES = ['queued', 'sent', 'failed', 'suppressed'] as const;
export type ReminderOutboxStatus = (typeof REMINDER_OUTBOX_STATUSES)[number];

/** Delivery is retried at most this many times in total (attempts, not retries). */
export const REMINDER_MAX_ATTEMPTS = 3;

/**
 * Body of POST /api/v1/public/booking-requests/reminders. The SAME reference + secret as the status lookup authenticates
 * it. `channel` is required to opt in. No phone number or e-mail address is accepted (unknown keys are rejected).
 */
export const ReminderPreferenceRequestSchema = z
  .object({
    reference: z.string().min(1).max(64),
    secret: z.string().min(1).max(128),
    optIn: z.boolean(),
    channel: z.enum(REMINDER_CHANNELS).optional(),
    locale: z.enum(LOCALES).optional(),
  })
  .strict()
  .refine((b) => !b.optIn || b.channel !== undefined, { message: 'channel is required to opt in', path: ['channel'] });
export type ReminderPreferenceRequest = z.infer<typeof ReminderPreferenceRequestSchema>;

/** 200 response. `mock` is always true: it is the DEMO mock transport, never a real message. */
export const ReminderPreferenceResponseSchema = z
  .object({
    optedIn: z.boolean(),
    channel: z.enum(REMINDER_CHANNELS).nullable(),
    mock: z.literal(true),
    demo: z.boolean(),
    /** Reminders queued by this call (only when the request is already confirmed). */
    queued: z.number().int().min(0),
    /** Reminders cancelled by this call (opt-out). */
    suppressed: z.number().int().min(0),
  })
  .strict();
export type ReminderPreferenceResponse = z.infer<typeof ReminderPreferenceResponseSchema>;

/** GET /api/v1/dev/outbox (DEMO + development/test only). Records of what the MOCK transport recorded; nothing was delivered. */
export const DevOutboxItemSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(REMINDER_KINDS),
    channel: z.enum(REMINDER_CHANNELS),
    status: z.enum(REMINDER_OUTBOX_STATUSES),
    scheduledFor: z.string(),
    attempts: z.number().int().min(0),
    nextAttemptAt: z.string().nullable(),
    lastErrorCode: z.string().nullable(),
    sentAt: z.string().nullable(),
    locale: z.enum(LOCALES),
    renderedText: z.string(),
    demoDestination: z.string(),
  })
  .strict();
export type DevOutboxItem = z.infer<typeof DevOutboxItemSchema>;

export const DevOutboxResponseSchema = z
  .object({
    mock: z.literal(true),
    notice: z.string(),
    items: z.array(DevOutboxItemSchema),
  })
  .strict();
export type DevOutboxResponse = z.infer<typeof DevOutboxResponseSchema>;
