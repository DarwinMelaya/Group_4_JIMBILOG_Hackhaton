import { useQuery } from '@tanstack/react-query';
import { publicConfigQuery, queryClient } from './client';

/** Passing the client explicitly means components work with or without a QueryClientProvider. */
export function usePublicConfig() {
  return useQuery(publicConfigQuery, queryClient);
}
