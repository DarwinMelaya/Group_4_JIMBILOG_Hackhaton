import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppRoutes } from '../App';
import { I18nProvider } from './I18nProvider';
import { CATALOGS } from './catalog';
import { formatViolations, runAxe } from '../a11y/axe';

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
});

describe('DEMO banner marker', () => {
  it.each(['en', 'fil'] as const)('contains KALINGA-compatible DEMO text and the not-reviewed marker (%s)', (locale) => {
    renderApp('/', locale);
    const banner = screen.getByRole('note');
    expect(banner).toHaveTextContent(/DEMO prototype/);
    expect(banner).toHaveTextContent('NOT CLINICALLY REVIEWED');
    expect(banner).toHaveTextContent(CATALOGS[locale]['banner.notReviewed'].text);
  });

  it('Filipino banner also carries the Filipino equivalent', () => {
    renderApp('/', 'fil');
    expect(screen.getByRole('note')).toHaveTextContent('HINDI PA SINURI NG MEDIKAL');
  });
});

describe('unreviewed-translation notice languages', () => {
  it('tags each phrase with its own lang attribute', () => {
    renderApp('/', 'fil');
    const status = screen.getByRole('status');
    const en = status.querySelector('span[lang="en"]');
    const fil = status.querySelector('span[lang="fil"]');
    expect(en).toHaveTextContent('Filipino translation not yet medically reviewed');
    expect(fil).toHaveTextContent(CATALOGS.fil['notice.filUnreviewedLocal'].text);
    expect(fil?.textContent).not.toBe(en?.textContent);
  });
});

describe('language buttons', () => {
  it('keep endonym names with their own lang, a localized description, and stay 44px by CSS', () => {
    renderApp('/', 'fil');
    const group = screen.getAllByRole('group', { name: 'Wika' })[0]!;
    const fil = within(group).getByRole('button', { name: 'Filipino' });
    const en = within(group).getByRole('button', { name: 'English' });
    expect(fil).toHaveAttribute('lang', 'fil');
    expect(en).toHaveAttribute('lang', 'en');
    expect(en).toHaveAccessibleDescription('Ilipat ang wika sa English');
    expect(fil).toHaveAccessibleDescription('Ilipat ang wika sa Filipino');
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');
    expect(css).toMatch(/\.locale-switch__btn\s*\{[^}]*min-height:\s*var\(--touch-target\)/);
  });

  it('English descriptions are in English', () => {
    renderApp('/', 'en');
    expect(screen.getByRole('button', { name: 'Filipino' })).toHaveAccessibleDescription('Switch the language to Filipino');
  });
});

describe('language change announcement', () => {
  it('has exactly one polite live region, empty at first, and no extra role=status', async () => {
    const { container } = renderApp('/', 'en');
    const live = container.querySelectorAll('[aria-live="polite"]');
    const announcer = screen.getByTestId('locale-announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer).not.toHaveAttribute('role');
    expect(announcer).toHaveTextContent('');
    // footer EnvStatus also uses aria-live; the announcer is the only sr-only one
    expect(container.querySelectorAll('.sr-only[aria-live]')).toHaveLength(1);
    expect(live.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  it('announces in the new language on change, and never adds a second role=status', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Filipino' }));
    expect(screen.getByTestId('locale-announcer')).toHaveTextContent('Napalitan ang wika sa Filipino');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByTestId('locale-announcer')).toHaveTextContent('Language changed to English');
  });
});

describe('Menu page language switch', () => {
  it.each(['en', 'fil'] as const)('is reachable and works on /menu (%s)', async (locale) => {
    renderApp('/menu', locale);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Menu');
    const main = screen.getByRole('main');
    const group = within(main).getByRole('group');
    expect(group).toHaveAttribute('aria-label', CATALOGS[locale]['locale.switchLabel'].text);
    const target = locale === 'en' ? 'Filipino' : 'English';
    await userEvent.click(within(group).getByRole('button', { name: target }));
    expect(document.documentElement.lang).toBe(locale === 'en' ? 'fil' : 'en');
  });

  it('has zero axe violations with two switches on the page', async () => {
    const { container } = renderApp('/menu', 'fil');
    expect(formatViolations(await runAxe(container))).toBe('');
  });
});
