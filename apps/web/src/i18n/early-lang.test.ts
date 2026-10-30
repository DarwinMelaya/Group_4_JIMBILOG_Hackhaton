import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { LOCALE_STORAGE_KEY, detectInitialLocale } from './locale-storage';

const root = resolve(process.cwd());
const script = readFileSync(resolve(root, 'public/early-lang.js'), 'utf8');

interface Env {
  stored?: string | null;
  throwOnRead?: boolean;
  languages?: string[];
  language?: string;
}

/** Runs the real public/early-lang.js in a sandbox and returns the resulting html lang (initially "en"). */
function runEarly(env: Env): string {
  const attrs: Record<string, string> = { lang: 'en' };
  const sandbox = {
    window: {
      localStorage: {
        getItem(k: string) {
          if (env.throwOnRead) throw new Error('SecurityError');
          return k === 'kalinga.locale' ? (env.stored ?? null) : null;
        },
      },
    },
    navigator: { languages: env.languages ?? [], language: env.language ?? 'en-US' },
    document: {
      documentElement: {
        setAttribute: (k: string, v: string) => {
          attrs[k] = v;
        },
      },
    },
  };
  vm.runInNewContext(script, sandbox);
  return attrs.lang!;
}

describe('early html lang script (public/early-lang.js)', () => {
  it('uses the same storage key as the app', () => {
    expect(LOCALE_STORAGE_KEY).toBe('kalinga.locale');
    expect(script).toContain(`'${LOCALE_STORAGE_KEY}'`);
  });

  it('applies a stored locale before React mounts', () => {
    expect(runEarly({ stored: 'fil' })).toBe('fil');
    expect(runEarly({ stored: 'en', languages: ['fil-PH'] })).toBe('en');
  });

  it('ignores an invalid stored value and falls back to the navigator, like the app', () => {
    expect(runEarly({ stored: 'xx', languages: ['tl-PH'] })).toBe('fil');
    expect(runEarly({ stored: 'xx', languages: ['de', 'en-GB'] })).toBe('en');
  });

  it('tolerates storage errors (falls back to navigator, never throws)', () => {
    expect(runEarly({ throwOnRead: true, languages: ['fil'] })).toBe('fil');
    expect(runEarly({ throwOnRead: true, languages: [], language: 'en-US' })).toBe('en');
  });

  it('leaves the static lang untouched when nothing is detectable', () => {
    expect(runEarly({ languages: [], language: 'de-DE' })).toBe('en');
  });

  it('never throws when window, navigator or document are broken', () => {
    expect(() => vm.runInNewContext(script, {})).not.toThrow();
  });

  it('agrees with the app locale detection for the same inputs', () => {
    const cases: Env[] = [
      { stored: 'fil' },
      { stored: 'en', languages: ['fil'] },
      { stored: null, languages: ['fil-PH', 'en'] },
      { stored: null, languages: ['tl'] },
      { stored: 'bogus', languages: ['en-US'] },
      { stored: null, languages: ['fr'] },
    ];
    for (const c of cases) {
      window.localStorage.clear();
      if (c.stored != null) window.localStorage.setItem(LOCALE_STORAGE_KEY, c.stored);
      Object.defineProperty(window.navigator, 'languages', { value: c.languages ?? [], configurable: true });
      expect(runEarly(c)).toBe(detectInitialLocale());
    }
    window.localStorage.clear();
  });
});

describe('index.html wiring', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');

  it('loads the early script as an external classic script before the app bundle, with no inline scripts', () => {
    const early = html.indexOf('<script src="/early-lang.js"></script>');
    const main = html.indexOf('type="module"');
    expect(early).toBeGreaterThan(-1);
    expect(main).toBeGreaterThan(early);
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    for (const s of scripts) expect(s).toMatch(/\bsrc="/);
    expect(html).not.toMatch(/<script\b[^>]*>\s*[^<\s]/); // no content between script tags (CSP script-src 'self')
    expect(html).toContain('<html lang="en">'); // static fallback if the script cannot run
  });

  it('manifest and title stay English, as recorded in the decision log', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.json'), 'utf8')) as { lang: string };
    expect(manifest.lang).toBe('en');
    expect(html).toContain('<title>KALINGA (DEMO)</title>');
    const log = readFileSync(resolve(root, '../../docs/decision-log.md'), 'utf8');
    expect(log).toMatch(/manifest and (document )?title stay English/i);
    expect(log).toContain('early-lang.js');
  });
});
