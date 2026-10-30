import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { URGENT_ARTICLE_SLUG, type Locale } from '@kalinga/shared';
import { AppRoutes } from '../App';
import { I18nProvider } from '../i18n/I18nProvider';
import { fil } from '../i18n/catalog';
import { queryClient } from '../api/client';
import { formatViolations, runAxe } from '../a11y/axe';
import { matchIntent } from '../assistant/engine';
import { URGENT, json, matched, ranked, stubApi } from '../test/clinic-fixtures';

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc" data-path={loc.pathname + loc.search + loc.hash} />;
}

function renderApp(path = '/pathway', locale: Locale = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <Probe />
      </MemoryRouter>
    </I18nProvider>,
  );
}

const matchCalls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter((c) => String(c[0]).includes('/public/pathway/match'));
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));
const click = (name: string | RegExp) => userEvent.click(screen.getByRole('button', { name }));

beforeEach(() => queryClient.clear());
afterEach(() => vi.unstubAllGlobals());

describe('entry points', () => {
  it('Home hero "Explore Testing Options" opens the pathway', () => {
    stubApi(() => json({}));
    renderApp('/');
    expect(screen.getByRole('link', { name: 'Explore Testing Options' })).toHaveAttribute('href', '/pathway');
  });
});

describe('Pathway: questions', () => {
  it('starts on step 1 with an optional, empty live region and no role=status', () => {
    stubApi(() => json({}));
    renderApp();
    expect(screen.getByRole('heading', { level: 1, name: 'Explore testing options' })).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'What matters most to you?' })).toBeInTheDocument();
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(screen.getByTestId('pathway-live')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByTestId('pathway-live')).toBeEmptyDOMElement();
    // Back only appears after step 1; the urgent control is always available.
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Possible exposure in the last 72 hours' })).toBeInTheDocument();
  });

  it('walks concerns -> municipality -> review with Back, Skip, edit and Reset, announcing politely', async () => {
    stubApi(() => json(ranked([matched()])));
    renderApp();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Cost of testing' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Privacy and confidentiality' }));
    // Priority order follows the order chosen.
    const order = document.querySelector('.order-list') as HTMLElement;
    expect(within(order).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Cost of testing', 'Privacy and confidentiality']);

    await click('Next');
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.getByTestId('pathway-live')).toHaveTextContent('Step 2 of 3: Which municipality is easiest for you to reach?');
    expect(screen.getByRole('heading', { level: 2, name: 'Which municipality is easiest for you to reach?' })).toHaveFocus();
    await userEvent.click(screen.getByRole('radio', { name: 'Boac' }));

    await click('Back');
    expect(screen.getByRole('checkbox', { name: 'Cost of testing' })).toBeChecked();
    await click('Next');
    await click('Next');
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
    expect(screen.getByText('Boac')).toBeInTheDocument();

    // Edit jumps back to a step without losing answers.
    await click('Edit municipality');
    expect(screen.getByRole('radio', { name: 'Boac' })).toBeChecked();

    await click('Skip this question');
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
    expect(screen.getByText('None selected (skipped)')).toBeInTheDocument();

    await click('Start over');
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByTestId('pathway-live')).toHaveTextContent('Your answers were cleared');
    expect(screen.getByRole('checkbox', { name: 'Cost of testing' })).not.toBeChecked();
  });

  it('sends only the chosen concerns/municipality in a POST body: nothing in the URL, storage or history', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const fetchMock = stubApi(() => json(ranked([matched()])));
    renderApp();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Cost of testing' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Privacy and confidentiality' }));
    await click('Next');
    await userEvent.click(screen.getByRole('radio', { name: 'Boac' }));
    await click('Next');
    await click('Show sample matches');
    await screen.findByRole('link', { name: 'DEMO Clinic A – Fictitious' });

    const calls = matchCalls(fetchMock);
    expect(calls).toHaveLength(1);
    expect(String(calls[0]![0])).toBe('/api/v1/public/pathway/match');
    const init = calls[0]![1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(bodyOf(calls[0]!)).toEqual({ concerns: ['cost', 'privacy'], municipality: 'Boac' });
    expect(screen.getByTestId('loc').getAttribute('data-path')).toBe('/pathway');
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('every question can be skipped: an empty body is sent', async () => {
    const fetchMock = stubApi(() => json(ranked([matched()])));
    renderApp();
    await click('Skip this question');
    await click('Skip this question');
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
    await click('Show sample matches');
    await screen.findByRole('link', { name: 'DEMO Clinic A – Fictitious' });
    expect(bodyOf(matchCalls(fetchMock)[0]!)).toEqual({});
  });
});

describe('Pathway: urgent bypass', () => {
  it('shows the API urgent guidance immediately, bypassing the steps, with no contacts or advice', async () => {
    const fetchMock = stubApi(() => json(URGENT));
    renderApp();
    await click('Possible exposure in the last 72 hours');
    expect(await screen.findByText(URGENT.guidance.message.en)).toBeInTheDocument();
    const region = screen.getByTestId('pathway-urgent');
    expect(within(region).getByRole('heading', { level: 2, name: 'Please get a professional assessment urgently' })).toHaveFocus();
    // Steps are gone; no ranking request was made; only the urgent flag was sent.
    expect(screen.queryByText(/Step \d of 3/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(bodyOf(matchCalls(fetchMock)[0]!)).toEqual({ urgentExposureWithin72h: true });
    expect(matchCalls(fetchMock)).toHaveLength(1);
    expect(within(region).getByRole('link', { name: 'Read the urgent article' })).toHaveAttribute('href', `/learn/${URGENT_ARTICLE_SLUG}`);
    expect(region).toHaveTextContent('No contact details are shown');
    expect(region).toHaveTextContent('not clinically reviewed');
    // No contacts, no treatment/diagnosis wording.
    expect(region.querySelector('a[href^="tel:"], a[href^="mailto:"]')).toBeNull();
    expect(region.textContent).not.toMatch(/\b\d{3}[- ]?\d{3,}/);
    expect(region.textContent).not.toMatch(/you have hiv|you are (infected|positive)|take (pep|medication)/i);
    expect(screen.getByTestId('pathway-live')).toHaveTextContent('Urgent guidance is shown below');
  });

  it('uses the Filipino API message in fil', async () => {
    stubApi(() => json(URGENT));
    renderApp('/pathway', 'fil');
    await click(fil['pathway.urgent.button'].text);
    expect(await screen.findByText(URGENT.guidance.message.fil)).toBeInTheDocument();
  });

  it('still shows safe static guidance and the article link when the API is unreachable', async () => {
    stubApi(() => json({}, 500));
    renderApp();
    await click('Possible exposure in the last 72 hours');
    const region = screen.getByTestId('pathway-urgent');
    expect(region).toHaveTextContent('please get an assessment from a qualified health professional or hospital');
    await waitFor(() => expect(screen.getByTestId('pathway-live')).toBeEmptyDOMElement());
    expect(within(region).getByRole('link', { name: 'Read the urgent article' })).toHaveAttribute('href', `/learn/${URGENT_ARTICLE_SLUG}`);
  });

  it('Back to the questions returns to step 1', async () => {
    stubApi(() => json(URGENT));
    renderApp();
    await click('Possible exposure in the last 72 hours');
    await screen.findByText(URGENT.guidance.message.en);
    await click('Back to the questions');
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
  });
});

describe('Pathway: results', () => {
  async function toResults() {
    await click('Skip this question');
    await click('Skip this question');
    await click('Show sample matches');
  }

  it('shows whyMayFit / remainsUnknown / notMet with verified and unknown flags and profile links', async () => {
    stubApi(() => json(ranked([matched()], ['distance'])));
    renderApp();
    await toResults();
    const link = await screen.findByRole('link', { name: 'DEMO Clinic A – Fictitious' });
    expect(link).toHaveAttribute('href', '/clinics/demo-clinic-a');
    const card = link.closest('li') as HTMLElement;
    expect(within(card).getByText('DEMO – fictitious listing, not a real clinic')).toBeInTheDocument();
    expect(within(card).getByText(/Details last checked/)).toBeInTheDocument();

    const fit = within(card).getByRole('region', { name: 'Why this clinic may fit' });
    expect(within(fit).getByText('Privacy and confidentiality')).toBeInTheDocument();
    const confirmedRow = within(fit).getByText(/^Confidentiality explained/).closest('li') as HTMLElement;
    expect(within(confirmedRow).getByText('Verified')).toBeInTheDocument();
    const unconfirmedRow = within(fit).getByText(/^Reduced-disclosure booking/).closest('li') as HTMLElement;
    expect(within(unconfirmedRow).getByText('Not confirmed')).toBeInTheDocument();

    const unknown = within(card).getByRole('region', { name: 'What remains unknown' });
    expect(unknown).toHaveTextContent('We could not verify this detail.');
    expect(within(unknown).getByText('Knowing what the procedure involves')).toBeInTheDocument();
    expect(within(unknown).getByText('Not confirmed')).toBeInTheDocument();

    const notMet = within(card).getByRole('region', { name: 'Documented as not matching' });
    expect(within(notMet).getByText('Fee: HIV testing')).toBeInTheDocument();

    expect(screen.getByTestId('pathway-not-evaluated')).toHaveTextContent('Not compared: Being close to me');
    expect(screen.getByText(/not medical advice, a score, or a guarantee/)).toBeInTheDocument();
    expect(screen.getByTestId('pathway-live')).toHaveTextContent('1 sample clinics found');
  });

  it('shows the browse fallback when nothing matches', async () => {
    stubApi(() => json(ranked([])));
    renderApp();
    await toResults();
    const empty = await screen.findByTestId('pathway-empty');
    expect(within(empty).getByRole('link', { name: 'Browse all clinics' })).toHaveAttribute('href', '/clinics');
  });

  it('shows an error with retry that resends the same choices, and can edit answers', async () => {
    let fail = true;
    const fetchMock = stubApi(() => (fail ? json({}, 500) : json(ranked([matched()]))));
    renderApp();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Cost of testing' }));
    await click('Next');
    await click('Next');
    await click('Show sample matches');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Matches could not be loaded right now');
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await screen.findByRole('link', { name: 'DEMO Clinic A – Fictitious' });
    const calls = matchCalls(fetchMock);
    expect(calls).toHaveLength(2);
    expect(bodyOf(calls[1]!)).toEqual({ concerns: ['cost'] });

    await click('Change my answers');
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
  });

  it('uses the Filipino catalog (all unreviewed) in fil', async () => {
    stubApi(() => json(ranked([matched()])));
    renderApp('/pathway', 'fil');
    expect(screen.getByRole('heading', { level: 1, name: fil['pathway.title'].text })).toBeInTheDocument();
    await click(fil['pathway.btn.skip'].text);
    await click(fil['pathway.btn.skip'].text);
    await click(fil['pathway.btn.show'].text);
    await screen.findByRole('link', { name: 'DEMO Clinic A – Fictitious' });
    expect(screen.getByText(fil['pathway.match.fit'].text)).toBeInTheDocument();
    for (const [id, entry] of Object.entries(fil)) if (id.startsWith('pathway.') || id.startsWith('clinics.')) expect(entry.review).toBe('unreviewed');
  });
});

describe('Pathway: accessibility and sizing', () => {
  it('has no axe violations on each step, urgent and results', async () => {
    stubApi((_url, init) => (init?.method === 'POST' && String(init.body).includes('urgent') ? json(URGENT) : json(ranked([matched()], ['distance']))));
    const { container } = renderApp();
    expect(formatViolations(await runAxe(container))).toBe('');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Cost of testing' }));
    await click('Next');
    expect(formatViolations(await runAxe(container))).toBe('');
    await click('Next');
    expect(formatViolations(await runAxe(container))).toBe('');
    await click('Show sample matches');
    await screen.findByRole('link', { name: 'DEMO Clinic A – Fictitious' });
    expect(formatViolations(await runAxe(container))).toBe('');
    await click('Start over');
    await click('Possible exposure in the last 72 hours');
    await screen.findByText(URGENT.guidance.message.en);
    expect(formatViolations(await runAxe(container))).toBe('');
  });

  it('keeps 44px targets for choices and buttons (CSS source check; jsdom has no layout)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');
    expect(css).toMatch(/\.choice \{[^}]*min-height: var\(--touch-target\)/);
    expect(css).toMatch(/\.btn \{[^}]*min-height: var\(--touch-target\)/);
    expect(css).toMatch(/\.input \{[^}]*min-height: var\(--touch-target\)/);
  });
});

describe('assistant intents', () => {
  it.each([
    ['help me narrow down my testing options', 'pathway'],
    ['which clinic is best for me', 'pathway'],
    ['aling klinika ang bagay sa akin', 'pathway'],
    ['find a clinic please', 'clinic'],
    ['possible exposure in the last 72 hours', 'urgent'],
  ])('%s -> %s', (text, expected) => {
    expect(matchIntent(text).id).toBe(expected);
  });
});
