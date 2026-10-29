import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App';
import { I18nProvider } from './I18nProvider';
import {
  CATALOGS,
  en,
  fil,
  findExtraKeys,
  findMissingKeys,
  hasUnreviewed,
  setMissingKeyReporter,
  translate,
} from './catalog';
import { formatCurrencyPHP, formatDateTime, formatNumber } from './format';
import { LOCALE_STORAGE_KEY, localeFromNavigator } from './locale-storage';

function renderApp(path = '/', initialLocale?: 'en' | 'fil') {
  return render(
    <I18nProvider initialLocale={initialLocale}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = '';
});
afterEach(() => vi.restoreAllMocks());

describe('catalog parity', () => {
  it('en and fil have identical message IDs', () => {
    expect(findMissingKeys(en, fil)).toEqual([]);
    expect(findExtraKeys(en, fil)).toEqual([]);
    expect(Object.keys(fil).sort()).toEqual(Object.keys(en).sort());
  });

  it('every entry has non-empty text and a review state', () => {
    for (const locale of ['en', 'fil'] as const) {
      for (const [id, entry] of Object.entries(CATALOGS[locale])) {
        expect(entry.text.trim(), `${locale}:${id}`).not.toBe('');
        expect(['unreviewed', 'reviewed']).toContain(entry.review);
      }
    }
  });

  it('all Filipino entries are marked unreviewed (no medical approval claimed)', () => {
    expect(Object.values(fil).every((e) => e.review === 'unreviewed')).toBe(true);
    expect(hasUnreviewed(fil)).toBe(true);
  });

  it('parity helper fails on a missing or empty key', () => {
    const broken = { ...fil } as Record<string, unknown>;
    delete broken['nav.home'];
    broken['nav.menu'] = { text: '', review: 'unreviewed' };
    expect(findMissingKeys(en, broken)).toEqual(['nav.home', 'nav.menu']);
    expect(findExtraKeys(en, { ...fil, 'stale.key': fil['nav.home'] })).toEqual(['stale.key']);
  });
});

describe('missing-key reporting', () => {
  it('reports the miss, falls back to English, and never throws', () => {
    const seen: string[] = [];
    setMissingKeyReporter((locale, id) => seen.push(`${locale}:${id}`));
    expect(translate('fil', 'nope.unknown')).toBe('nope.unknown');
    const saved = CATALOGS.fil['nav.home'];
    // @ts-expect-error simulate a missing translation
    delete CATALOGS.fil['nav.home'];
    try {
      expect(translate('fil', 'nav.home')).toBe('Home');
    } finally {
      CATALOGS.fil['nav.home'] = saved;
    }
    expect(seen).toEqual(['fil:nope.unknown', 'fil:nav.home']);
  });
});

describe('lang attribute and switch', () => {
  it('sets document lang to en by default and fil after switching', async () => {
    renderApp();
    expect(document.documentElement.lang).toBe('en');
    await userEvent.click(screen.getByRole('button', { name: 'Filipino' }));
    expect(document.documentElement.lang).toBe('fil');
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(document.documentElement.lang).toBe('en');
  });

  it('switch is a labelled group of toggle buttons with aria-pressed', async () => {
    renderApp();
    const group = screen.getByRole('group', { name: 'Language' });
    const en = within(group).getByRole('button', { name: 'English' });
    const fl = within(group).getByRole('button', { name: 'Filipino' });
    expect(en).toHaveAttribute('aria-pressed', 'true');
    expect(fl).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(fl);
    expect(fl).toHaveAttribute('aria-pressed', 'true');
  });

  it('persists the choice in localStorage and restores it on next mount', async () => {
    const first = renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Filipino' }));
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fil');
    first.unmount();
    renderApp();
    expect(document.documentElement.lang).toBe('fil');
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('survives localStorage throwing', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Filipino' }));
    expect(document.documentElement.lang).toBe('fil');
  });

  it('defaults from navigator language', () => {
    expect(localeFromNavigator(['fil-PH'])).toBe('fil');
    expect(localeFromNavigator(['tl'])).toBe('fil');
    expect(localeFromNavigator(['en-US'])).toBe('en');
    expect(localeFromNavigator(['de-DE'])).toBe('en');
    expect(localeFromNavigator([])).toBe('en');
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['fil-PH']);
    renderApp();
    expect(document.documentElement.lang).toBe('fil');
  });
});

describe('both locales render shell strings from catalogs', () => {
  it.each(['en', 'fil'] as const)('DEMO banner and four nav labels in %s', (locale) => {
    renderApp('/', locale);
    const c = CATALOGS[locale];
    expect(screen.getByRole('note')).toHaveTextContent(c['banner.demo'].text);
    expect(screen.getByRole('note')).toHaveTextContent(/DEMO prototype/);
    const expected = [c['nav.home'].text, c['nav.learn'].text, c['nav.clinics'].text, c['nav.menu'].text];
    for (const name of [c['nav.primary'].text, c['nav.mobile'].text]) {
      const nav = screen.getByRole('navigation', { name });
      expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(expected);
    }
  });

  it('Filipino nav labels differ from English where translated', () => {
    renderApp('/', 'fil');
    const nav = screen.getByRole('navigation', { name: fil['nav.mobile'].text });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Tahanan',
      'Alamin',
      'Mga Klinika',
      'Menu',
    ]);
  });

  it('shows the unreviewed-translation notice only when fil is active', async () => {
    renderApp();
    expect(screen.queryByText('Filipino translation not yet medically reviewed')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Filipino' }));
    expect(screen.getByRole('status')).toHaveTextContent('Filipino translation not yet medically reviewed');
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('hero and not-found are localized', () => {
    renderApp('/nope', 'fil');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(fil['notFound.title'].text);
  });
});

describe('formatting', () => {
  it('formats in Asia/Manila regardless of host zone', () => {
    const instant = '2026-03-01T16:30:00Z'; // 2026-03-02 00:30 in Manila
    expect(formatDateTime('en', instant)).toMatch(/Mar 2, 2026/);
    expect(formatDateTime('fil', instant)).toContain('2026');
  });
  it('formats numbers and PHP currency', () => {
    expect(formatNumber('en', 1234567)).toBe('1,234,567');
    expect(formatCurrencyPHP('en', 1500)).toContain('1,500');
    expect(formatCurrencyPHP('en', 1500)).toMatch(/₱|PHP/);
  });
});
