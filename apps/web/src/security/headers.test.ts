// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ORIGIN, bootSw, fakeRes, readPublic, swReq } from '../pwa/sw-sandbox';
import { devCsp, devHeaders, globalHeaders, parseHeadersFile } from '../../security-headers';
import viteConfig from '../../vite.config';

const webRoot = path.resolve(import.meta.dirname, '../..');
const headersText = fs.readFileSync(path.join(webRoot, 'public/_headers'), 'utf8');
const rules = parseHeadersFile(headersText);
const all = globalHeaders(rules);
const csp = all['Content-Security-Policy']!;
const directives = Object.fromEntries(
  csp.split(';').map((d) => {
    const [name, ...vals] = d.trim().split(/\s+/);
    return [name, vals.join(' ')];
  }),
) as Record<string, string>;

describe('S1-12 public/_headers (production policy)', () => {
  it('has the exact strict CSP directives', () => {
    expect(directives).toEqual({
      'default-src': "'self'",
      'script-src': "'self'",
      'style-src': "'self'",
      'img-src': "'self' data:",
      'font-src': "'self'",
      'connect-src': "'self'",
      'worker-src': "'self'",
      'manifest-src': "'self'",
      'frame-ancestors': "'none'",
      'base-uri': "'none'",
      'form-action': "'self'",
    });
  });
  it('never weakens the production CSP', () => {
    for (const bad of ['unsafe-inline', 'unsafe-eval', 'http:', 'https:', '*', 'blob:', 'ws:', 'nonce-']) {
      expect(csp, bad).not.toContain(bad);
    }
  });
  it('sends the other global security headers', () => {
    expect(all['Referrer-Policy']).toBe('no-referrer');
    expect(all['X-Content-Type-Options']).toBe('nosniff');
    expect(all['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
  });
  it('serves sw.js with no-cache and a root service worker scope', () => {
    const sw = rules.find((r) => r.path === '/sw.js');
    expect(sw?.headers).toEqual({ 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' });
  });
  it('parser ignores comments and rejects malformed lines', () => {
    expect(parseHeadersFile('# c\n/a\n  X-A: 1:2\n')).toEqual([{ path: '/a', headers: { 'X-A': '1:2' } }]);
    expect(() => parseHeadersFile('  Orphan: 1')).toThrow();
    expect(() => globalHeaders([])).toThrow();
  });
});

describe('S1-12 vite dev/preview headers', () => {
  it('preview serves the production headers unchanged', () => {
    expect(viteConfig.preview?.headers).toEqual(all);
  });
  it('dev differs from production only by the Vite HMR allowances', () => {
    const dev = viteConfig.server?.headers as Record<string, string>;
    expect(dev['Referrer-Policy']).toBe('no-referrer');
    expect(dev['X-Content-Type-Options']).toBe('nosniff');
    expect(dev['Permissions-Policy']).toBe(all['Permissions-Policy']);
    const d = dev['Content-Security-Policy']!;
    expect(d).toContain("script-src 'self' 'unsafe-inline'");
    expect(d).toContain("style-src 'self' 'unsafe-inline'");
    expect(d).toContain('ws://localhost:*');
    // everything else is untouched and no eval is introduced
    expect(d).toContain("frame-ancestors 'none'");
    expect(d).toContain("base-uri 'none'");
    expect(d).toContain("default-src 'self'");
    expect(d).not.toContain('unsafe-eval');
  });
  it('devCsp/devHeaders are pure and leave production input intact', () => {
    const before = { ...all };
    devHeaders(all);
    expect(all).toEqual(before);
    expect(devCsp("default-src 'self'; script-src 'self'")).toBe("default-src 'self'; script-src 'self' 'unsafe-inline'");
  });
});

describe('S1-12 build output is compatible with font-src self', () => {
  it('never inlines fonts as data: URIs (font-src has no data:), images may still inline', () => {
    const limit = viteConfig.build?.assetsInlineLimit as (file: string, content: Buffer) => boolean | undefined;
    expect(typeof limit).toBe('function');
    const buf = Buffer.from('x');
    for (const f of ['a.woff2', 'a.woff', 'A.TTF', '/x/y/inter-latin-400-normal.woff2']) expect(limit(f, buf), f).toBe(false);
    expect(limit('a.svg', buf)).toBeUndefined();
    expect(limit('a.png', buf)).toBeUndefined();
  });
});

describe('S1-12 index.html and source are CSP-compatible', () => {
  const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
  it('declares the no-referrer meta', () => {
    expect(html).toMatch(/<meta\s+name="referrer"\s+content="no-referrer"\s*\/?>/);
  });
  it('has no inline script, inline style, style attribute or inline event handler', () => {
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      expect(m[1], 'script has src').toMatch(/\bsrc="/);
      expect(m[2]!.trim(), 'script body empty').toBe('');
    }
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });
  it('React sources never use style props or inline <style> (style-src self would block them)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          const src = fs.readFileSync(p, 'utf8');
          if (/\bstyle=\{|dangerouslySetInnerHTML|<style\b|\.style\.|\.setAttribute\(\s*['"]style/.test(src)) offenders.push(p);
        }
      }
    };
    walk(path.join(webRoot, 'src'));
    expect(offenders).toEqual([]);
  });
});

describe('S1-12 repair: every shipped HTML file is CSP-clean (no inline script/style/handler)', () => {
  const htmlFiles = (dir: string): string[] => {
    if (!fs.existsSync(dir)) return [];
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...htmlFiles(p));
      else if (/\.html?$/i.test(e.name)) out.push(p);
    }
    return out;
  };
  const files = [
    path.join(webRoot, 'index.html'),
    ...htmlFiles(path.join(webRoot, 'public')),
  ];
  // dist/ is deliberately not scanned: it is gitignored build output and tests run before build,
  // so scanning it would make verify depend on stale untracked state. dist HTML is derived from these sources.
  it('scans index.html, offline.html and any other html under public/', () => {
    const names = files.map((f) => path.relative(webRoot, f).replace(/\\/g, '/'));
    expect(names).toContain('index.html');
    expect(names).toContain('public/offline.html');
  });
  for (const file of files) {
    const rel = path.relative(webRoot, file).replace(/\\/g, '/');
    it(`${rel} has no inline <script>, <style>, style= or on*= handler`, () => {
      const html = fs.readFileSync(file, 'utf8');
      for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        expect(m[1], 'script has src').toMatch(/\bsrc="/);
        expect(m[2]!.trim(), 'script body empty').toBe('');
      }
      expect(html, '<style>').not.toMatch(/<style\b/i);
      expect(html, 'style=').not.toMatch(/\sstyle\s*=/i);
      expect(html, 'on*=').not.toMatch(/\son[a-z]+\s*=/i);
    });
  }
  it('offline.html references only same-origin external css/js, and those files exist', () => {
    const html = fs.readFileSync(path.join(webRoot, 'public/offline.html'), 'utf8');
    expect(html).toMatch(/<link\s+rel="stylesheet"\s+href="\/offline\.css"/);
    expect(html).toMatch(/<script\s+src="\/offline\.js"><\/script>/);
    for (const f of ['offline.css', 'offline.js']) expect(fs.existsSync(path.join(webRoot, 'public', f)), f).toBe(true);
    expect(readPublic('offline.js')).toMatch(/addEventListener\(\s*'click'/);
  });
});

interface Policy {
  classifyRequest(r: { method: string; url: string; mode?: string }, o: string): string;
  isCacheableStaticResponse(res: unknown, pathname: string): boolean;
  staticStrategy(p: string): string;
  PRECACHE_URLS: string[];
  REQUIRED_PRECACHE_URLS: string[];
}
function loadPolicy(): Policy {
  const sandbox: Record<string, unknown> = { URL };
  sandbox.self = sandbox;
  vm.runInNewContext(readPublic('cache-policy.js'), sandbox);
  return sandbox.KalingaCachePolicy as Policy;
}

describe('S1-12 classifyRequest rejects encoded separators', () => {
  const P = loadPolicy();
  const cls = (u: string, mode = 'cors') => P.classifyRequest(swReq(u, 'GET', mode), ORIGIN);
  it('bypasses encoded slashes, backslashes and double encoding, for assets and navigations', () => {
    for (const u of [
      '/assets/..%2fapi',
      '/assets/..%2Fapi/v1/x',
      '/assets/..%2fstaff',
      '/assets/..%5cstaff',
      '/assets/%2e%2e%2fapi',
      '/icons/a%2fb.png',
      '/assets/..%252fapi',
      '/learn%2fx',
    ]) {
      expect(cls(u), u).toBe('bypass');
    }
    expect(cls('/assets/..%2fapi', 'navigate')).toBe('bypass');
  });
  it('still caches ordinary static files and navigations', () => {
    expect(cls('/assets/index-abc123.js')).toBe('static');
    expect(cls('/icons/icon-192.png')).toBe('static');
    expect(cls('/manifest.json')).toBe('static');
    expect(cls('/learn', 'navigate')).toBe('navigate');
  });
  it('the real worker does not intercept an encoded-slash request', async () => {
    const sw = bootSw();
    const r = await sw.fire('fetch', { request: swReq('/assets/..%2fapi') });
    expect(r.responded).toBe(false);
    expect(sw.fetchFn).not.toHaveBeenCalled();
  });
});

describe('S1-12 repair: offline page assets are precached and served from cache', () => {
  const P = loadPolicy();
  it('precache includes /offline.css and /offline.js as optional entries; offline.html stays the only required one', () => {
    expect(P.PRECACHE_URLS).toEqual(expect.arrayContaining(['/offline.html', '/offline.css', '/offline.js']));
    expect(P.REQUIRED_PRECACHE_URLS).toEqual(['/offline.html']);
  });
  it('classifyRequest treats them as static with stale-while-revalidate', () => {
    for (const u of ['/offline.css', '/offline.js']) {
      expect(P.classifyRequest(swReq(u), ORIGIN), u).toBe('static');
      expect(P.staticStrategy(u), u).toBe('revalidate');
    }
  });
  it('worker install caches both, and an install still succeeds if they are missing', async () => {
    const sw = bootSw();
    await sw.fire('install');
    const keys = [...sw.stores.get('kalinga-static-1')!.keys()];
    expect(keys).toEqual(expect.arrayContaining([ORIGIN + '/offline.css', ORIGIN + '/offline.js']));
    const tolerant = bootSw({ failAdd: (u) => u === '/offline.css' || u === '/offline.js' });
    const out = await tolerant.fire('install');
    expect(out.settled.map((s) => s.status)).toEqual(['fulfilled']);
  });
  it('worker serves both from the cache when the network is down', async () => {
    const sw = bootSw();
    await sw.fire('install');
    sw.fetchFn.mockRejectedValue(new Error('offline'));
    for (const u of ['/offline.css', '/offline.js']) {
      const r = await sw.fire('fetch', { request: swReq(u) });
      expect(r.value, u).toBe('precached:' + u); // the sandbox stores precached entries as this marker string
    }
  });
});

describe('S1-12 the worker only caches non-text/html content for static assets', () => {
  const P = loadPolicy();
  it('policy: html is refused for assets, allowed only for the offline page', () => {
    const html = fakeRes('<html>', { 'content-type': 'text/html; charset=utf-8' });
    const js = fakeRes('x', { 'content-type': 'text/javascript' });
    const none = fakeRes('x');
    expect(P.isCacheableStaticResponse(html, '/assets/index-abc.js')).toBe(false);
    expect(P.isCacheableStaticResponse(fakeRes('<html>', { 'content-type': 'TEXT/HTML' }), '/icons/x.png')).toBe(false);
    expect(P.isCacheableStaticResponse(html, '/manifest.json')).toBe(false);
    expect(P.isCacheableStaticResponse(html, '/offline.html')).toBe(true);
    expect(P.isCacheableStaticResponse(js, '/assets/index-abc.js')).toBe(true);
    expect(P.isCacheableStaticResponse(none, '/assets/index-abc.js')).toBe(true);
    // the existing cacheability rules still apply to the offline page
    expect(
      P.isCacheableStaticResponse(fakeRes('x', { 'content-type': 'text/html', 'cache-control': 'no-store' }), '/offline.html'),
    ).toBe(false);
  });
  it('worker: an SPA-fallback HTML answer for a missing asset is served but never written to the cache', async () => {
    const sw = bootSw();
    await sw.fire('install');
    sw.fetchFn.mockResolvedValueOnce(fakeRes('<!doctype html>', { 'content-type': 'text/html' }));
    const r = await sw.fire('fetch', { request: swReq('/assets/missing-abc.js') });
    expect((r.value as { body: string }).body).toBe('<!doctype html>');
    expect(sw.stores.get('kalinga-static-1')!.has(ORIGIN + '/assets/missing-abc.js')).toBe(false);
  });
  it('worker: a real JS asset is cached, and html for /manifest.json is not', async () => {
    const sw = bootSw();
    await sw.fire('install');
    sw.fetchFn.mockResolvedValueOnce(fakeRes('js', { 'content-type': 'text/javascript' }));
    await sw.fire('fetch', { request: swReq('/assets/app-abc.js') });
    expect(sw.stores.get('kalinga-static-1')!.has(ORIGIN + '/assets/app-abc.js')).toBe(true);
    sw.fetchFn.mockResolvedValueOnce(fakeRes('<html>', { 'content-type': 'text/html' }));
    await sw.fire('fetch', { request: swReq('/manifest.json') });
    expect(sw.stores.get('kalinga-static-1')!.get(ORIGIN + '/manifest.json')).toBe('precached:/manifest.json');
  });
});
