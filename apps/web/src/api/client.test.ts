import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicConfigSchema } from '@kalinga/shared';
import { ApiRequestError, apiGet, publicConfigQuery } from './client';

const VALID = {
  apiVersion: 'v1',
  demoMode: true,
  locales: ['en', 'fil'],
  defaultLocale: 'en',
  timezone: 'Asia/Manila',
  notificationTransport: 'mock',
  realBookingEnabled: false,
  clinicalContentApproved: false,
};

afterEach(() => vi.unstubAllGlobals());

function stubFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('apiGet', () => {
  it('requests the relative /api/v1 path with no credentials and validates the body', async () => {
    const fn = stubFetch(async () => new Response(JSON.stringify(VALID), { status: 200 }));
    const out = await apiGet('/public/config', PublicConfigSchema);
    expect(out.demoMode).toBe(true);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/public/config');
    expect(init.credentials).toBe('omit');
    expect(init.method).toBe('GET');
  });

  it('rejects a body that fails the Zod schema', async () => {
    stubFetch(async () => new Response(JSON.stringify({ ...VALID, realBookingEnabled: true }), { status: 200 }));
    await expect(apiGet('/public/config', PublicConfigSchema)).rejects.toMatchObject({ kind: 'invalid-response' });
  });

  it('maps HTTP errors, network errors and non-JSON bodies to ApiRequestError', async () => {
    stubFetch(async () => new Response('{}', { status: 503 }));
    await expect(apiGet('/x', PublicConfigSchema)).rejects.toMatchObject({ kind: 'http', status: 503 });
    stubFetch(async () => {
      throw new TypeError('offline');
    });
    await expect(apiGet('/x', PublicConfigSchema)).rejects.toBeInstanceOf(ApiRequestError);
    stubFetch(async () => new Response('<html>', { status: 200 }));
    await expect(apiGet('/x', PublicConfigSchema)).rejects.toMatchObject({ kind: 'invalid-response' });
  });

  it('publicConfigQuery calls the config endpoint', async () => {
    const fn = stubFetch(async () => new Response(JSON.stringify(VALID), { status: 200 }));
    await publicConfigQuery.queryFn({ signal: new AbortController().signal });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
