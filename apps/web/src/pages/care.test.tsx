import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Locale } from '@kalinga/shared';
import { AppRoutes } from '../App';
import { I18nProvider } from '../i18n/I18nProvider';
import { CATALOGS, fil as filCatalog } from '../i18n/catalog';
import { careEn, careFil } from '../i18n/care-messages';
import { queryClient } from '../api/client';
import { formatViolations, runAxe } from '../a11y/axe';
import { matchIntent } from '../assistant/engine';
import { json, stubApi } from '../test/clinic-fixtures';

const REFERENCE = 'KAL-ABCDEFGHIJ';
const SECRET = 'Zk3-mQ9_secretValueThatIsLongEnoughToLookRealButIsADemo01';

function renderApp(path: string, locale: Locale = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </I18nProvider>,
  );
}

afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});

const TOPICS = [
  ['/care/results', 'Getting your results'],
  ['/care/treatment-and-referral', 'Treatment and referral'],
  ['/care/preparing-for-your-visit', 'Preparing for your visit'],
] as const;

describe('care navigation pages', () => {
  it('the index lists the three topics and carries the DEMO / not clinically reviewed label', () => {
    stubApi(() => json({}, 404));
    renderApp('/care');
    expect(screen.getByRole('heading', { level: 1, name: 'Care navigation' })).toBeInTheDocument();
    expect(screen.getByText(/DEMO – not clinically reviewed/)).toBeInTheDocument();
    for (const [path, title] of TOPICS) {
      expect(screen.getByRole('link', { name: title })).toHaveAttribute('href', path);
    }
  });

  it.each(TOPICS)('%s renders provider-led guidance with a DEMO label and no stored results or invented contacts', (path, title) => {
    stubApi(() => json({}, 404));
    const { container } = renderApp(path);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText(/DEMO – not clinically reviewed/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to care navigation' })).toHaveAttribute('href', '/care');
    expect(screen.getAllByText(/licensed (health )?professional/i).length).toBeGreaterThan(0);
    const text = container.textContent ?? '';
    // No invented phone numbers, e-mail addresses, URLs or hotlines.
    expect(text).not.toMatch(/@|https?:|www\.|\+?\d[\d\s-]{5,}|hotline|call us|dial/i);
    // No diagnosis or treatment instruction.
    expect(text).not.toMatch(/you (have|are infected|are positive|are negative)|\b(take|start) (the |this )?(pep|pill|medicine|medication)|\bdose\b|\d\s?mg\b/i);
    // The results page states plainly that nothing is stored or shown.
    if (path === '/care/results') expect(text).toMatch(/does not receive, store or show lab results/);
  });

  it('is available in Filipino with the unreviewed DEMO label', () => {
    stubApi(() => json({}, 404));
    renderApp('/care/results', 'fil');
    expect(screen.getByRole('heading', { level: 1, name: filCatalog['care.results.title'].text })).toBeInTheDocument();
    expect(screen.getByText(filCatalog['care.demo'].text)).toBeInTheDocument();
  });

  it('has the same care keys in both locales, all flagged unreviewed', () => {
    expect(Object.keys(careFil).sort()).toEqual(Object.keys(careEn).sort());
    for (const catalog of [CATALOGS.en, CATALOGS.fil]) {
      for (const key of Object.keys(careEn)) {
        const entry = (catalog as Record<string, { text: string; review: string }>)[key];
        expect(entry, key).toBeDefined();
        expect(entry?.review, key).toBe('unreviewed');
        expect(entry?.text.length, key).toBeGreaterThan(5);
      }
    }
  });

  it('is linked from Home and Menu', () => {
    stubApi(() => json({}, 404));
    const home = renderApp('/');
    expect(within(document.body).getAllByRole('link', { name: 'Care navigation' }).some((a) => a.getAttribute('href') === '/care')).toBe(true);
    home.unmount();
    renderApp('/menu');
    expect(screen.getAllByRole('link', { name: 'Care navigation' }).some((a) => a.getAttribute('href') === '/care')).toBe(true);
  });

  it('has no axe violations (index and a topic page)', async () => {
    stubApi(() => json({}, 404));
    const a = renderApp('/care');
    expect(formatViolations(await runAxe(a.container))).toBe('');
    a.unmount();
    const b = renderApp('/care/results');
    expect(formatViolations(await runAxe(b.container))).toBe('');
  });
});

describe('assistant intents for care and results', () => {
  it.each([
    ['where can I get my test results', 'results'],
    ['how do I get my results', 'results'],
    ['ano ang resulta ko', 'results'],
    ['what about treatment', 'care'],
    ['how do I prepare for my visit', 'care'],
    ['saan ang referral', 'care'],
  ])('"%s" -> %s', (input, id) => {
    expect(matchIntent(input).id).toBe(id);
  });

  it('urgent wording still wins over care and results', () => {
    expect(matchIntent('i need my results urgent exposure 72 hours').urgent).toBe(true);
  });

  it('links only to existing care routes', () => {
    const links = [...matchIntent('results').links, ...matchIntent('treatment').links].map((l) => l.to);
    for (const l of links) expect(['/care', '/care/results', '/care/treatment-and-referral', '/care/preparing-for-your-visit']).toContain(l);
  });
});

describe('opt-in reminder control on the lookup result', () => {
  const lookupOk = (over: Record<string, unknown> = {}) => ({
    reference: REFERENCE,
    status: 'confirmed',
    requestOnly: true,
    demo: true,
    clinic: { name: 'DEMO Clinic A – Fictitious', slug: 'demo-clinic-a', isDemo: true },
    clinicNote: null,
    visitInstructions: null,
    updatedAt: '2026-10-30T04:00:00.000Z',
    ...over,
  });
  const prefOk = (optedIn: boolean) => ({ optedIn, channel: optedIn ? 'mock_sms' : null, mock: true, demo: true, queued: 0, suppressed: 0 });

  function stub(reminders: () => Response = () => json(prefOk(true)), status = 'confirmed') {
    return stubApi((url) => {
      if (url.pathname.endsWith('/booking-requests/lookup')) return json(lookupOk({ status }));
      if (url.pathname.endsWith('/booking-requests/reminders')) return reminders();
      return json({}, 404);
    });
  }
  const posts = (m: ReturnType<typeof stubApi>) => m.mock.calls.filter((c) => String(c[0]).endsWith('/reminders') && (c[1] as RequestInit | undefined)?.method === 'POST');
  async function lookup() {
    await userEvent.type(screen.getByLabelText('Reference'), REFERENCE);
    await userEvent.type(screen.getByLabelText('Secret'), SECRET);
    await userEvent.click(screen.getByRole('button', { name: 'Check status' }));
    await screen.findByTestId('lookup-result');
  }

  it('is absent before a successful lookup and appears after, nothing preselected and Save disabled, honest about the DEMO mock', async () => {
    stub();
    renderApp('/appointments/lookup');
    expect(screen.queryByTestId('reminder-optin')).not.toBeInTheDocument();
    await lookup();
    const box = await screen.findByTestId('reminder-optin');
    // S9-3: an explicit Yes/No choice with nothing preselected; Save stays disabled until one is chosen.
    expect(within(box).getByRole('radio', { name: 'Yes, remind me' })).not.toBeChecked();
    expect(within(box).getByRole('radio', { name: 'No reminder' })).not.toBeChecked();
    expect(within(box).getByRole('button', { name: 'Save reminder choice' })).toBeDisabled();
    expect(box).toHaveTextContent(/DEMO mock only: no real text message or e-mail is ever sent/);
    expect(box).toHaveTextContent(/does not ask for your phone number or e-mail/);
    // No free-text contact field exists.
    expect(box.querySelector('input[type="tel"], input[type="email"], input[type="text"]')).toBeNull();
  });

  it('is not offered for a cancelled request', async () => {
    stub(() => json(prefOk(false)), 'cancelled');
    renderApp('/appointments/lookup');
    await lookup();
    expect(screen.queryByTestId('reminder-optin')).not.toBeInTheDocument();
  });

  it('opt-in posts reference, secret, channel and locale in the body only', async () => {
    const m = stub();
    renderApp('/appointments/lookup');
    await lookup();
    const box = await screen.findByTestId('reminder-optin');
    await userEvent.click(within(box).getByRole('radio', { name: 'Yes, remind me' }));
    await userEvent.click(within(box).getByRole('radio', { name: 'Mock e-mail' }));
    await userEvent.click(within(box).getByRole('button', { name: 'Save reminder choice' }));
    expect(await within(box).findByText(/Reminders are on \(DEMO mock; nothing is really sent\)/)).toBeInTheDocument();
    const call = posts(m)[0];
    expect(call).toBeDefined();
    expect(String(call?.[0])).not.toContain(REFERENCE);
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({ reference: REFERENCE, secret: SECRET, optIn: true, channel: 'mock_email', locale: 'en' });
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it('opt-out posts optIn false without a channel and confirms honestly', async () => {
    const m = stub(() => json(prefOk(false)));
    renderApp('/appointments/lookup');
    await lookup();
    const box = await screen.findByTestId('reminder-optin');
    await userEvent.click(within(box).getByRole('radio', { name: 'No reminder' }));
    await userEvent.click(within(box).getByRole('button', { name: 'Save reminder choice' }));
    expect(await within(box).findByText('Saved. Reminders are off.')).toBeInTheDocument();
    expect(JSON.parse(String((posts(m)[0]?.[1] as RequestInit).body))).toEqual({ reference: REFERENCE, secret: SECRET, optIn: false, locale: 'en' });
  });

  it('shows a throttled message for 429 and a generic error otherwise', async () => {
    stub(() => new Response(JSON.stringify({ error: { code: 'lookup_throttled', message: 'x', requestId: 'r' } }), { status: 429, headers: { 'retry-after': '60' } }));
    renderApp('/appointments/lookup');
    await lookup();
    const box = await screen.findByTestId('reminder-optin');
    await userEvent.click(within(box).getByRole('radio', { name: 'No reminder' }));
    await userEvent.click(within(box).getByRole('button', { name: 'Save reminder choice' }));
    expect(await within(box).findByRole('alert')).toHaveTextContent('Too many attempts');
  });

  it('is available in Filipino and has no axe violations', async () => {
    stub();
    const { container } = renderApp('/appointments/lookup', 'fil');
    await userEvent.type(screen.getByLabelText(filCatalog['lookup.reference'].text), REFERENCE);
    await userEvent.type(screen.getByLabelText(filCatalog['lookup.secret'].text), SECRET);
    await userEvent.click(screen.getByRole('button', { name: filCatalog['lookup.submit'].text }));
    const box = await screen.findByTestId('reminder-optin');
    expect(within(box).getByRole('heading', { name: filCatalog['reminder.title'].text })).toBeInTheDocument();
    await userEvent.click(within(box).getAllByRole('radio')[0] as HTMLElement);
    expect(formatViolations(await runAxe(container))).toBe('');
  });
});
