import { useQuery } from '@tanstack/react-query';
import {
  ClinicDetailSchema,
  ClinicListResponseSchema,
  type ClinicDetail,
  type ClinicListQuery,
  type ClinicListResponse,
} from '@kalinga/shared';
import { apiGet, queryClient } from './client';

/** Only filter values the user picked are sent (never free-form personal data). */
export type ClinicFilters = Partial<Pick<ClinicListQuery, 'municipality' | 'service' | 'feeTier' | 'privacy' | 'q'>>;

export function clinicsQuery(f: ClinicFilters) {
  const params = new URLSearchParams();
  if (f.municipality) params.set('municipality', f.municipality);
  if (f.service) params.set('service', f.service);
  if (f.feeTier) params.set('feeTier', f.feeTier);
  if (f.privacy) params.set('privacy', f.privacy);
  if (f.q) params.set('q', f.q);
  const qs = params.toString();
  return {
    queryKey: ['clinics', f.municipality ?? null, f.service ?? null, f.feeTier ?? null, f.privacy ?? null, f.q ?? null] as const,
    queryFn: ({ signal }: { signal: AbortSignal }): Promise<ClinicListResponse> =>
      apiGet(`/public/clinics${qs ? `?${qs}` : ''}`, ClinicListResponseSchema, signal),
  };
}

export function clinicQuery(idOrSlug: string) {
  return {
    queryKey: ['clinic', idOrSlug] as const,
    queryFn: ({ signal }: { signal: AbortSignal }): Promise<ClinicDetail> =>
      apiGet(`/public/clinics/${encodeURIComponent(idOrSlug)}`, ClinicDetailSchema, signal),
  };
}

export function useClinics(filters: ClinicFilters) {
  return useQuery(clinicsQuery(filters), queryClient);
}

export function useClinic(idOrSlug: string) {
  return useQuery(clinicQuery(idOrSlug), queryClient);
}
