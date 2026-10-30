import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Locale, StaffMe, StaffRole } from '@kalinga/shared';
import { AppRoutes } from '../../App';
import { I18nProvider } from '../../i18n/I18nProvider';
import { CATALOGS } from '../../i18n/catalog';
import { queryClient } from '../../api/client';
import { formatViolations, runAxe } from '../../a11y/axe';
import { json, stubApi } from '../../test/clinic-fixtures';

const CSRF = 'csrf-token-admin-0123456789abcdef0123456789';

const me = (role: StaffRole): StaffMe => ({
  user: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', email: 'admin@example.test', displayName: 'DEMO Admin', role, isDemo: true },
  memberships: [],
  csrfToken: CSRF,
  sessionExpiresAt: '2099-01-01T00:00:00.000Z',
});

const SUMMARY = {
  generatedAt: '2026-10-30T04:00:00.000Z',
  scope: 'all',
  suppressionThreshold: 5,
  periods: [
    { period: '2026-09', received: '<5', awaiting: '<5', confirmed: '<5', alternative: '<5', cancelled: '<5', expired: '<5' },
    { period: '2026-10', received: 22, awaiting: '<5', confirmed: 5, alternative: 6, cancelled: 8, expired: '<5' },
  ],
  caveats: ['DEMO data only.'],
};

function stub(role: StaffRole, summary: unknown = SUMMARY) {
  return stubApi((url) => {
    const p = url.pathname;
    if (p === '/api/v1/staff/me') return json(me(role));
    if (p === '/api/v1/admin/reports/summary') return json(summary);
    if (p === '/api/v1/admin/reports/export.csv') return new Response('period,metric,count\r\n2026-10,received,22\r\n', { status: 200, headers: { 'content-type': 'text/csv' } });
    return json({}, 404);
  });
}

function renderPage(locale: Locale = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={['/admin/reports']}>
        <AppRoutes />
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => queryClient.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('admin reports page', () => {
  it('renders aggregate counts as plain text with "<5" for suppressed cells (en)', async () => {
    const fetchMock = stub('provincial_admin');
    const { container } = renderPage();
    const table = await screen.findByRole('table', { name: 'Appointment requests by month and status' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getAllByRole('cell').map((c) => c.textContent)).toEqual(['<5', '<5', '<5', '<5', '<5', '<5']);
    expect(within(rows[2]!).getAllByRole('cell').map((c) => c.textContent)).toEqual(['22', '<5', '5', '6', '8', '<5']);
    expect(screen.getByRole('heading', { level: 1, name: 'Request summary' })).toBeInTheDocument();
    expect(screen.getByText(/any count below 5/)).toBeInTheDocument();
    expect(screen.getByText(/DEMO data only/)).toBeInTheDocument();
    expect(container.querySelector('a[href^="http"]')).toBeNull();
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/reports/summary'));
    expect(String(call?.[0])).toContain('months=6');
    const v = await runAxe(container);
    expect(v, formatViolations(v)).toEqual([]);
  });

  it('is accessible in Filipino and offers a months selector', async () => {
    const fetchMock = stub('clinic_admin', { ...SUMMARY, scope: 'clinic' });
    const { container } = renderPage('fil');
    await screen.findByRole('table');
    expect(screen.getByRole('heading', { level: 2, name: 'Saklaw: ang klinika mo lamang' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Bilang ng buwang ipapakita'), '12');
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('months=12'))).toBe(true));
    const v = await runAxe(container);
    expect(v, formatViolations(v)).toEqual([]);
  });

  it('ignores a stale response: a slow earlier request cannot overwrite the newer months choice (S9-3)', async () => {
    let releaseSlow: (r: Response) => void = () => undefined;
    const slow = new Promise<Response>((resolve) => {
      releaseSlow = resolve;
    });
    const oldSummary = { ...SUMMARY, periods: [{ period: '2026-10', received: 99, awaiting: '<5', confirmed: '<5', alternative: '<5', cancelled: '<5', expired: '<5' }] };
    const newSummary = { ...SUMMARY, periods: [{ period: '2026-10', received: 31, awaiting: '<5', confirmed: '<5', alternative: '<5', cancelled: '<5', expired: '<5' }] };
    stubApi((url) => {
      if (url.pathname === '/api/v1/staff/me') return json(me('provincial_admin'));
      if (url.pathname === '/api/v1/admin/reports/summary') return url.searchParams.get('months') === '12' ? json(newSummary) : slow;
      return json({}, 404);
    });
    renderPage();
    await userEvent.selectOptions(await screen.findByLabelText('Months to show'), '12');
    expect(await screen.findByText('31')).toBeInTheDocument();
    releaseSlow(json(oldSummary));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('99')).not.toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
  });

  it('exports the CSV through an authenticated fetch and stores nothing', async () => {
    const fetchMock = stub('technical_admin');
    const create = vi.fn(() => 'blob:demo');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(revoke).toHaveBeenCalledWith('blob:demo');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/reports/export.csv'))).toBe(true);
    expect(await screen.findByText('CSV download started.')).toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('clinic_staff sees the forbidden message and the API is not asked for a summary', async () => {
    const fetchMock = stub('clinic_staff');
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/reports/summary'))).toBe(false);
  });

  it('has en and fil copy for every reports key, flagged unreviewed', () => {
    const keys = Object.keys(CATALOGS.en).filter((k) => k.startsWith('reports.'));
    expect(keys.length).toBeGreaterThan(20);
    for (const k of keys) {
      for (const l of ['en', 'fil'] as const) {
        const e = (CATALOGS[l] as Record<string, { text: string; review: string }>)[k];
        expect(e?.text, `${l}:${k}`).toBeTruthy();
        expect(e?.review).toBe('unreviewed');
      }
    }
  });
});
