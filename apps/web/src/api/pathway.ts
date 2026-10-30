import { useMutation } from '@tanstack/react-query';
import { PathwayMatchResponseSchema, type PathwayMatchRequest, type PathwayMatchResponse } from '@kalinga/shared';
import { apiPost, queryClient } from './client';

/**
 * Stateless pathway match. The choices travel only in the POST body (never the URL), are not cached by the client
 * (a mutation, not a query) and are not stored by the server.
 */
export function matchPathway(body: PathwayMatchRequest, signal?: AbortSignal): Promise<PathwayMatchResponse> {
  return apiPost('/public/pathway/match', body, PathwayMatchResponseSchema, signal);
}

export function usePathwayMatch() {
  return useMutation({ mutationFn: (body: PathwayMatchRequest) => matchPathway(body), gcTime: 0, retry: 0 }, queryClient);
}
