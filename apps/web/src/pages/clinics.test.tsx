import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Locale } from '@kalinga/shared';
import { AppRoutes } from '../App';
import { I18nProvider } from '../i18n/I18nProvider';
import { fil } from '../i18n/catalog';
import { queryClient } from '../api/client';
import { BookingCta } from '../components/BookingCta';
import { formatViolations, runAxe } from '../a11y/axe';
import { CLINIC_A, CLINIC_B, CLINIC_C, DETAIL_A, DETAIL_B, json, listOf, stubApi } from '../test/clinic-fixtures';

function renderApp(path: string, locale: Locale = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => queryClient.clear());
afterEach(() => vi.unstubAllGlobals());

describe('Clinics page', () => {
  it('lists DEMO-labelled cards with verification freshness and explicit unknowns', async () => {
    stubApi(() => json(listOf([CLINIC_A, CLINIC_B, CLINIC_C])));
    renderApp('/clinics');
    expect(screen.getByRole('heading', { level: 1, name: 'Clinics' })).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'DEMO Clinic A – Fictitious' });
    expect(link).toHaveAttribute('href', '/clinics/demo-clinic-a');
    expect(screen.getAllByText('DEMO – fictitious listing, not a real clinic')).toHaveLength(3);

    const cardA = link.closest('li') as HTMLElement;
    // Verified free tier is named; the unverified "free" tier is NOT shown as free.
    expect(within(cardA).getByText(/HIV testing/)).toHaveTextContent('Offered · Free');
    expect(within(cardA).getByText(/Counselling/)).toHaveTextContent('Offered · Fee not confirmed');
    expect(within(cardA).getByText(/Details last checked/)).toBeInTheDocument();

    const cardB = screen.getByRole('link', { name: 'DEMO Clinic C – Fictitious' }).closest('li') as HTMLElement;
    expect(within(cardB).getByText(/May be out of date: last checked/)).toBeInTheDocument();
    // Unverified availability reads "Not confirmed", never "Offered", and no fee is implied.
    expect(within(cardB).getByText(/STI testing/)).toHaveTextContent('STI testing: Not confirmed');
    expect(cardB.textContent).not.toMatch(/Offered|Free|safe/i);

    const cardC = screen.getByRole('link', { name: 'DEMO Clinic D – Fictitious' }).closest('li') as HTMLElement;
    expect(within(cardC).getByText(/Never verified/)).toBeInTheDocument();
    expect(within(cardC).getByText('No services listed. Not confirmed.')).toBeInTheDocument();
  });

  it('links to the pathway and keeps the polite live region free of role=status', async () => {
    stubApi(() => json(listOf([CLINIC_A])));
    renderApp('/clinics');
    expect(screen.getByRole('link', { name: 'Help me narrow it down' })).toHaveAttribute('href', '/pathway');
    await screen.findByRole('link', { name: 'DEMO Clinic A – Fictitious' });
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(screen.getByText('1 clinics found').closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows a loading state', async () => {
    stubApi(() => new Promise<Response>(() => undefined));
    renderApp('/clinics');
    expect(await screen.findByText('Loading clinics...')).toBeInTheDocument();
  });

  it('shows an error state with retry', async () => {
    let fail = true;
    stubApi(() => (fail ? json({ error: { code: 'x', message: 'x', requestId: 'r' } }, 500) : json(listOf([CLINIC_A]))));
    renderApp('/clinics');
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent('Clinics could not be loaded right now');
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'DEMO Clinic A – Fictitious' })).toBeInTheDocument();
  });

  it('shows an empty state that does not imply there is no service, and clears filters', async () => {
    stubApi((url) => json(listOf(url.searchParams.get('municipality') ? [] : [CLINIC_A])));
    renderApp('/clinics');
    await screen.findByRole('link', { name: 'DEMO Clinic A – Fictitious' });
    await userEvent.selectOptions(screen.getByLabelText('Municipality'), 'Torrijos');
    const empty = await screen.findByTestId('clinics-empty');
    expect(empty).toHaveTextContent('No clinics match these filters.');
    expect(empty).toHaveTextContent('does not mean there is no service near you');
    await userEvent.click(within(empty).getByRole('button', { name: 'Clear all filters' }));
    expect(await screen.findByRole('link', { name: 'DEMO Clinic A – Fictitious' })).toBeInTheDocument();
    expect(screen.getByLabelText('Municipality')).toHaveValue('');
  });

  it('sends only the chosen filters and search text as query parameters', async () => {
    const fetchMock = stubApi(() => json(listOf([CLINIC_A])));
    renderApp('/clinics');
    await screen.findByRole('link', { name: 'DEMO Clinic A – Fictitious' });
    await userEvent.selectOptions(screen.getByLabelText('Municipality'), 'Boac');
    await userEvent.selectOptions(screen.getByLabelText('Service'), 'hiv_testing');
    await userEvent.selectOptions(screen.getByLabelText('Listed fee tier'), 'low');
    await userEvent.selectOptions(screen.getByLabelText('Privacy practice'), 'youth_friendly');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search clinics by name' }), 'clinic');
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => /municipality=Boac/.test(u) && /service=hiv_testing/.test(u) && /feeTier=low/.test(u) && /privacy=youth_friendly/.test(u) && /q=clinic/.test(u))).toBe(true);
    });
    expect(fetchMock.mock.calls.every((c) => (c[1] as RequestInit | undefined)?.credentials !== 'include')).toBe(true);
  });

  it('uses Filipino strings in fil', async () => {
    stubApi(() => json(listOf([CLINIC_B])));
    renderApp('/clinics', 'fil');
    expect(screen.getByRole('heading', { level: 1, name: fil['clinics.title'].text })).toBeInTheDocument();
    await screen.findByRole('link', { name: 'DEMO Clinic C – Fictitious' });
    expect(screen.getByText(fil['clinics.label.demo'].text)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(fil['clinics.verify.stale'].text))).toBeInTheDocument();
  });

  it('has no axe violations when loaded', async () => {
    stubApi(() => json(listOf([CLINIC_A, CLINIC_B, CLINIC_C])));
    const { container } = renderApp('/clinics');
    await screen.findByRole('link', { name: 'DEMO Clinic A – Fictitious' });
    expect(formatViolations(await runAxe(container))).toBe('');
  });
});

describe('Clinic profile', () => {
  it('shows the DEMO banner, verification freshness and every unknown explicitly', async () => {
    const fetchMock = stubApi(() => json(DETAIL_B));
    renderApp('/clinics/demo-clinic-c');
    expect(await screen.findByRole('heading', { level: 1, name: 'DEMO Clinic C – Fictitious' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContainEqual(expect.stringContaining('/public/clinics/demo-clinic-c'));
    expect(screen.getByTestId('clinic-demo-banner')).toHaveTextContent('fictitious DEMO listing');
    expect(screen.getByText(/May be out of date: last checked/)).toBeInTheDocument();
    expect(screen.getByText('Address not confirmed')).toBeInTheDocument();
    expect(screen.getByText('Contact details not confirmed')).toBeInTheDocument();

    const unknowns = screen.getByTestId('clinic-unknowns');
    expect(within(unknowns).getByText('Address')).toBeInTheDocument();
    expect(within(unknowns).getByText('Contact details')).toBeInTheDocument();
    expect(within(unknowns).getByText('Service availability: STI testing')).toBeInTheDocument();
    expect(within(unknowns).getByText('Fee: STI testing')).toBeInTheDocument();
    expect(within(unknowns).getByText('Practice: Youth-friendly')).toBeInTheDocument();
    expect(within(unknowns).getByText('Another detail')).toBeInTheDocument();
    expect(unknowns).toHaveTextContent(/do not assume they are available, free or private/);

    // Practices default to "Not confirmed"; nothing is called confirmed.
    const practices = screen.getByRole('region', { name: 'Privacy practices' });
    expect(within(practices).getAllByText('Not confirmed')).toHaveLength(5);
    expect(within(practices).queryByText('Confirmed')).not.toBeInTheDocument();
  });

  it('renders confirmed facts only when verified, and renders no booking control yet', async () => {
    stubApi(() => json(DETAIL_A));
    renderApp('/clinics/demo-clinic-a');
    await screen.findByRole('heading', { level: 1, name: 'DEMO Clinic A – Fictitious' });
    const practices = screen.getByRole('region', { name: 'Privacy practices' });
    expect(within(practices).getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText(/Fee not confirmed/)).toBeInTheDocument();
    expect(screen.getByText('Fictitious address – not a real location')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Compare with your priorities' })).toHaveAttribute('href', '/pathway');
    // BookingCta slot is wired but renders nothing (no disabled button, no "coming soon").
    expect(screen.queryByRole('link', { name: /request/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /request|book/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/coming/i)).not.toBeInTheDocument();
  });

  it('shows a not-available message on 404 and a generic error otherwise', async () => {
    stubApi(() => json({ error: { code: 'not_found', message: 'Not found.', requestId: 'r' } }, 404));
    const first = renderApp('/clinics/nope');
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent('We could not find this clinic');
    first.unmount();
    queryClient.clear();
    stubApi(() => json({}, 500));
    renderApp('/clinics/anything');
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent('could not be loaded');
  });

  it('has no axe violations when loaded', async () => {
    stubApi(() => json(DETAIL_B));
    const { container } = renderApp('/clinics/demo-clinic-c');
    await screen.findByRole('heading', { level: 1, name: 'DEMO Clinic C – Fictitious' });
    expect(formatViolations(await runAxe(container))).toBe('');
  });
});

describe('BookingCta slot', () => {
  const wrap = (ui: React.ReactNode) => render(<I18nProvider><MemoryRouter>{ui}</MemoryRouter></I18nProvider>);

  it('renders nothing by default', () => {
    const { container } = wrap(<BookingCta clinicSlug="demo-clinic-a" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a request link only when enabled (S5-2 hook), with an overridable target', () => {
    wrap(<BookingCta clinicSlug="demo-clinic-a" enabled />);
    expect(screen.getByRole('link', { name: 'Send a request to this clinic' })).toHaveAttribute('href', '/clinics/demo-clinic-a/request');
  });

  it('accepts a custom target', () => {
    wrap(<BookingCta clinicSlug="demo-clinic-a" enabled to="/request/new?clinic=demo-clinic-a" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/request/new?clinic=demo-clinic-a');
  });
});
