import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './App';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

const LABELS = ['Home', 'Learn', 'Clinics', 'Menu'];

describe('navigation', () => {
  it('mobile bottom nav has exactly four labelled items in order', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Mobile' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(LABELS);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/', '/learn', '/clinics', '/menu']);
  });

  it('desktop top nav has the same four items', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(LABELS);
  });

  it('marks only the current route with aria-current', () => {
    renderAt('/clinics');
    const nav = screen.getByRole('navigation', { name: 'Mobile' });
    const current = within(nav).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');
    expect(current.map((l) => l.textContent)).toEqual(['Clinics']);
  });

  it('Home is current only on /', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Mobile' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Learn' })).not.toHaveAttribute('aria-current');
  });
});

describe('routes and content', () => {
  it('shows a clearly labelled DEMO banner on every page', () => {
    renderAt('/learn');
    expect(screen.getByRole('note')).toHaveTextContent(/DEMO prototype/);
  });

  it('Home renders the Gentle Guidance hero with both actions and no diagnosis claim', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Care without judgment. Guidance without fear.');
    expect(screen.getByRole('link', { name: 'Explore Testing Options' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learn About STIs' })).toBeInTheDocument();
    expect(screen.getByText(/not a diagnosis/i)).toBeInTheDocument();
  });

  it.each([
    ['/learn', 'Learn'],
    ['/clinics', 'Clinics'],
    ['/menu', 'Menu'],
  ])('renders placeholder route %s', (path, title) => {
    renderAt(path);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
  });

  it('renders a not-found placeholder for unknown routes', () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page not found');
  });

  it('uses a text placeholder wordmark labelled DEMO', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'KALINGA (DEMO) home' })).toHaveTextContent('KALINGA');
  });
});

describe('design tokens', () => {
  it.each([
    ['--brand-midnight', '#101440'],
    ['--brand-navy', '#161955'],
    ['--brand-royal', '#221F6E'],
    ['--brand-vivid', '#261CA3'],
    ['--brand-electric', '#4025E1'],
    ['--brand-purple', '#3E2A75'],
    ['--brand-plum', '#613979'],
    ['--brand-mauve', '#86497B'],
    ['--brand-rose', '#AC5F7A'],
    ['--brand-coral', '#D37C7A'],
    ['--color-indigo', 'var\\(--brand-navy\\)'],
    ['--color-action', 'var\\(--brand-vivid\\)'],
    ['--color-ink', 'var\\(--text-primary\\)'],
    ['--space-unit', '8px'],
    ['--radius-button', '12px'],
    ['--radius-card', '16px'],
    ['--radius-feature', '24px'],
    ['--touch-target', '44px'],
  ])('declares %s: %s', (name, value) => {
    expect(tokensCss).toMatch(new RegExp(`${name}:\\s*${value};`));
  });

  it('declares heading and body font stacks with self-hosted families', () => {
    expect(tokensCss).toMatch(/--font-heading:\s*'Plus Jakarta Sans'/);
    expect(tokensCss).toMatch(/--font-body:\s*'Inter'/);
  });
});
