import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { Locale, StaffBookingDetail, StaffBookingItem, StaffMe } from '@kalinga/shared';
import { AppRoutes } from '../App';
import { I18nProvider } from '../i18n/I18nProvider';
import { queryClient } from '../api/client';
import { formatViolations, runAxe } from '../a11y/axe';
import { json, stubApi } from '../test/clinic-fixtures';

const CLINIC_A = '11111111-1111-4111-8111-111111111111';
const CLINIC_B = '22222222-2222-4222-8222-222222222222';
const REQ_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQ_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CSRF = 'csrf-token-0123456789abcdef0123456789abcdef';
const PASSWORD = 'demo-only-password-not-real';

const ME: StaffMe = {
  user: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'staff.a@example.test', displayName: 'DEMO Staff A', role: 'clinic_staff', isDemo: true },
  memberships: [{ clinicId: CLINIC_A, clinicSlug: 'demo-clinic-a', clinicName: 'DEMO Clinic A', role: 'clinic_staff' }],
  csrfToken: CSRF,
  sessionExpiresAt: '2099-01-01T00:00:00.000Z',
};
const ME_TWO: StaffMe = {
  ...ME,
  memberships: [...ME.memberships, { clinicId: CLINIC_B, clinicSlug: 'demo-clinic-b', clinicName: 'DEMO Clinic B', role: 'clinic_admin' }],
};

const item = (over: Partial<StaffBookingItem> = {}): StaffBookingItem => ({
  id: REQ_1,
  reference: 'KAL-AAAAAAAAAA',
  status: 'pending',
  version: 1,
  preferredDate: '2026-11-03',
  preferredWindow: 'morning',
  service: 'counselling',
  ageBand: '18_plus',
  isDemo: true,
  createdAt: '2026-10-30T04:00:00.000Z',
  updatedAt: '2026-10-30T04:00:00.000Z',
  ...over,
});

const detail = (over: Partial<StaffBookingDetail> = {}): StaffBookingDetail => ({
  ...item(),
  clinic: { id: CLINIC_A, slug: 'demo-clinic-a', name: 'DEMO Clinic A' },
  contactPreference: 'sms',
  notes: 'Prefer a quiet hour.',
  isDemoMinorFlow: false,
  clinicNote: null,
  visitInstructions: null,
  visitStartsAt: null,
  alternativeStartsAt: null,
  decidedAt: null,
  allowedTransitions: ['confirmed', 'alternative_offered', 'cancelled'],
  ...over,
});

const apiErr = (code: string, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { code, message: 'x', requestId: 'r' } }), { status, headers });

interface World {
  signedIn: boolean;
  me: StaffMe;
  login?: (init?: RequestInit) => Response;
  list?: (url: URL) => Response | Promise<Response>;
  detail?: () => Response;
  patch?: (init?: RequestInit) => Response;
  logout?: () => Response;
}

/** Fake staff API with a cookie-like `signedIn` flag. Returns the fetch mock and the mutable world. */
function stubStaff(initial: Partial<World> = {}) {
  const world: World = { signedIn: false, me: ME, ...initial };
  const fetchMock = stubApi((url, init) => {
    const p = url.pathname;
    if (p === '/api/v1/staff/login') {
      if (world.login) return world.login(init);
      world.signedIn = true;
      return json(world.me);
    }
    if (p === '/api/v1/staff/logout') {
      world.signedIn = false;
      return world.logout ? world.logout() : new Response(null, { status: 204 });
    }
    if (!world.signedIn) return apiErr('unauthenticated', 401);
    if (p === '/api/v1/staff/me') return json(world.me);
    const m = /^\/api\/v1\/staff\/clinics\/([^/]+)\/booking-requests(?:\/([^/]+)(\/status)?)?$/.exec(p);
    if (!m) return json({}, 404);
    if (!m[2]) {
      if (world.list) return world.list(url);
      return json({ items: [item(), item({ id: REQ_2, reference: 'KAL-BBBBBBBBBB', status: 'confirmed', version: 4, service: null })], total: 2, limit: 20, offset: 0 });
    }
    if (m[3]) {
      if (world.patch) return world.patch(init);
      const body = JSON.parse(String(init?.body)) as { status: StaffBookingDetail['status'] };
      return json(detail({ status: body.status, version: 2, allowedTransitions: [], decidedAt: '2026-10-30T05:00:00.000Z' }));
    }
    return world.detail ? world.detail() : json(detail());
  });
  return { fetchMock, world };
}

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc" data-path={loc.pathname + loc.search} />;
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
const here = () => screen.getByTestId('loc').getAttribute('data-path');
const staffCalls = (fetchMock: ReturnType<typeof stubApi>) => fetchMock.mock.calls.filter((c) => String(c[0]).startsWith('/api/v1/staff'));
const callsTo = (fetchMock: ReturnType<typeof stubApi>, suffix: string, method?: string) =>
  staffCalls(fetchMock).filter((c) => String(c[0]).split('?')[0]?.endsWith(suffix) && (method === undefined || (c[1] as RequestInit | undefined)?.method === method));
const headersOf = (call: unknown[]) => (call[1] as RequestInit).headers as Record<string, string>;
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;

async function signIn() {
  await userEvent.type(screen.getByLabelText('Email'), 'staff.a@example.test');
  await userEvent.type(screen.getByLabelText('Password'), PASSWORD);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

let setItem: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  queryClient.clear();
  setItem = vi.spyOn(Storage.prototype, 'setItem');
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const noStaffInStorage = () => {
  // Only the language preference may ever be written by the app; never anything staff-related.
  for (const call of setItem.mock.calls) expect(String(call[0]) + String(call[1])).not.toMatch(/csrf|staff|session|token|password|KAL-/i);
  expect(document.cookie).not.toMatch(/csrf|staff|session/i);
};

describe('staff login', () => {
  it('renders an accessible form, a DEMO banner and has no axe violations (en and fil)', async () => {
    stubStaff();
    for (const locale of ['en', 'fil'] as const) {
      const { container, unmount } = renderApp('/staff/login', locale);
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.getByRole('note')).toHaveTextContent(/DEMO/);
      const email = container.querySelector('#staff-email') as HTMLInputElement;
      const pw = container.querySelector('#staff-password') as HTMLInputElement;
      expect(email.type).toBe('email');
      expect(pw.type).toBe('password');
      expect(email.getAttribute('autocomplete')).toBe('off');
      expect(pw.getAttribute('autocomplete')).toBe('off');
      expect(container.querySelector('form')?.getAttribute('method')).toBe('post');
      const v = await runAxe(container);
      expect(v, formatViolations(v)).toEqual([]);
      unmount();
    }
  });

  it('validates empty fields without calling the API', async () => {
    const { fetchMock } = stubStaff();
    renderApp('/staff/login');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(staffCalls(fetchMock)).toHaveLength(0);
  });

  it('signs in with a JSON POST (same-origin cookie, no-store), then shows the queue; nothing goes to storage', async () => {
    const { fetchMock } = stubStaff();
    renderApp('/staff/login');
    await signIn();
    await screen.findByRole('heading', { level: 1, name: 'Booking requests' });
    expect(here()).toBe('/staff/requests');
    const [call] = callsTo(fetchMock, '/login', 'POST');
    expect(call).toBeDefined();
    const init = call?.[1] as RequestInit;
    expect(init.credentials).toBe('same-origin');
    expect(init.cache).toBe('no-store');
    expect(bodyOf(call!)).toEqual({ email: 'staff.a@example.test', password: PASSWORD });
    // No credentials or tokens in any URL.
    for (const c of staffCalls(fetchMock)) expect(String(c[0])).not.toMatch(/password|csrf|staff\.a@/);
    noStaffInStorage();
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain(CSRF);
    expect(JSON.stringify(Object.entries(sessionStorage))).not.toContain(CSRF);
  });

  it('shows one generic message for a failed sign-in and clears the password', async () => {
    stubStaff({ login: () => apiErr('login_failed', 401) });
    renderApp('/staff/login');
    await signIn();
    expect(await screen.findByTestId('staff-login-error')).toHaveTextContent('Sign-in failed. Check your details and try again.');
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
    expect(here()).toBe('/staff/login');
  });

  it('shows the throttle message with the wait in minutes on 429', async () => {
    stubStaff({ login: () => apiErr('login_throttled', 429, { 'Retry-After': '600' }) });
    renderApp('/staff/login');
    await signIn();
    expect(await screen.findByTestId('staff-login-error')).toHaveTextContent('Too many sign-in attempts. Wait about 10 minutes before trying again.');
  });

  it('shows a network message when the service is unreachable', async () => {
    stubStaff({ login: () => { throw new TypeError('offline'); } });
    renderApp('/staff/login');
    await signIn();
    expect(await screen.findByTestId('staff-login-error')).toHaveTextContent('We could not reach the service');
  });
});

describe('staff guard and session', () => {
  it('redirects /staff/requests to login when /me is 401', async () => {
    const { fetchMock } = stubStaff();
    renderApp('/staff/requests');
    await screen.findByRole('heading', { level: 1, name: 'Staff sign-in' });
    expect(here()).toBe('/staff/login');
    expect(callsTo(fetchMock, '/me')).toHaveLength(1);
  });

  it('redirects /staff to the queue when signed in', async () => {
    stubStaff({ signedIn: true });
    renderApp('/staff');
    await screen.findByRole('heading', { level: 1, name: 'Booking requests' });
    expect(here()).toBe('/staff/requests');
  });

  it('offers a retry when /me cannot be reached', async () => {
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname === '/api/v1/public/config') return json({});
        if (url.pathname === '/api/v1/staff/me') {
          if (fail) throw new TypeError('offline');
          return json(ME);
        }
        return json({ items: [], total: 0, limit: 20, offset: 0 });
      }),
    );
    renderApp('/staff/requests');
    expect(await screen.findByText('We could not check your session. Try again.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { level: 1, name: 'Booking requests' });
  });

  it('signs out: posts the CSRF token, clears client state and returns to login with a notice', async () => {
    const { fetchMock } = stubStaff({ signedIn: true });
    renderApp('/staff/requests');
    await screen.findByRole('heading', { level: 1, name: 'Booking requests' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { level: 1, name: 'Staff sign-in' });
    expect(screen.getByTestId('staff-login-notice')).toHaveTextContent('You have been signed out.');
    const [call] = callsTo(fetchMock, '/logout', 'POST');
    expect(headersOf(call!)['X-CSRF-Token']).toBe(CSRF);
    // No queue rows or identity remain on screen.
    expect(screen.queryByText('KAL-AAAAAAAAAA')).not.toBeInTheDocument();
    expect(screen.queryByText(/DEMO Staff A/)).not.toBeInTheDocument();
    noStaffInStorage();
  });

  it('still clears the screen when sign-out cannot be confirmed, and says so', async () => {
    stubStaff({ signedIn: true, logout: () => { throw new TypeError('offline'); } });
    renderApp('/staff/requests');
    await screen.findByRole('heading', { level: 1, name: 'Booking requests' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByTestId('staff-login-notice')).toHaveTextContent('could not confirm it with the server'));
    expect(screen.queryByText('KAL-AAAAAAAAAA')).not.toBeInTheDocument();
  });

  it('ends the session on a 401 from a staff request and says it expired', async () => {
    const { world } = stubStaff({ signedIn: true });
    renderApp('/staff/requests');
    await screen.findByText('KAL-AAAAAAAAAA');
    world.list = () => apiErr('unauthenticated', 401);
    await userEvent.selectOptions(screen.getByLabelText('Show requests with status'), 'pending');
    await screen.findByRole('heading', { level: 1, name: 'Staff sign-in' });
    expect(screen.getByTestId('staff-login-notice')).toHaveTextContent('Your session ended');
    expect(screen.queryByText('KAL-AAAAAAAAAA')).not.toBeInTheDocument();
  });

  it('ends the session on screen when the server expiry time passes', async () => {
    stubStaff({ signedIn: true, me: { ...ME, sessionExpiresAt: new Date(Date.now() + 900).toISOString() } });
    renderApp('/staff/requests');
    await screen.findByText('KAL-AAAAAAAAAA');
    await screen.findByRole('heading', { level: 1, name: 'Staff sign-in' }, { timeout: 3000 });
    expect(screen.getByTestId('staff-login-notice')).toHaveTextContent('Your session ended');
  });
});

describe('staff queue', () => {
  it('lists minimal metadata only, with role/clinic info, and no axe violations (en and fil)', async () => {
    stubStaff({ signedIn: true });
    for (const locale of ['en', 'fil'] as const) {
      const { container, unmount } = renderApp('/staff/requests', locale);
      await screen.findByText('KAL-AAAAAAAAAA');
      expect(screen.getByText('KAL-BBBBBBBBBB')).toBeInTheDocument();
      expect(container.textContent).toContain('DEMO Clinic A');
      expect(container.textContent).not.toContain('quiet hour');
      const rows = container.querySelectorAll('li.staff-item');
      expect(rows).toHaveLength(2);
      expect(within(rows[0] as HTMLElement).getByRole('link', { name: 'KAL-AAAAAAAAAA' }).getAttribute('href')).toBe(`/staff/requests/${REQ_1}?clinic=${CLINIC_A}`);
      const v = await runAxe(container);
      expect(v, formatViolations(v)).toEqual([]);
      unmount();
    }
  });

  it('uses Filipino status labels in fil', async () => {
    stubStaff({ signedIn: true });
    renderApp('/staff/requests', 'fil');
    await screen.findByText('KAL-AAAAAAAAAA');
    expect(screen.getAllByText('Nakabinbin').length).toBeGreaterThan(0);
  });

  it('filters by status through the API and resets paging', async () => {
    const { fetchMock } = stubStaff({ signedIn: true });
    renderApp('/staff/requests?offset=20');
    await screen.findByText('KAL-AAAAAAAAAA');
    await userEvent.selectOptions(screen.getByLabelText('Show requests with status'), 'pending');
    await waitFor(() => expect(here()).toBe('/staff/requests?status=pending'));
    const last = callsTo(fetchMock, '/booking-requests').at(-1)!;
    expect(String(last[0])).toContain('status=pending');
    expect(String(last[0])).toContain('offset=0');
    expect(String(last[0])).toContain(`/clinics/${CLINIC_A}/`);
  });

  it('paginates with previous/next and disables them at the ends', async () => {
    const many = Array.from({ length: 20 }, (_, i) => item({ id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`, reference: `KAL-PAGE${String(i).padStart(6, '0')}` }));
    const { fetchMock } = stubStaff({
      signedIn: true,
      list: (url) => json({ items: many, total: 45, limit: 20, offset: Number(url.searchParams.get('offset')) }),
    });
    renderApp('/staff/requests');
    await screen.findByText('KAL-PAGE000000');
    expect(screen.getByTestId('staff-queue-count')).toHaveTextContent('Showing 1-20 of 45');
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(here()).toBe('/staff/requests?offset=20'));
    await waitFor(() => expect(screen.getByTestId('staff-queue-count')).toHaveTextContent('Showing 21-40 of 45'));
    expect(String(callsTo(fetchMock, '/booking-requests').at(-1)![0])).toContain('offset=20');
  });

  it('shows loading, empty and error states', async () => {
    const { world } = stubStaff({ signedIn: true, list: () => json({ items: [], total: 0, limit: 20, offset: 0 }) });
    const { container } = renderApp('/staff/requests');
    expect(await screen.findByTestId('staff-queue-empty')).toHaveTextContent('No requests to show.');
    const v = await runAxe(container);
    expect(v, formatViolations(v)).toEqual([]);
    world.list = () => apiErr('internal_error', 500);
    await userEvent.selectOptions(screen.getByLabelText('Show requests with status'), 'confirmed');
    expect(await screen.findByText('We could not load the requests. Try again.')).toBeInTheDocument();
    world.list = () => json({ items: [item()], total: 1, limit: 20, offset: 0 });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('KAL-AAAAAAAAAA');
  });

  it('shows a loading status first', async () => {
    stubStaff({ signedIn: true, list: () => new Promise<Response>((r) => setTimeout(() => r(json({ items: [], total: 0, limit: 20, offset: 0 })), 150)) });
    renderApp('/staff/requests');
    expect(await screen.findByText('Loading requests...')).toBeInTheDocument();
    await screen.findByTestId('staff-queue-empty');
  });

  it('switches clinic from the memberships and reloads that clinic queue', async () => {
    const { fetchMock } = stubStaff({ signedIn: true, me: ME_TWO });
    const { container } = renderApp('/staff/requests');
    await screen.findByText('KAL-AAAAAAAAAA');
    const v = await runAxe(container);
    expect(v, formatViolations(v)).toEqual([]);
    await userEvent.selectOptions(screen.getByLabelText('Clinic'), CLINIC_B);
    await waitFor(() => expect(here()).toBe(`/staff/requests?clinic=${CLINIC_B}`));
    await waitFor(() => expect(String(callsTo(fetchMock, '/booking-requests').at(-1)![0])).toContain(`/clinics/${CLINIC_B}/`));
    expect(screen.getByText(/Role at this clinic: Clinic administrator/)).toBeInTheDocument();
  });

  it('shows a no-access notice for an account with no clinic membership', async () => {
    stubStaff({ signedIn: true, me: { ...ME, user: { ...ME.user, role: 'technical_admin' }, memberships: [] } });
    renderApp('/staff/requests');
    expect(await screen.findByRole('heading', { name: 'No clinic access' })).toBeInTheDocument();
    expect(screen.getByText(/Technical administrator/)).toBeInTheDocument();
  });

  it('keeps the DEMO banner visible on every staff route', async () => {
    stubStaff({ signedIn: true });
    renderApp(`/staff/requests/${REQ_1}?clinic=${CLINIC_A}`);
    await screen.findByText(/Request KAL-AAAAAAAAAA/);
    expect(screen.getByRole('note')).toHaveTextContent(/DEMO prototype/);
  });
});

describe('staff request detail and decisions', () => {
  const open = (locale: Locale = 'en') => renderApp(`/staff/requests/${REQ_1}?clinic=${CLINIC_A}`, locale);
  const ready = () => screen.findByRole('heading', { level: 1, name: /Request KAL-AAAAAAAAAA/ });

  it('shows the detail with no axe violations in every decision branch (en and fil)', async () => {
    stubStaff({ signedIn: true });
    for (const locale of ['en', 'fil'] as const) {
      const { container, unmount } = open(locale);
      await screen.findByRole('heading', { level: 1 });
      await screen.findByRole('group', { name: locale === 'en' ? 'Choose a decision' : 'Pumili ng pasya' });
      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(3);
      for (const r of radios) {
        await userEvent.click(r);
        const v = await runAxe(container);
        expect(v, formatViolations(v)).toEqual([]);
      }
      unmount();
    }
  });

  it('renders requester and clinic text as plain text, never as markup', async () => {
    const evil = '<img src=x onerror=alert(1)><script>window.__x=1</script> **bold**';
    stubStaff({ signedIn: true, detail: () => json(detail({ notes: evil, clinicNote: 'Visit: Mon 3 Nov 2026, 9:00 AM. <b>x</b>', visitInstructions: '<i>bring ID</i>' })) });
    const { container } = open();
    await ready();
    expect(screen.getByTestId('staff-detail-notes').textContent).toBe(evil);
    expect(screen.getByTestId('staff-detail-clinic-note').textContent).toBe('Visit: Mon 3 Nov 2026, 9:00 AM. <b>x</b>');
    expect(container.querySelector('main img, main script, main b, main i')).toBeNull();
    expect((window as unknown as { __x?: number }).__x).toBeUndefined();
  });

  it('disables decisions the transition matrix does not allow', async () => {
    stubStaff({ signedIn: true, detail: () => json(detail({ status: 'alternative_offered', allowedTransitions: ['confirmed', 'cancelled'] })) });
    open();
    await ready();
    expect(screen.getByRole('radio', { name: /Confirm the visit/ })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /Cancel the request/ })).toBeEnabled();
    const offer = screen.getByRole('radio', { name: /Offer another time/ });
    expect(offer).toBeDisabled();
    expect(offer.closest('label')).toHaveTextContent('(not available for this status)');
  });

  it('shows no form for terminal states', async () => {
    for (const status of ['confirmed', 'cancelled', 'expired'] as const) {
      stubStaff({ signedIn: true, detail: () => json(detail({ status, allowedTransitions: [] })) });
      const { container, unmount } = open();
      await ready();
      expect(screen.getByTestId('staff-no-actions')).toBeInTheDocument();
      expect(screen.queryAllByRole('radio')).toHaveLength(0);
      const v = await runAxe(container);
      expect(v, formatViolations(v)).toEqual([]);
      unmount();
    }
  });

  it('never trusts an allowed list wider than the shared matrix', async () => {
    stubStaff({ signedIn: true, detail: () => json(detail({ status: 'confirmed', allowedTransitions: ['cancelled'] })) });
    open();
    await ready();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('confirms with date, time and requirements: PATCH with If-Match and the CSRF header; saved state shown', async () => {
    const { fetchMock } = stubStaff({ signedIn: true });
    open();
    await ready();
    await userEvent.click(screen.getByRole('radio', { name: /Confirm the visit/ }));
    fireEvent.change(screen.getByLabelText('Visit date'), { target: { value: '2030-01-15' } });
    fireEvent.change(screen.getByLabelText(/Visit time/), { target: { value: '14:30' } });
    await userEvent.type(screen.getByLabelText(/What to bring or know/), 'Bring a valid ID.');
    await userEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(await screen.findByTestId('staff-saved')).toHaveTextContent('Decision saved');
    const [call] = callsTo(fetchMock, '/status', 'PATCH');
    expect(String(call![0])).toBe(`/api/v1/staff/clinics/${CLINIC_A}/booking-requests/${REQ_1}/status`);
    expect(headersOf(call!)['If-Match']).toBe('"1"');
    expect(headersOf(call!)['X-CSRF-Token']).toBe(CSRF);
    expect((call![1] as RequestInit).credentials).toBe('same-origin');
    expect(bodyOf(call!)).toEqual({ status: 'confirmed', visitDate: '2030-01-15', visitTime: '14:30', visitInstructions: 'Bring a valid ID.' });
    expect(screen.getByTestId('staff-detail-status')).toHaveAttribute('data-status', 'confirmed');
    expect(screen.getByTestId('staff-no-actions')).toBeInTheDocument();
    noStaffInStorage();
  });

  it('offers an alternative time with an optional note', async () => {
    const { fetchMock } = stubStaff({ signedIn: true });
    open();
    await ready();
    await userEvent.click(screen.getByRole('radio', { name: /Offer another time/ }));
    fireEvent.change(screen.getByLabelText('Proposed date'), { target: { value: '2030-01-16' } });
    fireEvent.change(screen.getByLabelText(/Proposed time/), { target: { value: '09:00' } });
    await userEvent.type(screen.getByLabelText(/Short note/), 'Mornings are quieter.');
    await userEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    await screen.findByTestId('staff-saved');
    expect(bodyOf(callsTo(fetchMock, '/status', 'PATCH')[0]!)).toEqual({
      status: 'alternative_offered',
      alternativeDate: '2030-01-16',
      alternativeTime: '09:00',
      clinicNote: 'Mornings are quieter.',
    });
  });

  it('cancels with no note (the note is optional)', async () => {
    const { fetchMock } = stubStaff({ signedIn: true });
    open();
    await ready();
    await userEvent.click(screen.getByRole('radio', { name: /Cancel the request/ }));
    expect(screen.queryByLabelText('Visit date')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    await screen.findByTestId('staff-saved');
    expect(bodyOf(callsTo(fetchMock, '/status', 'PATCH')[0]!)).toEqual({ status: 'cancelled' });
  });

  it('validates on the client before sending: no decision, missing date/time, angle brackets', async () => {
    const { fetchMock } = stubStaff({ signedIn: true });
    open();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(screen.getByText('Choose a decision.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Confirm the visit/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(screen.getByText('Choose a date.')).toBeInTheDocument();
    expect(screen.getByText('Enter a time, for example 14:30.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Visit date'), { target: { value: '2030-01-15' } });
    fireEvent.change(screen.getByLabelText(/Visit time/), { target: { value: '14:30' } });
    await userEvent.type(screen.getByLabelText(/What to bring or know/), 'Bring <b>ID</b>');
    await userEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(screen.getByText(/Use plain text only/)).toBeInTheDocument();
    expect(callsTo(fetchMock, '/status', 'PATCH')).toHaveLength(0);
  });

  it('shows a reload prompt on 409 version_conflict and reloads the request', async () => {
    const { world, fetchMock } = stubStaff({ signedIn: true, patch: () => apiErr('version_conflict', 409) });
    open();
    await ready();
    await userEvent.click(screen.getByRole('radio', { name: /Cancel the request/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    const alert = await screen.findByTestId('staff-decide-error');
    expect(alert).toHaveAttribute('data-kind', 'conflict');
    expect(alert).toHaveTextContent('changed by someone else');
    expect(screen.getByRole('button', { name: 'Save decision' })).toBeDisabled();
    // The request moved on: the reload shows the new version.
    world.detail = () => json(detail({ status: 'alternative_offered', version: 3, allowedTransitions: ['confirmed', 'cancelled'] }));
    const before = callsTo(fetchMock, `/booking-requests/${REQ_1}`, 'GET').length;
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(screen.getByTestId('staff-detail-status')).toHaveAttribute('data-status', 'alternative_offered'));
    expect(callsTo(fetchMock, `/booking-requests/${REQ_1}`, 'GET').length).toBe(before + 1);
    expect(screen.queryByTestId('staff-decide-error')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Offer another time/ })).toBeDisabled();
  });

  it('treats 409 illegal_transition the same way (reload prompt)', async () => {
    stubStaff({ signedIn: true, patch: () => apiErr('illegal_transition', 409) });
    open();
    await ready();
    await userEvent.click(screen.getByRole('radio', { name: /Cancel the request/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(await screen.findByTestId('staff-decide-error')).toHaveAttribute('data-kind', 'conflict');
  });

  it('shows the visit-time rule on 400 visit_time_invalid and keeps the form', async () => {
    stubStaff({ signedIn: true, patch: () => apiErr('visit_time_invalid', 400) });
    open();
    await ready();
    await userEvent.click(screen.getByRole('radio', { name: /Confirm the visit/ }));
    fireEvent.change(screen.getByLabelText('Visit date'), { target: { value: '2030-01-15' } });
    fireEvent.change(screen.getByLabelText(/Visit time/), { target: { value: '14:30' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(await screen.findByTestId('staff-decide-error')).toHaveTextContent('within 180 days');
    expect((screen.getByLabelText('Visit date') as HTMLInputElement).value).toBe('2030-01-15');
    expect(screen.getByRole('button', { name: 'Save decision' })).toBeEnabled();
  });

  it('asks to reload the session on 403 csrf_rejected', async () => {
    const { fetchMock } = stubStaff({ signedIn: true, patch: () => apiErr('csrf_rejected', 403) });
    open();
    await ready();
    await userEvent.click(screen.getByRole('radio', { name: /Cancel the request/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    expect(await screen.findByTestId('staff-decide-error')).toHaveAttribute('data-kind', 'csrf');
    const meBefore = callsTo(fetchMock, '/me').length;
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await ready();
    expect(callsTo(fetchMock, '/me').length).toBe(meBefore + 1);
  });

  it('sends the user to login when the session ended during a decision', async () => {
    stubStaff({ signedIn: true, patch: () => apiErr('unauthenticated', 401) });
    open();
    await ready();
    await userEvent.click(screen.getByRole('radio', { name: /Cancel the request/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    await screen.findByRole('heading', { level: 1, name: 'Staff sign-in' });
    expect(screen.getByTestId('staff-login-notice')).toHaveTextContent('Your session ended');
  });

  it('shows not-found for a request outside the clinic and an error with retry otherwise', async () => {
    const { world } = stubStaff({ signedIn: true, detail: () => apiErr('not_found', 404) });
    const { unmount } = open();
    expect(await screen.findByText('This request was not found for the selected clinic.')).toBeInTheDocument();
    unmount();
    world.detail = () => apiErr('internal_error', 500);
    const { container } = open();
    expect(await screen.findByText('We could not load this request. Try again.')).toBeInTheDocument();
    const v = await runAxe(container);
    expect(v, formatViolations(v)).toEqual([]);
    world.detail = () => json(detail());
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await ready();
  });

  it('shows the generated visit-time prefix of the clinic note as-is', async () => {
    stubStaff({
      signedIn: true,
      detail: () =>
        json(detail({ status: 'confirmed', allowedTransitions: [], clinicNote: 'Visit: Mon, 3 Nov 2026, 9:00 AM (Asia/Manila). Please arrive early.', visitStartsAt: '2026-11-03T01:00:00.000Z' })),
    });
    open('fil');
    await screen.findByTestId('staff-detail-clinic-note');
    expect(screen.getByTestId('staff-detail-clinic-note')).toHaveTextContent('Visit: Mon, 3 Nov 2026, 9:00 AM (Asia/Manila). Please arrive early.');
  });
});

describe('menu link, storage and service worker', () => {
  it('links to staff sign-in from the Menu page', async () => {
    stubStaff();
    renderApp('/menu');
    const link = await screen.findByRole('link', { name: 'Staff sign-in' });
    expect(link.getAttribute('href')).toBe('/staff/login');
  });

  it('staff sources never use browser storage, cookies, markup injection or inline styles', () => {
    const dir = import.meta.dirname;
    const files = [...fs.readdirSync(dir).filter((f) => /^Staff.*\.tsx$/.test(f)).map((f) => path.join(dir, f)), path.join(dir, '../api/staff.ts')];
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const f of files) {
      // Comments may legitimately name the APIs that are forbidden; only code is scanned.
      const src = fs
        .readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1');
      expect(src, f).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|dangerouslySetInnerHTML|innerHTML|\bstyle=|\beval\(|new Function|console\./);
    }
  });

  it('the service worker never caches or handles /staff navigations', () => {
    const sandbox: Record<string, unknown> = { URL };
    sandbox.self = sandbox;
    vm.runInNewContext(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/cache-policy.js'), 'utf8'), sandbox);
    const P = sandbox.KalingaCachePolicy as { classifyRequest(r: { method: string; url: string; mode?: string }, o: string): string };
    const origin = 'https://kalinga.test';
    for (const p of ['/staff', '/staff/login', '/staff/requests', `/staff/requests/${REQ_1}?clinic=${CLINIC_A}`]) {
      expect(P.classifyRequest({ method: 'GET', url: origin + p, mode: 'navigate' }, origin), p).toBe('bypass');
      expect(P.classifyRequest({ method: 'GET', url: origin + p, mode: 'cors' }, origin), p).toBe('bypass');
    }
    expect(P.classifyRequest({ method: 'GET', url: `${origin}/api/v1/staff/me`, mode: 'cors' }, origin)).toBe('bypass');
  });
});
