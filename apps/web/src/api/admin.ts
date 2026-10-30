import { z as zod, type ZodType } from 'zod';
import {
  AdminClinicListSchema,
  AdminClinicSchema,
  AdminConfigSchema,
  AdminArticleListSchema,
  EvidenceListSchema,
  EvidenceSchema,
  InviteCreatedSchema,
  InviteListSchema,
  MinorBookingReadinessSchema,
  MinorSopMappingListSchema,
  MinorSopMappingSchema,
  STAFF_CSRF_HEADER,
  StaffAdminListSchema,
  type AdminClinic,
  type AdminConfig,
  type AdminArticle,
  type ArticleTransition,
  type ClinicPublishUpdate,
  type ClinicVerificationUpdate,
  type Evidence,
  type EvidenceCreate,
  type EvidenceReview,
  type InviteCreate,
  type InviteCreated,
  type InviteSummary,
  type MembershipAssign,
  type MinorBookingReadiness,
  type MinorSopMapping,
  type MinorSopMappingCreate,
  type StaffAdminUser,
} from '@kalinga/shared';
import { API_BASE, ApiRequestError, httpError } from './client';

/**
 * Admin fetch layer (S7-2). Same rules as ./staff: httpOnly cookie session, the CSRF token lives only in the caller's
 * memory and is passed per request, every request is `cache: 'no-store'`, nothing is written to browser storage and
 * nothing goes through the shared query cache. Optimistic concurrency uses `expectedVersion` in the request body.
 */
const ADMIN_BASE = `${API_BASE}/admin`;

const ArticleTransitionResultSchema = zod.object({
  slug: zod.string(),
  locale: zod.string(),
  reviewState: zod.string(),
  reviewerName: zod.string().nullable(),
  medicallyReviewedAt: zod.string().nullable(),
  version: zod.number().int(),
});
export type ArticleTransitionResult = zod.infer<typeof ArticleTransitionResultSchema>;
const DeactivateResultSchema = zod.object({ deactivated: zod.boolean(), sessionsRevoked: zod.number() });

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  csrf?: string;
  signal?: AbortSignal;
}

async function request(path: string, opts: Options): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.csrf) headers[STAFF_CSRF_HEADER] = opts.csrf;
  let res: Response;
  try {
    res = await fetch(`${ADMIN_BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch {
    throw new ApiRequestError('network');
  }
  if (!res.ok) throw await httpError(res);
  return res;
}

async function requestJson<T>(path: string, schema: ZodType<T>, opts: Options): Promise<T> {
  const res = await request(path, opts);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiRequestError('invalid-response');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiRequestError('invalid-response');
  return parsed.data;
}

const enc = encodeURIComponent;

export function getAdminConfig(signal?: AbortSignal, csrf?: string): Promise<AdminConfig> {
  return requestJson('/config', AdminConfigSchema, { signal, csrf });
}

export async function listAdminClinics(signal?: AbortSignal, csrf?: string): Promise<AdminClinic[]> {
  const res = await requestJson('/clinics', AdminClinicListSchema, { signal, csrf });
  return res.items;
}

export async function listEvidence(clinicId: string, signal?: AbortSignal, csrf?: string): Promise<Evidence[]> {
  const res = await requestJson(`/clinics/${enc(clinicId)}/evidence`, EvidenceListSchema, { signal, csrf });
  return res.items;
}

export function addEvidence(clinicId: string, body: EvidenceCreate, csrf: string, signal?: AbortSignal): Promise<Evidence> {
  return requestJson(`/clinics/${enc(clinicId)}/evidence`, EvidenceSchema, { method: 'POST', body, csrf, signal });
}

export function reviewEvidence(clinicId: string, evidenceId: string, body: EvidenceReview, csrf: string, signal?: AbortSignal): Promise<Evidence> {
  return requestJson(`/clinics/${enc(clinicId)}/evidence/${enc(evidenceId)}/review`, EvidenceSchema, { method: 'POST', body, csrf, signal });
}

export function updateClinicVerification(clinicId: string, body: ClinicVerificationUpdate, csrf: string, signal?: AbortSignal): Promise<AdminClinic> {
  return requestJson(`/clinics/${enc(clinicId)}/verification`, AdminClinicSchema, { method: 'PATCH', body, csrf, signal });
}

export function updateClinicStatus(clinicId: string, body: ClinicPublishUpdate, csrf: string, signal?: AbortSignal): Promise<AdminClinic> {
  return requestJson(`/clinics/${enc(clinicId)}/status`, AdminClinicSchema, { method: 'PATCH', body, csrf, signal });
}

export async function listAdminArticles(signal?: AbortSignal, csrf?: string): Promise<AdminArticle[]> {
  const res = await requestJson('/articles', AdminArticleListSchema, { signal, csrf });
  return res.items;
}

export function transitionArticle(slug: string, locale: string, body: ArticleTransition, csrf: string, signal?: AbortSignal): Promise<ArticleTransitionResult> {
  return requestJson(`/articles/${enc(slug)}/localizations/${enc(locale)}/transition`, ArticleTransitionResultSchema, { method: 'POST', body, csrf, signal });
}

export async function listStaffAdmin(signal?: AbortSignal, csrf?: string): Promise<StaffAdminUser[]> {
  const res = await requestJson('/staff', StaffAdminListSchema, { signal, csrf });
  return res.items;
}

export async function listInvites(signal?: AbortSignal, csrf?: string): Promise<InviteSummary[]> {
  const res = await requestJson('/staff/invites', InviteListSchema, { signal, csrf });
  return res.items;
}

export function createInvite(body: InviteCreate, csrf: string, signal?: AbortSignal): Promise<InviteCreated> {
  return requestJson('/staff/invites', InviteCreatedSchema, { method: 'POST', body, csrf, signal });
}

export function revokeInvite(inviteId: string, csrf: string, signal?: AbortSignal): Promise<void> {
  return request(`/staff/invites/${enc(inviteId)}/revoke`, { method: 'POST', csrf, signal }).then(() => {});
}

export function assignMembership(userId: string, body: MembershipAssign, csrf: string, signal?: AbortSignal): Promise<void> {
  return request(`/staff/${enc(userId)}/memberships`, { method: 'POST', body, csrf, signal }).then(() => {});
}

export function removeMembership(userId: string, clinicId: string, csrf: string, signal?: AbortSignal): Promise<void> {
  return request(`/staff/${enc(userId)}/memberships/${enc(clinicId)}`, { method: 'DELETE', csrf, signal }).then(() => {});
}

export function deactivateUser(userId: string, csrf: string, signal?: AbortSignal): Promise<{ deactivated: boolean; sessionsRevoked: number }> {
  return requestJson(`/staff/${enc(userId)}/deactivate`, DeactivateResultSchema, { method: 'POST', csrf, signal });
}

export function minorReadiness(clinicId?: string, signal?: AbortSignal, csrf?: string): Promise<MinorBookingReadiness> {
  const q = clinicId ? `?clinicId=${enc(clinicId)}` : '';
  return requestJson(`/minor-booking-readiness${q}`, MinorBookingReadinessSchema, { signal, csrf });
}

export async function listMinorMappings(clinicId: string, signal?: AbortSignal, csrf?: string): Promise<MinorSopMapping[]> {
  const res = await requestJson(`/clinics/${enc(clinicId)}/minor-sop-mappings`, MinorSopMappingListSchema, { signal, csrf });
  return res.items;
}

export function recordMinorMapping(clinicId: string, body: MinorSopMappingCreate, csrf: string, signal?: AbortSignal): Promise<MinorSopMapping> {
  return requestJson(`/clinics/${enc(clinicId)}/minor-sop-mappings`, MinorSopMappingSchema, { method: 'POST', body, csrf, signal });
}

export function revokeMinorMapping(clinicId: string, mappingId: string, csrf: string, signal?: AbortSignal): Promise<MinorSopMapping> {
  return requestJson(`/clinics/${enc(clinicId)}/minor-sop-mappings/${enc(mappingId)}/revoke`, MinorSopMappingSchema, { method: 'POST', csrf, signal });
}
