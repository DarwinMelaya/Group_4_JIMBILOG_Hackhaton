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
    /** Stable error code from the API envelope (e.g. 'under_15_not_supported'), when the body had one. */
    readonly code?: string,
    /** Seconds from a Retry-After header (429 responses), when present. */
    readonly retryAfter?: number,
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
  if (!res.ok) throw await httpError(res);
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

/**
 * POST helper for stateless calls such as the pathway match. The body is JSON, never put in the URL, never persisted by
 * the client; credentials are omitted. Responses are validated with the shared Zod schema.
 */
export async function apiPost<T>(
  path: string,
  body: unknown,
  schema: ZodType<T>,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', ...extraHeaders },
      credentials: 'omit',
      cache: 'no-store',
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new ApiRequestError('network');
  }
  if (!res.ok) throw await httpError(res);
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

/** Builds an http error carrying the envelope code and Retry-After, never the body text. */
export async function httpError(res: Response): Promise<ApiRequestError> {
  let code: string | undefined;
  try {
    const j = (await res.json()) as { error?: { code?: unknown } } | null;
    if (typeof j?.error?.code === 'string') code = j.error.code;
  } catch {
    /* no usable body */
  }
  const ra = Number(res.headers.get('retry-after'));
  return new ApiRequestError('http', res.status, code, Number.isFinite(ra) && ra > 0 ? ra : undefined);
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000, refetchOnWindowFocus: false } },
});

export const publicConfigQuery = {
  queryKey: ['public-config'] as const,
  queryFn: ({ signal }: { signal: AbortSignal }): Promise<PublicConfig> =>
    apiGet('/public/config', PublicConfigSchema, signal),
};
