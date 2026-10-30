import { useQuery } from '@tanstack/react-query';
import {
  BookingConfigSchema,
  BookingCreateResponseSchema,
  BookingLookupResponseSchema,
  ReminderPreferenceResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  type BookingConfig,
  type BookingCreateRequest,
  type BookingCreateResponse,
  type BookingLookupRequest,
  type BookingLookupResponse,
  type ReminderPreferenceRequest,
  type ReminderPreferenceResponse,
} from '@kalinga/shared';
import { apiGet, apiPost, queryClient } from './client';

/** Per-clinic request config. Public and secret-free, but never cached for long: it carries today's date window. */
export function bookingConfigQuery(idOrSlug: string) {
  return {
    queryKey: ['booking-config', idOrSlug] as const,
    queryFn: ({ signal }: { signal: AbortSignal }): Promise<BookingConfig> =>
      apiGet(`/public/clinics/${encodeURIComponent(idOrSlug)}/booking-config`, BookingConfigSchema, signal),
    staleTime: 30_000,
    retry: false,
  };
}

export function useBookingConfig(idOrSlug: string) {
  return useQuery(bookingConfigQuery(idOrSlug), queryClient);
}

/** A random idempotency key (>= 16 chars of [A-Za-z0-9_-]). Falls back to getRandomValues where randomUUID is absent. */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = c.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Creates a booking request. The result (reference + one-time secret) is returned to the caller and is held ONLY in
 * component state: deliberately NOT a TanStack mutation, so it is never in a shared cache, the URL or any storage.
 */
export function createBookingRequest(body: BookingCreateRequest, idempotencyKey: string, signal?: AbortSignal): Promise<BookingCreateResponse> {
  return apiPost('/public/booking-requests', body, BookingCreateResponseSchema, signal, { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey });
}

/** POST-only lookup: the reference and secret travel in the body, never in the URL. */
export function lookupBookingRequest(body: BookingLookupRequest, signal?: AbortSignal): Promise<BookingLookupResponse> {
  return apiPost('/public/booking-requests/lookup', body, BookingLookupResponseSchema, signal);
}

/**
 * Opt in/out of the neutral DEMO mock reminders. Same proof as the status lookup (reference + secret in the body only);
 * the result carries no reference or secret and is never cached.
 */
export function setReminderPreference(body: ReminderPreferenceRequest, signal?: AbortSignal): Promise<ReminderPreferenceResponse> {
  return apiPost('/public/booking-requests/reminders', body, ReminderPreferenceResponseSchema, signal);
}
