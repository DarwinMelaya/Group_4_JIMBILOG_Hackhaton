import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locale } from '@kalinga/shared';
import { AppRoutes } from '../App';
import { I18nProvider } from '../i18n/I18nProvider';
import { queryClient } from '../api/client';
import { formatViolations, runAxe } from './axe';

const css = (f: string) => readFileSync(resolve(process.cwd(), 'src/styles', f), 'utf8');
const tokensCss = css('tokens.css');
const appCss = css('app.css');

const CONFIG = {
  apiVersion: 'v1',
  demoMode: true,
  locales: ['en', 'fil'],
  defaultLocale: 'en',
  timezone: 'Asia/Manila',
  notificationTransport: 'mock',
  realBookingEnabled: false,
  clinicalContentApproved: false,
};

function mockFetchOk() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(CONFIG), { status: 200 })));
}

function renderApp(path: string, locale: Locale) {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  queryClient.clear();
  mockFetchOk();
});
afterEach(() => vi.unstubAllGlobals());

const PAGES = [
  ['Home', '/'],
  ['Learn', '/learn'],
  ['Clinics', '/clinics'],
  ['Menu', '/menu'],
] as const;

describe('axe-core: zero violations', () => {
  for (const locale of ['en', 'fil'] as const) {
    for (const [name, path] of PAGES) {
      it(`${name} (${locale}) after the config loads`, async () => {
        const { container } = renderApp(path, locale);
        await waitFor(() => expect(container.querySelector('[data-state="ready"]')).not.toBeNull());
        const violations = await runAxe(container);
        expect(formatViolations(violations)).toBe('');
      });
    }
  }

  it('Home (en) while the config is loading', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    const { container } = renderApp('/', 'en');
    expect(container.querySelector('[data-state="loading"]')).not.toBeNull();
    expect(formatViolations(await runAxe(container))).toBe('');
  });

  it('Home (en) when the config request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    const { container } = renderApp('/', 'en');
    await waitFor(() => expect(container.querySelector('[data-state="error"]')).not.toBeNull(), { timeout: 4000 });
    expect(formatViolations(await runAxe(container))).toBe('');
  });
});

describe('environment status from the config API', () => {
  it('shows DEMO, mock notifications and disabled booking in English and Filipino', async () => {
    const en = renderApp('/', 'en');
    await waitFor(() => expect(en.container.querySelector('[data-state="ready"]')).not.toBeNull());
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'DEMO environment · notifications are mock only · real booking is disabled',
    );
    en.unmount();
    const fil = renderApp('/', 'fil');
    await waitFor(() => expect(fil.container.querySelector('[data-state="ready"]')).not.toBeNull());
    expect(screen.getByRole('contentinfo')).toHaveTextContent('DEMO na kapaligiran');
  });

  it('degrades gracefully with a message when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network');
    }));
    const { container } = renderApp('/', 'en');
    await waitFor(() => expect(container.querySelector('[data-state="error"]')).not.toBeNull(), { timeout: 4000 });
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/status unavailable/);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('says so when the browser is offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network');
    }));
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { container } = renderApp('/', 'en');
    await waitFor(() => expect(container.querySelector('[data-state="error"]')).not.toBeNull(), { timeout: 4000 });
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/appear to be offline/);
    spy.mockRestore();
  });
});

describe('landmarks, skip link and keyboard order', () => {
  it('exposes banner, two labelled navs, one main and contentinfo', () => {
    renderApp('/', 'en');
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
    expect(screen.getAllByRole('navigation').map((n) => n.getAttribute('aria-label'))).toEqual(['Primary', 'Mobile']);
  });

  it('skip link is the first focusable element and targets #main', async () => {
    const { container } = renderApp('/', 'en');
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', '#main');
    expect(container.querySelector('#main')).toBeInTheDocument();
    await userEvent.tab();
    expect(skip).toHaveFocus();
  });

  it('tab order: skip link, logo, primary nav, language buttons, page actions', async () => {
    renderApp('/', 'en');
    const seen: string[] = [];
    for (let i = 0; i < 14; i += 1) {
      await userEvent.tab();
      const el = document.activeElement as HTMLElement;
      seen.push((el.getAttribute('aria-label') ?? el.textContent ?? '').trim());
    }
    const primary = within(screen.getByRole('navigation', { name: 'Primary' }))
      .getAllByRole('link')
      .map((l) => l.textContent);
    expect(primary).toEqual(['Home', 'Learn', 'Clinics', 'Menu']);
    expect(seen[0]).toBe('Skip to content');
    expect(seen[1]).toBe('KALINGA (DEMO) home');
    expect(seen.slice(2, 6)).toEqual(primary);
    const at = (s: string) => seen.indexOf(s);
    expect(at('English')).toBeGreaterThan(5);
    expect(at('Explore Testing Options')).toBeGreaterThan(at('Filipino'));
    expect(at('Learn About STIs')).toBeGreaterThan(at('Explore Testing Options'));
  });
});

describe('44px targets, focus and reduced motion (CSS assertions)', () => {
  it('declares --touch-target as 44px', () => {
    expect(tokensCss).toMatch(/--touch-target:\s*44px;/);
  });

  it.each(['.nav-link', '.btn', '.logo', '.locale-switch__btn'])('%s enforces the 44px token as minimum height', (sel) => {
    const rule = appCss.split('\n').find((l) => l.startsWith(`${sel} {`));
    expect(rule, `rule for ${sel}`).toBeDefined();
    expect(rule).toMatch(/min-height:\s*var\(--touch-target\)/);
  });

  it('has a visible keyboard focus style', () => {
    expect(appCss).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid/);
  });

  it('disables animation, transition and smooth scroll under prefers-reduced-motion', () => {
    const m = appCss.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
    expect(m).not.toBeNull();
    expect(m?.[1]).toMatch(/animation:\s*none !important/);
    expect(m?.[1]).toMatch(/transition:\s*none !important/);
    expect(m?.[1]).toMatch(/scroll-behavior:\s*auto !important/);
  });
});

describe('contrast of declared token pairs (WCAG AA, computed)', () => {
  // Resolves a token through var() aliases down to its hex value.
  const hex = (name: string): string => {
    const v = tokensCss.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim() ?? '';
    const ref = v.match(/^var\((--[\w-]+)\)$/);
    return ref ? hex(ref[1] as string) : v;
  };
  const lum = (h: string) => {
    const c = [1, 3, 5]
      .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(hex(a)), lum(hex(b))] as [number, number];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  it.each([
    ['--color-ink', '--color-white'],
    ['--color-ink', '--color-peach'],
    ['--color-ink', '--color-lavender'],
    ['--color-muted', '--color-white'],
    ['--color-indigo', '--color-white'],
    ['--color-white', '--color-indigo'],
    ['--color-action', '--color-white'],
    ['--color-action', '--color-lavender'],
    ['--color-on-dark', '--brand-vivid'],
    ['--color-on-dark', '--brand-electric'],
    ['--color-on-dark', '--brand-midnight'],
    ['--color-on-dark', '--brand-royal'],
    ['--color-on-dark-muted', '--brand-royal'],
    ['--color-on-dark-muted', '--brand-vivid'],
    ['--brand-navy', '--color-on-dark'],
    ['--color-peach-soft', '--brand-vivid'],
    ['--color-on-dark-muted', '--brand-plum'],
    ['--color-on-dark', '--brand-mauve'],
    ['--color-ink', '--surface-warm'],
    ['--color-muted', '--surface-tint'],
    ['--color-muted', '--surface-raised'],
  ])('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
