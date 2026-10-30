import { z } from 'zod';
import { ARTICLE_REVIEW_STATES, type ArticleReviewState } from './articles.js';
import { CLINIC_PUBLISH_STATUSES, VERIFICATION_STATUSES } from './clinics.js';
import { LOCALES } from './locales.js';
import { STAFF_ROLES, type StaffRole } from './staff.js';

/**
 * Governance contract (S7-1): partner verification evidence, per-locale editorial review, staff role management,
 * minor-SOP clinic mapping and the safe configuration view. All routes live under /api/v1/admin/* and require a staff
 * session; writes also require the CSRF header. Role handling in this prototype:
 *  - provincial_admin acts as BOTH the content editor and the medical-review recorder (no separate editor role exists
 *    yet; a real pilot should add `content_reviewer` per the master prompt and an authorised human medical reviewer).
 *  - technical_admin has read-only access to clinic governance, may manage staff, and sees the safe configuration.
 */

// ---- Roles -----------------------------------------------------------------------------------------------------------

/** Authority rank. A role can only grant roles at or below what its table row allows (see GRANTABLE_ROLES). */
export const ROLE_RANK: Readonly<Record<StaffRole, number>> = {
  clinic_staff: 1,
  clinic_admin: 2,
  provincial_admin: 3,
  technical_admin: 4,
};

/** Roles each role may hand out (invites and memberships). Nobody can grant above their own rank. */
export const GRANTABLE_ROLES: Readonly<Record<StaffRole, readonly StaffRole[]>> = {
  clinic_staff: [],
  clinic_admin: ['clinic_staff'],
  provincial_admin: ['clinic_staff', 'clinic_admin', 'provincial_admin'],
  technical_admin: ['clinic_staff', 'clinic_admin', 'provincial_admin', 'technical_admin'],
};

export function canGrantRole(actor: StaffRole, target: StaffRole): boolean {
  return GRANTABLE_ROLES[actor].includes(target);
}

export const CLINIC_LEVEL_ROLES = ['clinic_staff', 'clinic_admin'] as const;
export const ADMIN_LEVEL_ROLES = ['provincial_admin', 'technical_admin'] as const;

const uuid = z.string().uuid();
const isoDateTime = z.string().datetime({ offset: true });
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'not a real calendar date');

/** An identifier or document reference, never file contents: short, single line, a restricted character set. */
export const EVIDENCE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._:/#-]{2,119}$/;
const evidenceReference = z.string().trim().regex(EVIDENCE_REFERENCE_PATTERN, 'use a document identifier (letters, digits and . _ : / # -), 3 to 120 characters');

// ---- Partner verification evidence -----------------------------------------------------------------------------------

export const EVIDENCE_TYPES = ['partnership_agreement', 'service_confirmation', 'fee_confirmation', 'privacy_practice_confirmation'] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export const EVIDENCE_STATUSES = ['pending', 'accepted', 'rejected', 'expired'] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

/** Evidence of this type must be accepted and unexpired before a non-demo clinic can be published. */
export const PUBLISH_REQUIRED_EVIDENCE: EvidenceType = 'partnership_agreement';

export const EvidenceCreateSchema = z
  .object({ evidenceType: z.enum(EVIDENCE_TYPES), evidenceReference: evidenceReference, expiresAt: isoDateTime })
  .strict();
export type EvidenceCreate = z.infer<typeof EvidenceCreateSchema>;

export const EvidenceReviewSchema = z.object({ decision: z.enum(['accept', 'reject']) }).strict();
export type EvidenceReview = z.infer<typeof EvidenceReviewSchema>;

export const EvidenceSchema = z
  .object({
    id: uuid,
    clinicId: uuid,
    evidenceType: z.enum(EVIDENCE_TYPES),
    evidenceReference: z.string(),
    status: z.enum(EVIDENCE_STATUSES),
    verifiedBy: uuid.nullable(),
    verifiedAt: z.string().nullable(),
    expiresAt: z.string(),
    createdAt: z.string(),
  })
  .strict();
export type Evidence = z.infer<typeof EvidenceSchema>;
export const EvidenceListSchema = z.object({ items: z.array(EvidenceSchema) }).strict();

// ---- Clinic verification and publish status --------------------------------------------------------------------------

/** `demo_fictitious` is reserved for DEMO clinics and cannot be set through the API. */
export const SETTABLE_VERIFICATION_LEVELS = ['unverified', 'provider_confirmed', 'verified_real'] as const;

function isPlainLine(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (ch === '<' || ch === '>' || c < 0x20 || c === 0x7f) return false;
  }
  return true;
}

const sourceText = z.string().trim().min(1).max(300).refine(isPlainLine, 'plain single-line text only');

export const ClinicVerificationUpdateSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    addressVerification: z.enum(VERIFICATION_STATUSES).optional(),
    contactVerification: z.enum(VERIFICATION_STATUSES).optional(),
    verificationLevel: z.enum(SETTABLE_VERIFICATION_LEVELS).optional(),
    verificationSource: sourceText.optional(),
  })
  .strict()
  .refine(
    (v) => v.addressVerification !== undefined || v.contactVerification !== undefined || v.verificationLevel !== undefined,
    'change at least one verification field',
  )
  .refine(
    (v) =>
      !(v.addressVerification === 'verified' || v.contactVerification === 'verified' || (v.verificationLevel !== undefined && v.verificationLevel !== 'unverified')) ||
      v.verificationSource !== undefined,
    'a verification source is required when marking something verified',
  );
export type ClinicVerificationUpdate = z.infer<typeof ClinicVerificationUpdateSchema>;

export const ClinicPublishUpdateSchema = z.object({ expectedVersion: z.number().int().min(1), status: z.enum(CLINIC_PUBLISH_STATUSES) }).strict();
export type ClinicPublishUpdate = z.infer<typeof ClinicPublishUpdateSchema>;

export const AdminClinicSchema = z
  .object({
    id: uuid,
    slug: z.string(),
    name: z.string(),
    isDemo: z.boolean(),
    municipality: z.string(),
    status: z.enum(CLINIC_PUBLISH_STATUSES),
    verificationLevel: z.string(),
    verificationSource: z.string().nullable(),
    addressVerification: z.enum(VERIFICATION_STATUSES),
    contactVerification: z.enum(VERIFICATION_STATUSES),
    lastVerifiedAt: z.string().nullable(),
    version: z.number().int(),
    validEvidenceCount: z.number().int(),
    hasPublishEvidence: z.boolean(),
  })
  .strict();
export type AdminClinic = z.infer<typeof AdminClinicSchema>;
export const AdminClinicListSchema = z.object({ items: z.array(AdminClinicSchema) }).strict();

// ---- Editorial review lifecycle (per locale) -------------------------------------------------------------------------


/**
 * Per-locale review moves. Reviewer and date are recorded on the move into `medically_reviewed`; moving back to `draft`
 * or `in_review` clears them so a stale approval can never be re-published. Locales never inherit each other's state.
 */
export const ARTICLE_REVIEW_TRANSITIONS: Readonly<Record<ArticleReviewState, readonly ArticleReviewState[]>> = {
  draft: ['in_review'],
  in_review: ['draft', 'medically_reviewed'],
  medically_reviewed: ['in_review', 'published'],
  published: ['in_review'],
};

export function canReviewTransition(from: ArticleReviewState, to: ArticleReviewState): boolean {
  return ARTICLE_REVIEW_TRANSITIONS[from].includes(to);
}

/** A reviewer must be a named human professional: reject labels that look like an automated or self-certifying actor. */
const AUTOMATED_REVIEWER = /\b(ai|a\.i\.|bot|llm|gpt|claude|anthropic|assistant|chatbot|automated|system|kalinga)\b/i;
export const ReviewerNameSchema = z
  .string()
  .trim()
  .regex(/^\p{L}[\p{L} .,'’-]{1,119}$/u, 'a person name: letters, spaces and . , \' -')
  .refine((s) => !AUTOMATED_REVIEWER.test(s), 'a medical reviewer must be a named human professional');

export const ArticleTransitionSchema = z
  .object({
    to: z.enum(ARTICLE_REVIEW_STATES),
    expectedVersion: z.number().int().min(1),
    reviewerName: ReviewerNameSchema.optional(),
    reviewedOn: isoDate.optional(),
  })
  .strict()
  .refine((v) => v.to !== 'medically_reviewed' || (v.reviewerName !== undefined && v.reviewedOn !== undefined), {
    message: 'reviewerName and reviewedOn are required to record a medical review',
  })
  .refine((v) => v.to === 'medically_reviewed' || (v.reviewerName === undefined && v.reviewedOn === undefined), {
    message: 'reviewerName and reviewedOn belong to the medically_reviewed move only',
  });
export type ArticleTransition = z.infer<typeof ArticleTransitionSchema>;

export const AdminArticleLocalizationSchema = z
  .object({
    locale: z.enum(LOCALES),
    title: z.string(),
    reviewState: z.enum(ARTICLE_REVIEW_STATES),
    reviewerName: z.string().nullable(),
    medicallyReviewedAt: z.string().nullable(),
    version: z.number().int(),
    allowedTransitions: z.array(z.enum(ARTICLE_REVIEW_STATES)),
  })
  .strict();
export const AdminArticleSchema = z
  .object({
    id: uuid,
    slug: z.string(),
    topic: z.string(),
    contentOrigin: z.enum(['editorial', 'demo']),
    isUrgent: z.boolean(),
    localizations: z.array(AdminArticleLocalizationSchema),
  })
  .strict();
export type AdminArticle = z.infer<typeof AdminArticleSchema>;
export const AdminArticleListSchema = z.object({ items: z.array(AdminArticleSchema) }).strict();

// ---- Staff invites, memberships, deactivation ------------------------------------------------------------------------

export const INVITE_TTL_HOURS = 72;
export const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const InviteCreateSchema = z
  .object({
    email: z.string().trim().toLowerCase().min(3).max(200).regex(/^[^@\s]+@[^@\s]+$/, 'not an e-mail address'),
    role: z.enum(STAFF_ROLES),
    /** Required for clinic-level roles; must be absent for provincial/technical admins. */
    clinicId: uuid.optional(),
  })
  .strict()
  .refine((v) => (v.role === 'clinic_staff' || v.role === 'clinic_admin' ? v.clinicId !== undefined : v.clinicId === undefined), {
    message: 'clinic roles need a clinicId; admin roles must not carry one',
  });
export type InviteCreate = z.infer<typeof InviteCreateSchema>;

export const InviteCreatedSchema = z
  .object({
    id: uuid,
    email: z.string(),
    role: z.enum(STAFF_ROLES),
    clinicId: uuid.nullable(),
    expiresAt: z.string(),
    /** Shown ONCE (mock delivery, DEMO/dev only). Never stored in clear, never logged, never audited. */
    inviteCode: z.string().regex(INVITE_CODE_PATTERN),
  })
  .strict();
export type InviteCreated = z.infer<typeof InviteCreatedSchema>;

export const InviteSummarySchema = z
  .object({
    id: uuid,
    email: z.string(),
    role: z.enum(STAFF_ROLES),
    clinicId: uuid.nullable(),
    expiresAt: z.string(),
    state: z.enum(['pending', 'used', 'expired', 'revoked']),
  })
  .strict();
export type InviteSummary = z.infer<typeof InviteSummarySchema>;
export const InviteListSchema = z.object({ items: z.array(InviteSummarySchema) }).strict();

export const InviteRedeemSchema = z
  .object({
    code: z.string().regex(INVITE_CODE_PATTERN),
    email: z.string().trim().toLowerCase().min(3).max(200),
    displayName: z.string().trim().min(1).max(100).refine(isPlainLine, 'plain text only'),
    password: z.string().min(12).max(200),
  })
  .strict();
export type InviteRedeem = z.infer<typeof InviteRedeemSchema>;

export const MembershipAssignSchema = z.object({ clinicId: uuid, role: z.enum(CLINIC_LEVEL_ROLES) }).strict();
export type MembershipAssign = z.infer<typeof MembershipAssignSchema>;

export const StaffAdminUserSchema = z
  .object({
    id: uuid,
    email: z.string(),
    displayName: z.string(),
    role: z.enum(STAFF_ROLES),
    active: z.boolean(),
    isDemo: z.boolean(),
    memberships: z.array(z.object({ clinicId: uuid, clinicSlug: z.string(), role: z.enum(CLINIC_LEVEL_ROLES), active: z.boolean() }).strict()),
  })
  .strict();
export type StaffAdminUser = z.infer<typeof StaffAdminUserSchema>;
export const StaffAdminListSchema = z.object({ items: z.array(StaffAdminUserSchema) }).strict();

// ---- Minor SOP clinic mapping (evidence-gated; recording a mapping does NOT enable booking) -------------------------

export const MinorSopMappingCreateSchema = z
  .object({
    sopArtifactReference: evidenceReference,
    sopVersion: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/),
    approvedBy: ReviewerNameSchema,
    approvedAt: isoDate,
    effectiveFrom: isoDate,
  })
  .strict()
  .refine((v) => v.effectiveFrom >= v.approvedAt, { message: 'effectiveFrom cannot be before approvedAt', path: ['effectiveFrom'] });
export type MinorSopMappingCreate = z.infer<typeof MinorSopMappingCreateSchema>;

export const MinorSopMappingSchema = z
  .object({
    id: uuid,
    clinicId: uuid,
    sopArtifactReference: z.string(),
    sopVersion: z.string(),
    approvedBy: z.string(),
    approvedAt: z.string(),
    effectiveFrom: z.string(),
    status: z.enum(['recorded', 'revoked']),
    createdAt: z.string(),
  })
  .strict();
export type MinorSopMapping = z.infer<typeof MinorSopMappingSchema>;
export const MinorSopMappingListSchema = z.object({ items: z.array(MinorSopMappingSchema) }).strict();

/** The two flags are literal `false` in this prototype: env.ts refuses to start with the real-minor flag on. */
export const MinorBookingReadinessSchema = z
  .object({
    mappingPresent: z.boolean(),
    mappingCount: z.number().int(),
    envEnabled: z.literal(false),
    realMinorBookingActive: z.literal(false),
    blockedBy: z.array(z.string()),
  })
  .strict();
export type MinorBookingReadiness = z.infer<typeof MinorBookingReadinessSchema>;

// ---- Safe configuration view -------------------------------------------------------------------------------------------

export const AdminConfigSchema = z
  .object({
    apiVersion: z.literal('v1'),
    nodeEnv: z.enum(['development', 'test', 'staging', 'production']),
    demoMode: z.boolean(),
    notificationTransport: z.literal('mock'),
    realNotificationsEnabled: z.literal(false),
    realBookingRequestsEnabled: z.literal(false),
    realMinorBookingEnabled: z.literal(false),
    clinicalContentApproved: z.boolean(),
    bookingKeyConfigured: z.boolean(),
    persistentStorage: z.boolean(),
  })
  .strict();
export type AdminConfig = z.infer<typeof AdminConfigSchema>;
