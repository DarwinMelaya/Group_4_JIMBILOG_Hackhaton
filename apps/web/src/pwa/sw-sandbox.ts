import { vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/** Test-only harness: runs the REAL public/sw.js and public/cache-policy.js inside a node vm with fake
 *  caches/fetch, so service worker behaviour is asserted against the shipped files, not copies. */
export const pub = path.resolve(import.meta.dirname, '../../public');
export const readPublic = (f: string) => fs.readFileSync(path.join(pub, f), 'utf8');
export const ORIGIN = 'https://kalinga.test';

type Handler = (e: Record<string, unknown>) => void;
export interface FakeResponse {
  status: number;
  type: string;
  headers: { get(k: string): string | null };
  body?: string;
  clone(): FakeResponse;
}
export function fakeRes(body: string, headers: Record<string, string> = {}, status = 200): FakeResponse {
  const r: FakeResponse = {
    status,
    type: 'basic',
    body,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    clone: () => r,
  };
  return r;
}
export const swReq = (url: string, method = 'GET', mode = 'cors') => ({ method, url: ORIGIN + url, mode });

export interface BootOptions {
  /** URLs (as passed to cache.add) that reject, simulating a missing file or network error. */
  failAdd?: (url: string) => boolean;
  /** Make every cache.put reject (quota exceeded). */
  failPut?: boolean;
}

const abs = (k: string | { url: string }) => {
  const s = typeof k === 'string' ? k : k.url;
  return s.startsWith('/') ? ORIGIN + s : s;
};

export function bootSw(opts: BootOptions = {}) {
  const handlers: Record<string, Handler> = {};
  const stores = new Map<string, Map<string, unknown>>();
  const caches = {
    open: async (n: string) => {
      if (!stores.has(n)) stores.set(n, new Map());
      const s = stores.get(n)!;
      return {
        add: async (u: string) => {
          if (opts.failAdd?.(u)) throw new TypeError('add failed: ' + u);
          s.set(abs(u), `precached:${u}`);
        },
        put: async (r: string | { url: string }, v: unknown) => {
          if (opts.failPut) throw new Error('QuotaExceededError');
          s.set(abs(r), v);
        },
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
    match: async (r: string | { url: string }) => {
      for (const s of stores.values()) if (s.has(abs(r))) return s.get(abs(r));
      return undefined;
    },
  };
  const fetchFn = vi.fn();
  const sandbox: Record<string, unknown> = {
    URL,
    caches,
    fetch: fetchFn,
    Promise,
    Response: { error: () => 'NETWORK_ERROR' },
    location: { origin: ORIGIN },
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(),
    addEventListener: (t: string, h: Handler) => (handlers[t] = h),
    importScripts: (...args: string[]) => {
      importedScripts.push(...args);
      vm.runInContext(readPublic('cache-policy.js'), ctx);
    },
  };
  const importedScripts: string[] = [];
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(readPublic('sw.js'), ctx);

  /** Fires an event. `value` is what respondWith/waitUntil-for-lifecycle resolved to; `waited` settles every
   *  waitUntil promise registered via event.waitUntil (so callers can assert none rejected). */
  const fire = async (type: string, e: Record<string, unknown> = {}) => {
    let responded = false;
    let response: Promise<unknown> | undefined;
    const waited: Promise<unknown>[] = [];
    handlers[type]!({
      ...e,
      waitUntil: (x: Promise<unknown>) => void waited.push(x),
      respondWith: (x: Promise<unknown>) => {
        responded = true;
        response = x;
      },
    });
    const value = response ? await response : undefined;
    const settled = await Promise.allSettled(waited);
    return { responded, value, settled, waitUntilCount: waited.length };
  };
  return { fire, stores, fetchFn, importedScripts, skipWaiting: sandbox.skipWaiting as ReturnType<typeof vi.fn> };
}
