import { QueryClient } from '@tanstack/react-query';
import type { ZodType } from 'zod';
import { PublicConfigSchema, type PublicConfig } from '@kalinga/shared';

/**
 * The single fetch layer for the web app (docs/architecture.md: TanStack Query is the one
 * server-state strategy). Every API call goes through `apiGet`, which validates the
 * response with the shared Zod schema. Requests use same-origin relative URLs (Vite proxies
 * /api in dev), send no cookies or credentials, and never put user data in the URL.
 */
export const API_BASE = '/api/v1';

export class ApiRequestError extends Error {
  constructor(
    readonly kind: 'network' | 'http' | 'invalid-response',
    readonly status?: number,
  ) {
    super(`API request failed (${kind}${status ? ` ${status}` : ''})`);
    this.name = 'ApiRequestError';
  }
}

export async function apiGet<T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'omit',
      signal,
    });
  } catch {
    throw new ApiRequestError('network');
  }
  if (!res.ok) throw new ApiRequestError('http', res.status);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiRequestError('invalid-response');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiRequestError('invalid-response');
  return parsed.data;
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000, refetchOnWindowFocus: false } },
});

export const publicConfigQuery = {
  queryKey: ['public-config'] as const,
  queryFn: ({ signal }: { signal: AbortSignal }): Promise<PublicConfig> =>
    apiGet('/public/config', PublicConfigSchema, signal),
};
