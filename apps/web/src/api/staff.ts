import type { ZodType } from 'zod';
import {
  STAFF_CSRF_HEADER,
  StaffBookingDetailSchema,
  StaffBookingListSchema,
  StaffLoginResponseSchema,
  StaffMeSchema,
  type StaffBookingDetail,
  type StaffBookingList,
  type StaffBookingTransition,
  type StaffMe,
  type BookingStatus,
} from '@kalinga/shared';
import { API_BASE, ApiRequestError, httpError } from './client';

/**
 * Staff fetch layer (S6-3). Deliberately NOT built on TanStack Query: staff data must not sit in the shared query cache.
 *
 * - Cookie session (httpOnly, SameSite=Strict) is sent with `credentials: 'same-origin'`; the page never sees the token.
 * - The CSRF token comes from login and /me, is held only in the caller's memory and is passed in per request. It is
 *   never written to localStorage, sessionStorage, IndexedDB, a cookie or the URL.
 * - Every request is `cache: 'no-store'`. The service worker already bypasses /staff and /api.
 */
const STAFF_BASE = `${API_BASE}/staff`;

interface Options {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  csrf?: string;
  ifMatch?: number;
  signal?: AbortSignal;
}

async function request(path: string, opts: Options): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.csrf) headers[STAFF_CSRF_HEADER] = opts.csrf;
  if (opts.ifMatch !== undefined) headers['If-Match'] = `"${opts.ifMatch}"`;
  let res: Response;
  try {
    res = await fetch(`${STAFF_BASE}${path}`, {
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

export function staffLogin(email: string, password: string, signal?: AbortSignal): Promise<StaffMe> {
  return requestJson('/login', StaffLoginResponseSchema, { method: 'POST', body: { email, password }, signal });
}

export function staffMe(signal?: AbortSignal): Promise<StaffMe> {
  return requestJson('/me', StaffMeSchema, { signal });
}

export async function staffLogout(csrf: string): Promise<void> {
  await request('/logout', { method: 'POST', csrf });
}

export interface QueueQuery {
  status?: BookingStatus;
  limit: number;
  offset: number;
}

const clinicPath = (clinicId: string) => `/clinics/${encodeURIComponent(clinicId)}/booking-requests`;

export function listStaffRequests(clinicId: string, q: QueueQuery, signal?: AbortSignal): Promise<StaffBookingList> {
  const params = new URLSearchParams({ limit: String(q.limit), offset: String(q.offset) });
  if (q.status) params.set('status', q.status);
  return requestJson(`${clinicPath(clinicId)}?${params.toString()}`, StaffBookingListSchema, { signal });
}

export function getStaffRequest(clinicId: string, requestId: string, signal?: AbortSignal): Promise<StaffBookingDetail> {
  return requestJson(`${clinicPath(clinicId)}/${encodeURIComponent(requestId)}`, StaffBookingDetailSchema, { signal });
}

export function decideStaffRequest(
  clinicId: string,
  requestId: string,
  version: number,
  body: StaffBookingTransition,
  csrf: string,
): Promise<StaffBookingDetail> {
  return requestJson(`${clinicPath(clinicId)}/${encodeURIComponent(requestId)}/status`, StaffBookingDetailSchema, {
    method: 'PATCH',
    body,
    csrf,
    ifMatch: version,
  });
}
