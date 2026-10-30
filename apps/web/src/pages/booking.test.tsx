import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { BookingConfig, Locale } from '@kalinga/shared';
import { AppRoutes } from '../App';
import { I18nProvider } from '../i18n/I18nProvider';
import { fil } from '../i18n/catalog';
import { queryClient } from '../api/client';
import { formatViolations, runAxe } from '../a11y/axe';
import { DETAIL_A, json, stubApi } from '../test/clinic-fixtures';

const CLINIC_ID = '11111111-1111-4111-8111-111111111111';
const REFERENCE = 'KAL-ABCDEFGHIJ';
const SECRET = 'Zk3-mQ9_secretValueThatIsLongEnoughToLookRealButIsADemo01';

const CFG: BookingConfig = {
  clinicId: CLINIC_ID,
  slug: 'demo-clinic-a',
  clinicName: 'DEMO Clinic A – Fictitious',
  isDemo: true,
  requestOnly: true,
  timezone: 'Asia/Manila',
  lowDisclosureSupported: true,
  disclosure: {
    dataFields: ['ageBand', 'preferredDate', 'preferredWindow', 'service', 'contactPreference', 'notes'],
    purpose: 'DEMO purpose text from the clinic config.',
    recipient: 'DEMO recipient text from the clinic config.',
    cancellation: 'DEMO cancellation text from the clinic config.',
    retentionDays: 30,
  },
  fields: {
    service: { mode: 'required', options: ['hiv_testing', 'counselling'] },
    contactPreference: { mode: 'optional', options: ['none', 'phone_call', 'sms', 'email'] },
    notes: { mode: 'optional', maxLength: 40 },
  },
  ageBands: [
    { value: 'under_15', availability: 'unavailable' },
    { value: '15_17', availability: 'demo_only' },
    { value: '18_plus', availability: 'accepted' },
  ],
  preferredWindows: ['morning', 'afternoon', 'any'],
  dateRange: { minDate: '2026-10-31', maxDate: '2026-11-29' },
};

const CREATED = {
  status: 'pending',
  requestOnly: true,
  demo: true,
  demoMinorFlow: false,
  reference: REFERENCE,
  secret: SECRET,
  clinic: { name: CFG.clinicName, slug: 'demo-clinic-a', isDemo: true },
  createdAt: '2026-10-30T04:00:00.000Z',
};

function lookupOk(over: Record<string, unknown> = {}) {
  return {
    reference: REFERENCE,
    status: 'pending',
    requestOnly: true,
    demo: true,
    clinic: CREATED.clinic,
    clinicNote: null,
    visitInstructions: null,
    updatedAt: '2026-10-30T04:00:00.000Z',
    ...over,
  };
}
const apiErr = (code: string, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { code, message: 'x', requestId: 'r' } }), { status, headers });

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc" data-path={loc.pathname + loc.search + loc.hash} />;
}

function renderApp(path: string, locale: Locale = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <Probe />
      </MemoryRouter>
    </I18nProvider>,
  );
}

type Handler = Parameters<typeof stubApi>[0];
/** API stub for the booking flow; per-test overrides win. */
function stubBooking(over: { config?: () => Response; create?: Handler; lookup?: Handler } = {}) {
  return stubApi((url, init) => {
    if (url.pathname.endsWith('/booking-config')) return over.config ? over.config() : json(CFG);
    if (url.pathname === '/api/v1/public/booking-requests') return over.create ? over.create(url, init) : json(CREATED, 201);
    if (url.pathname === '/api/v1/public/booking-requests/lookup') return over.lookup ? over.lookup(url, init) : json(lookupOk());
    if (url.pathname.startsWith('/api/v1/public/clinics/')) return json(DETAIL_A);
    return json({}, 404);
  });
}

const postsTo = (fetchMock: ReturnType<typeof stubApi>, suffix: string) =>
  fetchMock.mock.calls.filter((c) => String(c[0]).endsWith(suffix) && (c[1] as RequestInit | undefined)?.method === 'POST');
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
const headersOf = (call: unknown[]) => (call[1] as RequestInit).headers as Record<string, string>;

/** The form (not the loading placeholder, which shares the h1) is on screen. */
const ready = () => screen.findByRole('heading', { level: 2, name: 'Your request' });

async function fillValid() {
  await userEvent.click(screen.getByRole('radio', { name: /18 or older/ }));
  await userEvent.selectOptions(screen.getByLabelText(/^Service/), 'counselling');
  fireEvent.change(screen.getByLabelText(/Preferred date/), { target: { value: '2026-11-03' } });
  await userEvent.selectOptions(screen.getByLabelText(/Preferred time of day/), 'morning');
  await userEvent.click(screen.getByRole('checkbox', { name: /I have read what this clinic asks/ }));
}

let setItem: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  queryClient.clear();
  setItem = vi.spyOn(Storage.prototype, 'setItem');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Booking request form', () => {
  it('shows the honest request wording and the clinic disclosure BEFORE any field', async () => {
    stubBooking();
    renderApp('/clinics/demo-clinic-a/request');
    await ready();
    expect(screen.getByRole('heading', { level: 1, name: 'Appointment request' })).toBeInTheDocument();
    expect(screen.getByTestId('request-notice')).toHaveTextContent('This is a request, not a confirmed appointment');
    expect(screen.getByText('DEMO Clinic A – Fictitious')).toBeInTheDocument();
    expect(screen.getByText(/this clinic is fictitious/)).toBeInTheDocument();

    const disclosure = screen.getByRole('heading', { level: 2, name: /Before you start/ });
    const formHeading = screen.getByRole('heading', { level: 2, name: 'Your request' });
    expect(disclosure.compareDocumentPosition(formHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const fields = within(screen.getByTestId('disclosure-fields'));
    for (const f of ['Age group', 'Preferred date', 'Preferred time of day', 'Service', 'How you would like to be contacted', 'Notes']) {
      expect(fields.getByText(f)).toBeInTheDocument();
    }
    expect(screen.getByText('DEMO purpose text from the clinic config.')).toBeInTheDocument();
    expect(screen.getByText('DEMO recipient text from the clinic config.')).toBeInTheDocument();
    expect(screen.getByText('DEMO cancellation text from the clinic config.')).toBeInTheDocument();
    expect(screen.getByText(/No name, phone number, email, date of birth/)).toBeInTheDocument();
    expect(screen.queryByText(/booked|confirmed!/i)).not.toBeInTheDocument();
  });

  it('renders only the fields the clinic collects (dynamic from config)', async () => {
    const lean: BookingConfig = {
      ...CFG,
      disclosure: { ...CFG.disclosure, dataFields: ['ageBand', 'preferredDate', 'preferredWindow'] },
      fields: { service: { mode: 'hidden', options: [] }, contactPreference: { mode: 'hidden', options: [] }, notes: { mode: 'hidden', maxLength: 200 } },
    };
    stubBooking({ config: () => json(lean) });
    renderApp('/clinics/demo-clinic-a/request');
    await ready();
    expect(screen.queryByLabelText(/^Service/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/How you would like to be contacted/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Notes/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Preferred date/)).toBeInTheDocument();
  });

  it('validates inline on blur and on submit, with an error summary, and sends nothing while invalid', async () => {
    const fetchMock = stubBooking();
    renderApp('/clinics/demo-clinic-a/request');
    await ready();
    const date = screen.getByLabelText(/Preferred date/);
    expect(screen.queryByText('Choose a preferred date.')).not.toBeInTheDocument();
    fireEvent.focus(date);
    fireEvent.blur(date);
    expect(screen.getByText('Choose a preferred date.')).toBeInTheDocument();
    expect(date).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(date, { target: { value: '2027-05-05' } });
    expect(screen.getByText('Choose a date within the available range.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    const summary = screen.getByTestId('error-summary');
    expect(summary).toHaveAttribute('role', 'alert');
    expect(within(summary).getByText('Choose an age group.')).toBeInTheDocument();
    expect(within(summary).getByText('Choose a service.')).toBeInTheDocument();
    expect(within(summary).getByText('Please confirm you have read the details above.')).toBeInTheDocument();
    await waitFor(() => expect(summary).toHaveFocus());
    // Summary entries move focus to the field.
    await userEvent.click(within(summary).getByRole('button', { name: 'Choose a service.' }));
    expect(screen.getByLabelText(/^Service/)).toHaveFocus();
    expect(postsTo(fetchMock, '/booking-requests')).toHaveLength(0);
  });

  it('blocks ages the API marks unavailable and labels the DEMO-only band honestly', async () => {
    const fetchMock = stubBooking();
    renderApp('/clinics/demo-clinic-a/request');
    await ready();
    await userEvent.click(screen.getByRole('radio', { name: /Under 15/ }));
    expect(screen.getByText(/Online requests are not available for this age group in this version/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /15 to 17/ }));
    expect(screen.getByRole('radio', { name: /15 to 17 \(DEMO only\)/ })).toBeChecked();
    expect(screen.getByText(/no approved procedure for minors exists yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Under 15/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(postsTo(fetchMock, '/booking-requests')).toHaveLength(0);
  });

  it('submits with an Idempotency-Key and minimal body, then shows reference + masked secret ONCE, never in URL or storage', async () => {
    const fetchMock = stubBooking();
    renderApp('/clinics/demo-clinic-a/request');
    await ready();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));

    const done = await screen.findByRole('heading', { level: 1, name: 'Request sent: pending clinic review' });
    await waitFor(() => expect(done).toHaveFocus());
    const calls = postsTo(fetchMock, '/booking-requests');
    expect(calls).toHaveLength(1);
    expect(bodyOf(calls[0] as unknown[])).toEqual({
      clinicId: CLINIC_ID,
      ageBand: '18_plus',
      preferredDate: '2026-11-03',
      preferredWindow: 'morning',
      service: 'counselling',
      acknowledgedDisclosure: true,
    });
    expect(headersOf(calls[0] as unknown[])['Idempotency-Key']).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect((calls[0]?.[1] as RequestInit).credentials).toBe('omit');

    expect(screen.getByText(/This is a request, not a confirmed appointment/)).toBeInTheDocument();
    expect(screen.getByText('DEMO: no real clinic received this.')).toBeInTheDocument();
    expect(screen.getByLabelText('Your reference (not secret)')).toHaveValue(REFERENCE);
    const secret = screen.getByLabelText('Your access secret (keep private)');
    expect(secret).toHaveAttribute('type', 'password');
    expect(screen.getByText(/shown only once and cannot be recovered/)).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Show secret' });
    await userEvent.click(toggle);
    expect(secret).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide secret' })).toHaveAttribute('aria-pressed', 'true');

    // Never in the URL, never in any storage, never as the query cache value.
    expect(screen.getByTestId('loc').dataset.path).toBe('/clinics/demo-clinic-a/request');
    expect(setItem).not.toHaveBeenCalled();
    expect(JSON.stringify({ ...localStorage })).not.toContain(SECRET);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(SECRET);
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map((q) => q.state.data))).not.toContain(SECRET);
    expect(JSON.stringify(queryClient.getMutationCache().getAll().map((m) => [m.state.data, m.state.variables]))).not.toContain(SECRET);

    // Clearing the screen removes the secret from the DOM and leaves the request page.
    await userEvent.click(screen.getByRole('button', { name: 'Done: clear this screen' }));
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(screen.getByTestId('loc').dataset.path).toBe('/clinics/demo-clinic-a');
  });

  it('copies the reference and secret and reports it politely, or says copying is unavailable', async () => {
    stubBooking();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderApp('/clinics/demo-clinic-a/request');
    await ready();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await screen.findByRole('heading', { level: 1, name: 'Request sent: pending clinic review' });
    await userEvent.click(screen.getByRole('button', { name: 'Copy reference' }));
    expect(writeText).toHaveBeenLastCalledWith(REFERENCE);
    await waitFor(() => expect(screen.getByTestId('copy-live')).toHaveTextContent('Reference copied'));
    expect(screen.getByTestId('copy-live')).toHaveAttribute('aria-live', 'polite');
    await userEvent.click(screen.getByRole('button', { name: 'Copy secret' }));
    expect(writeText).toHaveBeenLastCalledWith(SECRET);
    await waitFor(() => expect(screen.getByTestId('copy-live')).toHaveTextContent('Secret copied'));

    writeText.mockRejectedValueOnce(new Error('denied'));
    await userEvent.click(screen.getByRole('button', { name: 'Copy secret' }));
    await waitFor(() => expect(screen.getByTestId('copy-live')).toHaveTextContent('Copying is not available here'));
  });

  it('re-sends the SAME Idempotency-Key when retrying an unchanged request after a network failure, and a new one after an edit', async () => {
    let n = 0;
    const fetchMock = stubBooking({
      create: () => {
        n += 1;
        if (n <= 2) throw new TypeError('offline');
        return json(CREATED, 201);
      },
    });
    renderApp('/clinics/demo-clinic-a/request');
    await ready();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByTestId('send-error')).toHaveTextContent('Sending again will not create a duplicate');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(postsTo(fetchMock, '/booking-requests')).toHaveLength(2));
    const [k1, k2] = postsTo(fetchMock, '/booking-requests').map((c) => headersOf(c as unknown[])['Idempotency-Key']);
    expect(k1).toBe(k2);

    await waitFor(() => expect(screen.getByTestId('send-error')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/Preferred time of day/), 'afternoon');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await screen.findByRole('heading', { level: 1, name: 'Request sent: pending clinic review' });
    const k3 = headersOf(postsTo(fetchMock, '/booking-requests')[2] as unknown[])['Idempotency-Key'];
    expect(k3).not.toBe(k1);
  });

  it('explains server-side rejections without leaking detail', async () => {
    stubBooking({ create: () => apiErr('minor_policy_not_configured', 422) });
    renderApp('/clinics/demo-clinic-a/request');
    await ready();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByTestId('send-error')).toHaveTextContent('This age group cannot send an online request in this version.');
  });

  it('never shows a secret for a replayed (already created) request', async () => {
    const replay = { alreadyCreated: true, status: 'pending', requestOnly: true, demo: true, reference: REFERENCE, clinic: CREATED.clinic };
    stubBooking({ create: () => json(replay, 200) });
    renderApp('/clinics/demo-clinic-a/request');
    await ready();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'This request was already received' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your reference (not secret)')).toHaveValue(REFERENCE);
    expect(screen.queryByTestId('booking-secret-card')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Your access secret (keep private)')).not.toBeInTheDocument();
  });

  it('shows an unavailable page when the clinic does not take requests, and not-found for an unknown clinic', async () => {
    stubBooking({ config: () => apiErr('booking_not_available', 404) });
    const first = renderApp('/clinics/demo-clinic-c/request');
    expect(await screen.findByRole('heading', { level: 1, name: 'Requests are not available for this clinic' })).toBeInTheDocument();
    first.unmount();
    queryClient.clear();
    stubBooking({ config: () => apiErr('not_found', 404) });
    renderApp('/clinics/nope/request');
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not find this clinic');
  });

  it('is available in Filipino (draft strings) and flags nothing as reviewed', async () => {
    stubBooking();
    renderApp('/clinics/demo-clinic-a/request', 'fil');
    await screen.findByRole('heading', { level: 2, name: fil['booking.form.heading'].text });
    expect(screen.getByRole('heading', { level: 1, name: fil['booking.title'].text })).toBeInTheDocument();
    expect(screen.getByTestId('request-notice')).toHaveTextContent(fil['booking.requestNotice'].text);
    expect(screen.getByRole('button', { name: fil['booking.submit'].text })).toBeInTheDocument();
    expect(fil['booking.requestNotice'].review).toBe('unreviewed');
  });

  it('has no axe violations (form, errors, receipt)', async () => {
    stubBooking();
    const { container } = renderApp('/clinics/demo-clinic-a/request');
    await ready();
    expect(formatViolations(await runAxe(container))).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(formatViolations(await runAxe(container))).toBe('');
    await userEvent.click(screen.getByRole('radio', { name: /Under 15/ }));
    expect(formatViolations(await runAxe(container))).toBe('');
    await userEvent.click(screen.getByRole('radio', { name: /18 or older/ }));
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await screen.findByRole('heading', { level: 1, name: 'Request sent: pending clinic review' });
    expect(formatViolations(await runAxe(container))).toBe('');
  });
});

describe('Clinic profile request link', () => {
  it('shows the request link only when the clinic takes requests', async () => {
    stubBooking();
    const first = renderApp('/clinics/demo-clinic-a');
    const link = await screen.findByRole('link', { name: 'Send a request to this clinic' });
    expect(link).toHaveAttribute('href', '/clinics/demo-clinic-a/request');
    first.unmount();
    queryClient.clear();
    stubBooking({ config: () => apiErr('booking_not_available', 404) });
    renderApp('/clinics/demo-clinic-a');
    expect(await screen.findByText('This clinic is not taking online requests in this DEMO.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Send a request to this clinic' })).not.toBeInTheDocument();
  });
});

describe('Menu entry point', () => {
  it('links to the status lookup', () => {
    stubBooking();
    renderApp('/menu');
    expect(screen.getByRole('link', { name: 'Check a request status' })).toHaveAttribute('href', '/appointments/lookup');
  });
});

describe('Status lookup page', () => {
  async function submit(reference = REFERENCE, secret = SECRET) {
    await userEvent.type(screen.getByLabelText('Reference'), reference);
    await userEvent.type(screen.getByLabelText('Secret'), secret);
    await userEvent.click(screen.getByRole('button', { name: 'Check status' }));
  }

  it('posts the reference and secret in the body only, with no URL, storage or header leakage', async () => {
    const fetchMock = stubBooking();
    renderApp('/appointments/lookup');
    expect(screen.getByRole('heading', { level: 1, name: 'Check a request' })).toBeInTheDocument();
    expect(screen.getByLabelText('Secret')).toHaveAttribute('type', 'password');
    expect(document.querySelector('form')).toHaveAttribute('method', 'post');
    await submit();
    expect(await screen.findByTestId('lookup-result')).toBeInTheDocument();
    const calls = postsTo(fetchMock, '/booking-requests/lookup');
    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.[0])).toBe('/api/v1/public/booking-requests/lookup');
    expect(bodyOf(calls[0] as unknown[])).toEqual({ reference: REFERENCE, secret: SECRET });
    expect(JSON.stringify(headersOf(calls[0] as unknown[]))).not.toContain(SECRET);
    expect(screen.getByTestId('loc').dataset.path).toBe('/appointments/lookup');
    expect(setItem).not.toHaveBeenCalled();
    // No GET ever carries credentials.
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes(SECRET) && !String(c[0]).includes(REFERENCE))).toBe(true);
    // The secret is cleared from the field after success and is not in the DOM.
    expect(screen.getByLabelText('Secret')).toHaveValue('');
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(JSON.stringify(queryClient.getMutationCache().getAll().map((m) => [m.state.data, m.state.variables]))).not.toContain(SECRET);
  });

  it('says pending is not confirmed, and distinguishes the other statuses with clinic notes', async () => {
    const table: [string, Record<string, unknown>, RegExp, RegExp][] = [
      ['pending', {}, /Pending clinic review/, /A pending request is not a confirmed appointment/],
      ['confirmed', { clinicNote: 'DEMO note', visitInstructions: 'DEMO arrive early' }, /Confirmed by the clinic/, /Follow the clinic instructions/],
      ['alternative_offered', { clinicNote: 'DEMO try another day' }, /suggested a different option/, /Nothing is confirmed yet/],
      ['cancelled', {}, /^Cancelled$/, /was cancelled/],
      ['expired', {}, /^Expired$/, /has expired/],
    ];
    for (const [status, extra, title, body] of table) {
      queryClient.clear();
      stubBooking({ lookup: () => json(lookupOk({ status, ...extra })) });
      const view = renderApp('/appointments/lookup');
      await submit();
      const result = await screen.findByTestId('lookup-result');
      expect(result.dataset.status).toBe(status);
      expect(within(result).getByText(title)).toBeInTheDocument();
      expect(within(result).getByText(body)).toBeInTheDocument();
      expect(within(result).getByRole('link', { name: 'DEMO Clinic A – Fictitious' })).toHaveAttribute('href', '/clinics/demo-clinic-a');
      if (extra.clinicNote) expect(within(result).getByText(String(extra.clinicNote))).toBeInTheDocument();
      if (extra.visitInstructions) expect(within(result).getByText(String(extra.visitInstructions))).toBeInTheDocument();
      if (status !== 'confirmed') expect(within(result).queryByText(/^Confirmed by the clinic$/)).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('shows one generic failure for any mismatch and never says which part was wrong', async () => {
    stubBooking({ lookup: () => apiErr('lookup_failed', 404) });
    renderApp('/appointments/lookup');
    await submit();
    const alert = await screen.findByTestId('lookup-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('We could not find a request with that reference and secret.');
    expect(alert).toHaveTextContent('we do not say which one is wrong');
    expect(screen.queryByTestId('lookup-result')).not.toBeInTheDocument();
  });

  it('explains throttling with a wait time from Retry-After, and network errors separately', async () => {
    stubBooking({ lookup: () => apiErr('lookup_throttled', 429, { 'retry-after': '840' }) });
    const first = renderApp('/appointments/lookup');
    await submit();
    expect(await screen.findByTestId('lookup-error')).toHaveTextContent('Too many attempts. Please wait about 14 minute(s) before trying again.');
    first.unmount();
    queryClient.clear();
    stubBooking({
      lookup: () => {
        throw new TypeError('offline');
      },
    });
    renderApp('/appointments/lookup');
    await submit();
    expect(await screen.findByTestId('lookup-error')).toHaveTextContent('We could not reach the service');
  });

  it('validates required inputs without calling the API, and Clear resets the screen', async () => {
    const fetchMock = stubBooking();
    renderApp('/appointments/lookup');
    await userEvent.click(screen.getByRole('button', { name: 'Check status' }));
    expect(screen.getByText('Enter your reference.')).toBeInTheDocument();
    expect(screen.getByText('Enter your secret.')).toBeInTheDocument();
    expect(postsTo(fetchMock, '/booking-requests/lookup')).toHaveLength(0);
    await userEvent.type(screen.getByLabelText('Reference'), 'KAL-X');
    await userEvent.type(screen.getByLabelText('Secret'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Show secret' }));
    expect(screen.getByLabelText('Secret')).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Clear this screen' }));
    expect(screen.getByLabelText('Reference')).toHaveValue('');
    expect(screen.getByLabelText('Secret')).toHaveValue('');
    expect(screen.getByLabelText('Secret')).toHaveAttribute('type', 'password');
  });

  it('is available in Filipino', () => {
    stubBooking();
    renderApp('/appointments/lookup', 'fil');
    expect(screen.getByRole('heading', { level: 1, name: fil['lookup.title'].text })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: fil['lookup.submit'].text })).toBeInTheDocument();
  });

  it('has no axe violations (form, error, result)', async () => {
    stubBooking({ lookup: () => json(lookupOk({ status: 'confirmed', clinicNote: 'DEMO note' })) });
    const { container } = renderApp('/appointments/lookup');
    expect(formatViolations(await runAxe(container))).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Check status' }));
    expect(formatViolations(await runAxe(container))).toBe('');
    await submit();
    await screen.findByTestId('lookup-result');
    expect(formatViolations(await runAxe(container))).toBe('');
  });
});
