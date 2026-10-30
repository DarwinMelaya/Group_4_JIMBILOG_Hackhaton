import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { AdminArticle, AdminClinic, Evidence, InviteSummary, Locale, StaffAdminUser, StaffMe, StaffRole } from '@kalinga/shared';
import { AppRoutes } from '../App';
import { I18nProvider } from '../i18n/I18nProvider';
import { queryClient } from '../api/client';
import { formatViolations, runAxe } from '../a11y/axe';
import { json, stubApi } from '../test/clinic-fixtures';

const CSRF = 'csrf-token-admin-0123456789abcdef0123456789';
const PASSWORD = 'demo-only-password-not-real';
const CLINIC = '11111111-1111-4111-8111-111111111111';
const DEMO_CLINIC = '22222222-2222-4222-8222-222222222222';
const EV_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INVITE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const INVITE_CODE = 'A'.repeat(43);

const me = (role: StaffRole): StaffMe => ({
  user: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', email: 'admin@example.test', displayName: 'DEMO Admin', role, isDemo: true },
  memberships: role === 'clinic_admin' ? [{ clinicId: CLINIC, clinicSlug: 'demo-clinic-z', clinicName: 'DEMO Clinic Z', role: 'clinic_admin' }] : [],
  csrfToken: CSRF,
  sessionExpiresAt: '2099-01-01T00:00:00.000Z',
});

const clinic = (over: Partial<AdminClinic> = {}): AdminClinic => ({
  id: CLINIC,
  slug: 'demo-clinic-z',
  name: 'DEMO Clinic Z',
  isDemo: false, // fixture standing in for a not-yet-published partner clinic; fictitious
  municipality: 'Demo Town',
  status: 'in_review',
  verificationLevel: 'unverified',
  verificationSource: null,
  addressVerification: 'unknown',
  contactVerification: 'unknown',
  lastVerifiedAt: null,
  version: 3,
  validEvidenceCount: 0,
  hasPublishEvidence: false,
  ...over,
});
const demoClinic = clinic({ id: DEMO_CLINIC, slug: 'demo-clinic-d', name: 'DEMO Clinic D', isDemo: true, verificationLevel: 'demo_fictitious' });

const evidence = (over: Partial<Evidence> = {}): Evidence => ({
  id: EV_1,
  clinicId: CLINIC,
  evidenceType: 'partnership_agreement',
  evidenceReference: 'DOC-0001',
  status: 'pending',
  verifiedBy: null,
  verifiedAt: null,
  expiresAt: '2027-10-30T00:00:00.000Z',
  createdAt: '2026-10-30T00:00:00.000Z',
  ...over,
});

const article = (over: Partial<AdminArticle> = {}): AdminArticle => ({
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  slug: 'prep-basics',
  topic: 'prevention',
  contentOrigin: 'editorial',
  isUrgent: false,
  localizations: [
    { locale: 'en', title: 'Basics (EN)', reviewState: 'in_review', reviewerName: null, medicallyReviewedAt: null, version: 4, allowedTransitions: ['draft', 'medically_reviewed'] },
    { locale: 'fil', title: 'Batayan (FIL)', reviewState: 'draft', reviewerName: null, medicallyReviewedAt: null, version: 2, allowedTransitions: ['in_review'] },
  ],
  ...over,
});

const staffUser = (over: Partial<StaffAdminUser> = {}): StaffAdminUser => ({
  id: USER_B,
  email: 'staff.b@example.test',
  displayName: 'DEMO Staff B',
  role: 'clinic_staff',
  active: true,
  isDemo: true,
  memberships: [{ clinicId: CLINIC, clinicSlug: 'demo-clinic-z', role: 'clinic_staff', active: true }],
  ...over,
});

const apiErr = (code: string, status: number) => new Response(JSON.stringify({ error: { code, message: 'x', requestId: 'r' } }), { status });

interface World {
  signedIn: boolean;
  me: StaffMe;
  clinics: AdminClinic[];
  evidence: Evidence[];
  articles: AdminArticle[];
  staff: StaffAdminUser[];
  invites: InviteSummary[];
  mappings: unknown[];
  status?: () => Response;
  readiness: { mappingPresent: boolean; mappingCount: number };
}

function stubAdmin(role: StaffRole = 'provincial_admin', init: Partial<World> = {}) {
  const world: World = {
    signedIn: false,
    me: me(role),
    clinics: [clinic(), demoClinic],
    evidence: [evidence()],
    articles: [article()],
    staff: [staffUser()],
    invites: [],
    mappings: [],
    readiness: { mappingPresent: false, mappingCount: 0 },
    ...init,
  };
  const fetchMock = stubApi((url, req) => {
    const p = url.pathname;
    const method = req?.method ?? 'GET';
    if (p === '/api/v1/staff/login') {
      world.signedIn = true;
      return json(world.me);
    }
    if (p === '/api/v1/staff/logout') {
      world.signedIn = false;
      return new Response(null, { status: 204 });
    }
    if (!world.signedIn) return apiErr('unauthenticated', 401);
    if (p === '/api/v1/staff/me') return json(world.me);
    const r = world.me.user.role;
    if (p === '/api/v1/admin/config') {
      if (r !== 'technical_admin') return apiErr('forbidden', 403);
      return json({ apiVersion: 'v1', nodeEnv: 'development', demoMode: true, notificationTransport: 'mock', realNotificationsEnabled: false, realBookingRequestsEnabled: false, realMinorBookingEnabled: false, clinicalContentApproved: false, bookingKeyConfigured: true, persistentStorage: false });
    }
    if (p === '/api/v1/admin/clinics') return r === 'clinic_admin' ? apiErr('forbidden', 403) : json({ items: world.clinics });
    if (/\/clinics\/[^/]+\/evidence$/.test(p)) {
      if (method === 'POST') {
        const created = evidence({ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', evidenceReference: String(JSON.parse(String(req?.body)).evidenceReference) });
        world.evidence = [created, ...world.evidence];
        return json(created, 201);
      }
      return json({ items: world.evidence });
    }
    if (/\/clinics\/[^/]+\/status$/.test(p)) return world.status ? world.status() : json(clinic());
    if (/\/clinics\/[^/]+\/verification$/.test(p)) return json(clinic({ addressVerification: 'verified', version: 4 }));
    if (p === '/api/v1/admin/articles') return r === 'provincial_admin' ? json({ items: world.articles }) : apiErr('forbidden', 403);
    if (/\/articles\/[^/]+\/localizations\/[^/]+\/transition$/.test(p)) {
      const b = JSON.parse(String(req?.body)) as { to: AdminArticle['localizations'][number]['reviewState']; reviewerName?: string; reviewedOn?: string };
      const locale = p.split('/').at(-2) as Locale;
      world.articles = world.articles.map((a) => ({
        ...a,
        localizations: a.localizations.map((l) =>
          l.locale === locale ? { ...l, reviewState: b.to, reviewerName: b.reviewerName ?? null, medicallyReviewedAt: b.reviewedOn ?? null, version: l.version + 1, allowedTransitions: ['in_review', 'published'] } : l,
        ),
      }));
      return json({ slug: 'prep-basics', locale, reviewState: b.to, reviewerName: b.reviewerName ?? null, medicallyReviewedAt: b.reviewedOn ?? null, version: 5 });
    }
    if (p === '/api/v1/admin/staff') return json({ items: world.staff });
    if (p === '/api/v1/admin/staff/invites') {
      if (method === 'POST') {
        const b = JSON.parse(String(req?.body)) as { email: string; role: StaffRole; clinicId?: string };
        world.invites = [{ id: INVITE_ID, email: b.email, role: b.role, clinicId: b.clinicId ?? null, expiresAt: '2026-11-02T00:00:00.000Z', state: 'pending' }];
        return json({ id: INVITE_ID, email: b.email, role: b.role, clinicId: b.clinicId ?? null, expiresAt: '2026-11-02T00:00:00.000Z', inviteCode: INVITE_CODE }, 201);
      }
      return json({ items: world.invites });
    }
    if (p === '/api/v1/admin/minor-booking-readiness') {
      return json({ ...world.readiness, envEnabled: false, realMinorBookingActive: false, blockedBy: ['env_flag_off', 'human_signoff_missing'] });
    }
    if (/\/minor-sop-mappings$/.test(p)) {
      if (method === 'POST') {
        world.readiness = { mappingPresent: true, mappingCount: 1 };
        const m = { id: INVITE_ID, clinicId: CLINIC, ...JSON.parse(String(req?.body)), status: 'recorded', createdAt: '2026-10-30T00:00:00.000Z' };
        world.mappings = [m];
        return json(m, 201);
      }
      return json({ items: world.mappings });
    }
    return json({}, 404);
  });
  return { fetchMock, world };
}

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc" data-path={loc.pathname} />;
}
function renderApp(route: string, locale: Locale = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
        <Probe />
      </MemoryRouter>
    </I18nProvider>,
  );
}
const here = () => screen.getByTestId('loc').getAttribute('data-path');
const adminCalls = (f: ReturnType<typeof stubApi>) => f.mock.calls.filter((c) => String(c[0]).startsWith('/api/v1/admin'));
const writes = (f: ReturnType<typeof stubApi>, suffix: RegExp) =>
  adminCalls(f).filter((c) => suffix.test(String(c[0])) && ['POST', 'PATCH', 'DELETE'].includes(String((c[1] as RequestInit | undefined)?.method)));
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
const headersOf = (call: unknown[]) => (call[1] as RequestInit).headers as Record<string, string>;

async function signInViaLogin() {
  await userEvent.type(screen.getByLabelText('Email'), 'admin@example.test');
  await userEvent.type(screen.getByLabelText('Password'), PASSWORD);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}
async function axeClean(container: Element) {
  const v = await runAxe(container);
  expect(v, formatViolations(v)).toEqual([]);
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

describe('admin sign-in and session guard', () => {
  it('renders an accessible DEMO sign-in form (en and fil)', async () => {
    stubAdmin();
    for (const locale of ['en', 'fil'] as const) {
      const { container, unmount } = renderApp('/admin/login', locale);
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.getByRole('note')).toHaveTextContent(/DEMO/);
      expect((container.querySelector('#admin-password') as HTMLInputElement).type).toBe('password');
      await axeClean(container);
      unmount();
    }
  });

  it('signs in, lands on the dashboard with the DEMO banner and keeps the CSRF token out of every storage', async () => {
    const { fetchMock } = stubAdmin('provincial_admin');
    const { container } = renderApp('/admin/login');
    await signInViaLogin();
    await waitFor(() => expect(here()).toBe('/admin'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Admin dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/DEMO/);
    expect(screen.getByTestId('admin-demo-note')).toBeInTheDocument();
    expect(screen.getByText(/Provincial administrator/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Clinics on record: 2/)).toBeInTheDocument());
    // provincial_admin must not call the technical-only config route
    expect(adminCalls(fetchMock).some((c) => String(c[0]).endsWith('/admin/config'))).toBe(false);
    for (const call of setItem.mock.calls) expect(String(call[0]) + String(call[1])).not.toMatch(/csrf|admin|session|token|password/i);
    expect(JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage)) + document.cookie).not.toContain(CSRF);
    await axeClean(container);
  });

  it('redirects an anonymous visitor (401) to the admin sign-in from every admin route', async () => {
    stubAdmin();
    for (const route of ['/admin', '/admin/clinics', '/admin/content', '/admin/staff', '/admin/minor-sop']) {
      const { unmount } = renderApp(route);
      await waitFor(() => expect(here()).toBe('/admin/login'));
      unmount();
    }
  });

  it('sends the user back to sign-in when the session ends mid-use (401 on a data call)', async () => {
    const { world } = stubAdmin('provincial_admin', { signedIn: true });
    renderApp('/admin/clinics');
    await screen.findByText('DEMO Clinic Z (in review, unverified)');
    world.signedIn = false;
    await userEvent.click(screen.getByRole('button', { name: /DEMO Clinic Z/ }));
    await waitFor(() => expect(here()).toBe('/admin/login'));
    expect(await screen.findByTestId('admin-login-notice')).toHaveTextContent(/session ended/i);
  });
});

describe('admin role guards', () => {
  it('refuses clinic_staff accounts the whole admin area', async () => {
    const { fetchMock } = stubAdmin('clinic_staff', { signedIn: true });
    renderApp('/admin');
    expect(await screen.findByText(/cannot use this admin page/i)).toBeInTheDocument();
    expect(adminCalls(fetchMock)).toHaveLength(0);
  });

  it('shows only the pages a role may use and never calls routes the API forbids', async () => {
    const tech = stubAdmin('technical_admin', { signedIn: true });
    const { unmount } = renderApp('/admin');
    await screen.findByText(/Notification transport: mock/);
    expect(screen.getByText(/Real minor booking: Off/)).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Admin navigation' });
    expect(within(nav).queryByRole('link', { name: 'Content' })).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Clinics' })).toBeInTheDocument();
    unmount();
    // technical_admin deep-links to content review: blocked in the UI, no API call made
    tech.fetchMock.mockClear();
    renderApp('/admin/content');
    expect(await screen.findByTestId('admin-forbidden')).toBeInTheDocument();
    expect(adminCalls(tech.fetchMock).some((c) => String(c[0]).includes('/articles'))).toBe(false);
  });

  it('gives clinic_admin only the staff page, scoped to its own clinic', async () => {
    const { fetchMock } = stubAdmin('clinic_admin', { signedIn: true });
    const { unmount } = renderApp('/admin/staff');
    await screen.findByRole('heading', { level: 2, name: 'Invite staff' });
    const nav = screen.getByRole('navigation', { name: 'Admin navigation' });
    expect(within(nav).queryByRole('link', { name: 'Clinics' })).toBeNull();
    const roleSel = screen.getByLabelText('Role', { selector: '#invite-role' }) as HTMLSelectElement;
    expect([...roleSel.options].map((o) => o.value)).toEqual(['clinic_staff']);
    expect(adminCalls(fetchMock).some((c) => String(c[0]).endsWith('/admin/clinics'))).toBe(false);
    unmount();
    renderApp('/admin/clinics');
    expect(await screen.findByTestId('admin-forbidden')).toBeInTheDocument();
  });
});

describe('clinic verification', () => {
  it('adds partnership evidence with the CSRF header and a body the API accepts, then lists it', async () => {
    const { fetchMock } = stubAdmin('provincial_admin', { signedIn: true });
    const { container } = renderApp('/admin/clinics');
    await userEvent.click(await screen.findByRole('button', { name: /DEMO Clinic Z/ }));
    expect(await screen.findByTestId('clinic-publish-blocked')).toHaveTextContent(/publishing a real clinic is blocked/i);
    await screen.findByText(/DOC-0001/);
    await axeClean(container);
    await userEvent.type(screen.getByLabelText('Document reference'), 'AGR-2026-0042');
    fireEvent.change(screen.getByLabelText('Expires on'), { target: { value: '2027-03-01' } });
    await userEvent.click(screen.getAllByRole('button', { name: 'Add evidence' })[0]!);
    await waitFor(() => expect(writes(fetchMock, /\/evidence$/)).toHaveLength(1));
    const call = writes(fetchMock, /\/evidence$/)[0]!;
    expect(headersOf(call)['X-CSRF-Token']).toBe(CSRF);
    expect(bodyOf(call)).toEqual({ evidenceType: 'partnership_agreement', evidenceReference: 'AGR-2026-0042', expiresAt: '2027-03-01T15:59:59.000Z' });
    expect(await screen.findByText(/AGR-2026-0042/)).toBeInTheDocument();
  });

  it('shows the API publish-blocked reason and never claims the clinic was published', async () => {
    const { fetchMock } = stubAdmin('provincial_admin', { signedIn: true, status: () => apiErr('evidence_required', 422) });
    renderApp('/admin/clinics');
    await userEvent.click(await screen.findByRole('button', { name: /DEMO Clinic Z/ }));
    await userEvent.selectOptions(await screen.findByLabelText('Publish status', { selector: 'select' }), 'published');
    await userEvent.click(screen.getByRole('button', { name: 'Set publish status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Accepted, unexpired evidence is required first/);
    const call = writes(fetchMock, /\/status$/)[0]!;
    expect(bodyOf(call)).toEqual({ expectedVersion: 3, status: 'published' });
    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('sends expectedVersion with verification and requires a source client-side only as the API does', async () => {
    const { fetchMock } = stubAdmin('provincial_admin', { signedIn: true });
    renderApp('/admin/clinics');
    await userEvent.click(await screen.findByRole('button', { name: /DEMO Clinic Z/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save verification' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one verification change/i);
    expect(writes(fetchMock, /\/verification$/)).toHaveLength(0);
    await userEvent.selectOptions(screen.getByLabelText('Address'), 'verified');
    await userEvent.type(screen.getByLabelText('Verification source'), 'Signed agreement DOC-0001');
    await userEvent.click(screen.getByRole('button', { name: 'Save verification' }));
    await waitFor(() => expect(writes(fetchMock, /\/verification$/)).toHaveLength(1));
    expect(bodyOf(writes(fetchMock, /\/verification$/)[0]!)).toEqual({ expectedVersion: 3, addressVerification: 'verified', verificationSource: 'Signed agreement DOC-0001' });
  });

  it('locks DEMO clinics and is read-only for technical_admin', async () => {
    stubAdmin('provincial_admin', { signedIn: true });
    const prov = renderApp('/admin/clinics');
    await userEvent.click(await screen.findByRole('button', { name: /DEMO Clinic D/ }));
    expect(await screen.findByTestId('clinic-demo-locked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save verification' })).toBeNull();
    prov.unmount();
    vi.unstubAllGlobals();
    stubAdmin('technical_admin', { signedIn: true });
    renderApp('/admin/clinics');
    await userEvent.click(await screen.findByRole('button', { name: /DEMO Clinic Z/ }));
    await screen.findByText(/DOC-0001/);
    expect(screen.getByText('Read-only for your role.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save verification' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });
});

describe('content review', () => {
  it('moves one locale through review without touching the other, recording reviewer and date', async () => {
    const { fetchMock } = stubAdmin('provincial_admin', { signedIn: true });
    const { container } = renderApp('/admin/content');
    const en = await screen.findByTestId('loc-prep-basics-en');
    const fil = screen.getByTestId('loc-prep-basics-fil');
    expect(within(en).getByText('in review')).toBeInTheDocument();
    expect(within(fil).getByText('draft')).toBeInTheDocument();
    await axeClean(container);
    await userEvent.selectOptions(within(en).getByLabelText('Move to'), 'medically_reviewed');
    await userEvent.type(within(en).getByLabelText('Reviewer name'), 'Dr. Maria Santos');
    fireEvent.change(within(en).getByLabelText('Reviewed on'), { target: { value: '2026-10-29' } });
    await userEvent.click(within(en).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(writes(fetchMock, /\/transition$/)).toHaveLength(1));
    const call = writes(fetchMock, /\/transition$/)[0]!;
    expect(String(call[0])).toBe('/api/v1/admin/articles/prep-basics/localizations/en/transition');
    expect(headersOf(call)['X-CSRF-Token']).toBe(CSRF);
    expect(bodyOf(call)).toEqual({ to: 'medically_reviewed', expectedVersion: 4, reviewerName: 'Dr. Maria Santos', reviewedOn: '2026-10-29' });
    await waitFor(() => expect(within(screen.getByTestId('loc-prep-basics-en')).getByText('medically reviewed')).toBeInTheDocument());
    expect(within(screen.getByTestId('loc-prep-basics-fil')).getByText('draft')).toBeInTheDocument();
    expect(screen.getByTestId('loc-prep-basics-en')).toHaveTextContent('reviewed by Dr. Maria Santos');
  });

  it('never offers medical review or publish for DEMO content', async () => {
    stubAdmin('provincial_admin', {
      signedIn: true,
      articles: [article({ contentOrigin: 'demo', localizations: [{ locale: 'en', title: 'T', reviewState: 'in_review', reviewerName: null, medicallyReviewedAt: null, version: 1, allowedTransitions: ['draft', 'medically_reviewed'] }] })],
    });
    renderApp('/admin/content');
    const en = await screen.findByTestId('loc-prep-basics-en');
    const sel = within(en).getByLabelText('Move to') as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).toEqual(['draft']);
  });

  it('renders titles as plain text (no markup injection)', async () => {
    stubAdmin('provincial_admin', {
      signedIn: true,
      articles: [article({ localizations: [{ locale: 'en', title: '<img src=x onerror=alert(1)>', reviewState: 'draft', reviewerName: null, medicallyReviewedAt: null, version: 1, allowedTransitions: ['in_review'] }] })],
    });
    const { container } = renderApp('/admin/content');
    await screen.findByText(/<img src=x onerror=alert\(1\)>/);
    expect(container.querySelector('img:not(.logo__mark)')).toBeNull();
  });
});

describe('staff invites', () => {
  it('shows the invite code exactly once and never stores it', async () => {
    const { fetchMock } = stubAdmin('provincial_admin', { signedIn: true });
    const { container } = renderApp('/admin/staff');
    await screen.findByText(/DEMO Staff B/);
    await axeClean(container);
    await userEvent.type(screen.getByLabelText('Email', { selector: '#invite-email' }), 'new.person@example.test');
    await userEvent.selectOptions(screen.getByLabelText('Role', { selector: '#invite-role' }), 'provincial_admin');
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    const code = await screen.findByTestId('invite-code');
    expect(code).toHaveTextContent(INVITE_CODE);
    expect(bodyOf(writes(fetchMock, /\/staff\/invites$/)[0]!)).toEqual({ email: 'new.person@example.test', role: 'provincial_admin' });
    // the list shows the invite but never the code
    expect(await screen.findByText(/new.person@example.test \(Provincial administrator\) - pending/)).toBeInTheDocument();
    expect(container.textContent?.split(INVITE_CODE).length).toBe(2);
    await axeClean(container);
    await userEvent.click(screen.getByRole('button', { name: /hide the code/i }));
    expect(screen.queryByTestId('invite-code')).toBeNull();
    expect(container.textContent).not.toContain(INVITE_CODE);
    for (const call of setItem.mock.calls) expect(String(call[0]) + String(call[1])).not.toContain(INVITE_CODE);
    expect(JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage)) + document.cookie).not.toContain(INVITE_CODE);
  });

  it('requires a clinic for clinic roles and sends it', async () => {
    const { fetchMock } = stubAdmin('provincial_admin', { signedIn: true });
    renderApp('/admin/staff');
    await screen.findByText(/DEMO Staff B/);
    await userEvent.type(screen.getByLabelText('Email', { selector: '#invite-email' }), 'clinic.person@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Some details were not accepted/);
    expect(writes(fetchMock, /\/staff\/invites$/)).toHaveLength(0);
    await userEvent.selectOptions(screen.getByLabelText('Clinic', { selector: '#invite-clinic' }), CLINIC);
    await userEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    await waitFor(() => expect(writes(fetchMock, /\/staff\/invites$/)).toHaveLength(1));
    expect(bodyOf(writes(fetchMock, /\/staff\/invites$/)[0]!)).toEqual({ email: 'clinic.person@example.test', role: 'clinic_staff', clinicId: CLINIC });
  });
});

describe('minor SOP mapping', () => {
  it('states that real minor booking is not active, and that a recorded mapping alone does not enable it', async () => {
    const { fetchMock } = stubAdmin('provincial_admin', { signedIn: true });
    const { container } = renderApp('/admin/minor-sop');
    expect(await screen.findByTestId('minor-not-active')).toHaveTextContent(/not active/i);
    expect(screen.getByTestId('minor-mapping-only')).toHaveTextContent(/mapping alone does not enable real minor booking/i);
    await axeClean(container);
    await screen.findByRole('option', { name: 'DEMO Clinic Z' });
    await userEvent.selectOptions(screen.getByLabelText('Clinic'), CLINIC);
    await userEvent.type(await screen.findByLabelText('SOP reference'), 'SOP-FIXTURE-1');
    await userEvent.type(screen.getByLabelText('SOP version'), 'v1.0');
    await userEvent.type(screen.getByLabelText('Approved by'), 'Dr. Ana Reyes');
    fireEvent.change(screen.getByLabelText('Approved on'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Effective from'), { target: { value: '2026-10-15' } });
    await userEvent.click(screen.getByRole('button', { name: 'Record mapping' }));
    await waitFor(() => expect(writes(fetchMock, /\/minor-sop-mappings$/)).toHaveLength(1));
    expect(bodyOf(writes(fetchMock, /\/minor-sop-mappings$/)[0]!)).toEqual({
      sopArtifactReference: 'SOP-FIXTURE-1',
      sopVersion: 'v1.0',
      approvedBy: 'Dr. Ana Reyes',
      approvedAt: '2026-10-01',
      effectiveFrom: '2026-10-15',
    });
    // mapping is now present, yet the page still says real minor booking is not active
    await waitFor(() => expect(screen.getByText(/Clinic mapping recorded: Yes \(1\)/)).toBeInTheDocument());
    expect(screen.getByTestId('minor-not-active')).toHaveTextContent(/not active/i);
    expect(screen.getByText('Real minor booking: Off')).toBeInTheDocument();
    expect(screen.getByText(/Blocked by: env_flag_off, human_signoff_missing/)).toBeInTheDocument();
  });

  it('does not offer the mapping form for DEMO clinics and is read-only for technical_admin', async () => {
    stubAdmin('provincial_admin', { signedIn: true });
    const prov = renderApp('/admin/minor-sop');
    await screen.findByTestId('minor-not-active');
    await screen.findByRole('option', { name: 'DEMO Clinic D' });
    await userEvent.selectOptions(screen.getByLabelText('Clinic'), DEMO_CLINIC);
    expect(await screen.findByText(/DEMO clinics cannot be mapped/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record mapping' })).toBeNull();
    prov.unmount();
    vi.unstubAllGlobals();
    stubAdmin('technical_admin', { signedIn: true });
    renderApp('/admin/minor-sop');
    await screen.findByTestId('minor-not-active');
    await screen.findByRole('option', { name: 'DEMO Clinic Z' });
    await userEvent.selectOptions(screen.getByLabelText('Clinic'), CLINIC);
    expect(screen.getByText('Read-only for your role.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record mapping' })).toBeNull();
  });
});

describe('menu and Filipino drafts', () => {
  it('links to the admin sign-in from the menu', async () => {
    stubAdmin();
    renderApp('/menu');
    expect(await screen.findByRole('link', { name: 'Admin sign-in' })).toHaveAttribute('href', '/admin/login');
  });

  it('renders the admin pages in Filipino (unreviewed draft) without axe violations', async () => {
    stubAdmin('provincial_admin', { signedIn: true });
    for (const route of ['/admin', '/admin/clinics', '/admin/content', '/admin/staff', '/admin/minor-sop']) {
      const { container, unmount } = renderApp(route, 'fil');
      await waitFor(() => expect(screen.queryByText('Sinusuri ang access...')).toBeNull());
      await screen.findByTestId('admin-demo-note');
      expect(screen.getByTestId('admin-demo-note')).toHaveTextContent(/DEMO/);
      await axeClean(container);
      unmount();
    }
  });
});

describe('source scan', () => {
  it('uses no browser storage, cookies or raw HTML injection in the admin area', () => {
    const root = path.resolve(__dirname, '..');
    const files = [
      'api/admin.ts',
      ...fs.readdirSync(path.join(root, 'admin')).filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx')).map((f) => `admin/${f}`),
      ...fs.readdirSync(path.join(root, 'pages/admin')).map((f) => `pages/admin/${f}`),
    ];
    expect(files.length).toBeGreaterThanOrEqual(9);
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      expect(src, f).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|dangerouslySetInnerHTML|innerHTML|eval\(|new Function|console\./);
    }
  });
});
