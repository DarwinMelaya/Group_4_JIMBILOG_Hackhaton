import { z } from 'zod';

/** Marinduque's six municipalities (the only values the schema accepts). */
export const MUNICIPALITIES = ['Boac', 'Buenavista', 'Gasan', 'Mogpog', 'Santa Cruz', 'Torrijos'] as const;
export type Municipality = (typeof MUNICIPALITIES)[number];

/** Mirrors the Postgres enum `verification_status`. `unknown` and `unverified` are NEVER treated as confirmed. */
export const VERIFICATION_STATUSES = ['verified', 'unknown', 'unverified'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const CLINIC_SERVICE_CATEGORIES = ['hiv_testing', 'sti_testing', 'counselling', 'treatment_followup', 'referral'] as const;
export type ClinicServiceCategory = (typeof CLINIC_SERVICE_CATEGORIES)[number];

export const SERVICE_AVAILABILITIES = ['available', 'unavailable', 'unknown'] as const;
export const FEE_TIERS = ['free', 'low', 'standard', 'unknown'] as const;
export type FeeTier = (typeof FEE_TIERS)[number];

export const PRIVACY_PRACTICE_KEYS = [
  'confidentiality_explained',
  'reduced_disclosure_booking',
  'youth_friendly',
  'procedure_explained',
  'minors_information',
] as const;
export type PrivacyPracticeKey = (typeof PRIVACY_PRACTICE_KEYS)[number];

export const PRACTICE_STATUSES = ['confirmed', 'unknown', 'not_supported'] as const;
export const VERIFICATION_LEVELS = ['demo_fictitious', 'unverified', 'provider_confirmed', 'verified_real'] as const;
export const CLINIC_PUBLISH_STATUSES = ['draft', 'in_review', 'published', 'unpublished'] as const;

/** Verification older than this many days is reported as `stale`. */
export const VERIFICATION_STALE_AFTER_DAYS = 180;
export const VERIFICATION_FRESHNESS = ['recent', 'stale', 'never'] as const;
export type VerificationFreshness = (typeof VERIFICATION_FRESHNESS)[number];

/** A clinic id or slug (lowercase slug or UUID). */
export const ClinicIdParamSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** Query for GET /api/v1/public/clinics. Narrow allowlist; repeated params are rejected. */
export const ClinicListQuerySchema = z.object({
  municipality: z.enum(MUNICIPALITIES).optional(),
  service: z.enum(CLINIC_SERVICE_CATEGORIES).optional(),
  feeTier: z.enum(['free', 'low', 'standard']).optional(),
  /** Only clinics whose practice is confirmed AND verified. */
  privacy: z.enum(PRIVACY_PRACTICE_KEYS).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ClinicListQuery = z.infer<typeof ClinicListQuerySchema>;

const isoDateTime = z.string().nullable();

export const ClinicServiceSchema = z
  .object({
    category: z.enum(CLINIC_SERVICE_CATEGORIES),
    availability: z.enum(SERVICE_AVAILABILITIES),
    verification: z.enum(VERIFICATION_STATUSES),
    verifiedAt: isoDateTime,
    fee: z
      .object({
        tier: z.enum(FEE_TIERS),
        minPhp: z.number().nullable(),
        maxPhp: z.number().nullable(),
        note: z.string().nullable(),
        verification: z.enum(VERIFICATION_STATUSES),
        verifiedAt: isoDateTime,
      })
      .strict(),
  })
  .strict();
export type ClinicService = z.infer<typeof ClinicServiceSchema>;

export const ClinicPracticeSchema = z
  .object({
    key: z.enum(PRIVACY_PRACTICE_KEYS),
    status: z.enum(PRACTICE_STATUSES),
    verification: z.enum(VERIFICATION_STATUSES),
    /** True only for status=confirmed AND verification=verified. Everything else is displayed as "Not confirmed". */
    confirmed: z.boolean(),
    verifiedAt: isoDateTime,
  })
  .strict();
export type ClinicPractice = z.infer<typeof ClinicPracticeSchema>;

export const ClinicVerificationSchema = z
  .object({
    level: z.enum(VERIFICATION_LEVELS),
    source: z.string().nullable(),
    lastVerifiedAt: isoDateTime,
    freshness: z.enum(VERIFICATION_FRESHNESS),
    staleAfterDays: z.number().int(),
  })
  .strict();

export const ClinicSummarySchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    /** Fictitious dev/test listing: the UI must show a DEMO label. */
    isDemo: z.boolean(),
    municipality: z.enum(MUNICIPALITIES),
    verification: ClinicVerificationSchema,
    services: z.array(ClinicServiceSchema),
    practices: z.array(ClinicPracticeSchema),
  })
  .strict();
export type ClinicSummary = z.infer<typeof ClinicSummarySchema>;

export const ClinicListResponseSchema = z
  .object({
    items: z.array(ClinicSummarySchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  })
  .strict();
export type ClinicListResponse = z.infer<typeof ClinicListResponseSchema>;

export const ClinicDetailSchema = ClinicSummarySchema.extend({
  description: z.string().nullable(),
  barangay: z.string().nullable(),
  address: z.object({ text: z.string().nullable(), verification: z.enum(VERIFICATION_STATUSES) }).strict(),
  contact: z
    .object({
      phone: z.string().nullable(),
      email: z.string().nullable(),
      note: z.string().nullable(),
      verification: z.enum(VERIFICATION_STATUSES),
    })
    .strict(),
  /** Machine-readable list of facts that are not confirmed, e.g. `practice:youth_friendly`, `service:hiv_testing`. */
  unknowns: z.array(z.string()),
}).strict();
export type ClinicDetail = z.infer<typeof ClinicDetailSchema>;
