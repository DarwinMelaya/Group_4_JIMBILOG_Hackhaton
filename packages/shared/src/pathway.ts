import { z } from 'zod';
import { MUNICIPALITIES, VERIFICATION_STATUSES, VERIFICATION_FRESHNESS, VERIFICATION_LEVELS } from './clinics.js';

/**
 * Pathway concerns (master prompt F03 / section 9). Order in the request is the user's priority order.
 * Mapping to documented clinic facts:
 *  privacy -> confidentiality_explained, reduced_disclosure_booking
 *  cost -> a verified free/low fee tier
 *  distance -> clinic is in the selected municipality
 *  youth_friendly -> youth_friendly; minors_info -> minors_information; procedure -> procedure_explained
 */
export const PATHWAY_CONCERNS = ['privacy', 'cost', 'distance', 'youth_friendly', 'minors_info', 'procedure'] as const;
export type PathwayConcern = (typeof PATHWAY_CONCERNS)[number];

/**
 * Body of POST /api/v1/public/pathway/match. Strict: unknown keys are rejected, so identifiers (names, contacts,
 * ages, symptoms, ...) cannot be sent by accident. The body is never stored or logged.
 */
export const PathwayMatchRequestSchema = z
  .object({
    concerns: z
      .array(z.enum(PATHWAY_CONCERNS))
      .max(PATHWAY_CONCERNS.length)
      .refine((c) => new Set(c).size === c.length, 'concerns must be unique')
      .optional(),
    municipality: z.enum(MUNICIPALITIES).optional(),
    urgentExposureWithin72h: z.boolean().optional(),
  })
  .strict();
export type PathwayMatchRequest = z.infer<typeof PathwayMatchRequestSchema>;

export const MATCH_ATTRIBUTE_STATES = ['met', 'unknown', 'not_met'] as const;

/** One fact consulted for a concern, with its verification state (so "Not confirmed" can be shown honestly). */
export const MatchAttributeSchema = z
  .object({
    attribute: z.string(),
    verification: z.enum(VERIFICATION_STATUSES),
    confirmed: z.boolean(),
  })
  .strict();

export const MatchConcernResultSchema = z
  .object({
    concern: z.enum(PATHWAY_CONCERNS),
    state: z.enum(MATCH_ATTRIBUTE_STATES),
    attributes: z.array(MatchAttributeSchema),
  })
  .strict();
export type MatchConcernResult = z.infer<typeof MatchConcernResultSchema>;

export const MatchedClinicSchema = z
  .object({
    rank: z.number().int().min(1),
    clinicId: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    isDemo: z.boolean(),
    municipality: z.enum(MUNICIPALITIES),
    profilePath: z.string(),
    verification: z
      .object({
        level: z.enum(VERIFICATION_LEVELS),
        lastVerifiedAt: z.string().nullable(),
        freshness: z.enum(VERIFICATION_FRESHNESS),
      })
      .strict(),
    metCount: z.number().int(),
    unknownCount: z.number().int(),
    /** "Why this clinic may fit": verified positive facts only. */
    whyMayFit: z.array(MatchConcernResultSchema),
    /** "What remains unknown": shown as "We could not verify this detail", never as safe. */
    remainsUnknown: z.array(MatchConcernResultSchema),
    /** Concerns the documented facts say are not met. */
    notMet: z.array(MatchConcernResultSchema),
  })
  .strict();
export type MatchedClinic = z.infer<typeof MatchedClinicSchema>;

export const RANKING_BASIS = 'priority_weighted_concerns_met_then_fewer_unknowns_then_recent_verification_then_name' as const;

export const PathwayRankedResponseSchema = z
  .object({
    mode: z.literal('ranked'),
    urgent: z.literal(false),
    appliedFilters: z
      .object({
        municipality: z.enum(MUNICIPALITIES).nullable(),
        concerns: z.array(z.enum(PATHWAY_CONCERNS)),
        /** Concerns that could not be evaluated (e.g. distance without a municipality). */
        notEvaluated: z.array(z.enum(PATHWAY_CONCERNS)),
      })
      .strict(),
    rankingBasis: z.literal(RANKING_BASIS),
    /** Deterministic ordering, not a medical score or a guarantee of suitability. */
    notMedicalAdvice: z.literal(true),
    matches: z.array(MatchedClinicSchema),
    /** Present when there are no matches: points to the wider directory. */
    fallback: z.object({ kind: z.literal('browse_all_clinics'), path: z.string() }).strict().nullable(),
  })
  .strict();
export type PathwayRankedResponse = z.infer<typeof PathwayRankedResponseSchema>;

/**
 * Urgent bypass (possible HIV exposure within 72 hours): no ranking, no clinic matching, no diagnosis, no treatment
 * advice and NO contact details (none are invented). Points to the urgent professional-assessment article.
 */
export const PathwayUrgentResponseSchema = z
  .object({
    mode: z.literal('urgent'),
    urgent: z.literal(true),
    guidance: z
      .object({
        kind: z.literal('urgent_professional_assessment'),
        articleSlug: z.string(),
        articlePath: z.string(),
        message: z.object({ en: z.string(), fil: z.string() }).strict(),
        /** Draft copy: needs qualified clinical review (and Filipino linguistic review) before real use. */
        clinicalReview: z.literal('unreviewed'),
        /** Always empty: contact details are never invented. */
        contacts: z.tuple([]),
      })
      .strict(),
  })
  .strict();
export type PathwayUrgentResponse = z.infer<typeof PathwayUrgentResponseSchema>;

export const PathwayMatchResponseSchema = z.discriminatedUnion('mode', [PathwayRankedResponseSchema, PathwayUrgentResponseSchema]);
export type PathwayMatchResponse = z.infer<typeof PathwayMatchResponseSchema>;

