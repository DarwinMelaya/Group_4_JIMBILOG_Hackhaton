import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locale } from '@kalinga/shared';
import { AppRoutes } from '../App';
import { I18nProvider } from '../i18n/I18nProvider';
import { queryClient } from '../api/client';
import { formatViolations, runAxe } from '../a11y/axe';

const appCss = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');

const CONFIG = {
  apiVersion: 'v1',
  demoMode: true,
  locales: ['en', 'fil'],
  defaultLocale: 'en',
  timezone: 'Asia/Manila',
  notificationTransport: 'mock',
  realBookingEnabled: false,
  clinicalContentApproved: false,
};

let fetchMock: ReturnType<typeof vi.fn>;

function renderApp(path: string, locale: Locale = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  queryClient.clear();
  fetchMock = vi.fn(async () => new Response(JSON.stringify(CONFIG), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const settle = (d: HTMLElement) => waitFor(() => expect(d.querySelector('.assistant__typing')).toBeNull());
const trigger = (name = 'Talk to KAI') => screen.getByRole('button', { name });
async function openGuide(name = 'Talk to KAI') {
  await userEvent.click(trigger(name));
  return screen.getByRole('dialog');
}

describe('presence on every route', () => {
  for (const [name, path] of [['Home', '/'], ['Learn', '/learn'], ['Clinics', '/clinics'], ['Menu', '/menu'], ['Not found', '/nope']] as const) {
    it(`${name} (en) renders the closed floating button inside a labelled aside`, () => {
      renderApp(path);
      const aside = screen.getByRole('complementary', { name: 'DEMO guide assistant' });
      const btn = within(aside).getByRole('button', { name: 'Talk to KAI' });
      expect(btn).toHaveAttribute('aria-haspopup', 'dialog');
      expect(btn).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    it(`${name} (fil) uses the Filipino label`, () => {
      renderApp(path, 'fil');
      expect(screen.getByRole('button', { name: 'Kausapin si KAI' })).toBeInTheDocument();
    });
  }
});

describe('dialog behaviour', () => {
  it('opens a labelled, non-modal DEMO dialog and moves focus into it', async () => {
    renderApp('/');
    const dialog = await openGuide();
    expect(dialog).toHaveAccessibleName('KAI, your Kalinga guide');
    expect(dialog).not.toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(/scripted guide.*not AI-generated medical advice.*not a clinician/i);
    expect(dialog).toHaveFocus();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(document.body.style.overflow).toBe('');
    expect(screen.getByText(/do not enter personal details/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '200');
  });

  it('Escape closes the dialog and returns focus to the button', async () => {
    renderApp('/');
    await openGuide();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('the close button and the floating button both close it and return focus', async () => {
    renderApp('/');
    const dialog = await openGuide();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close guide' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    await openGuide();
    await userEvent.click(trigger());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    renderApp('/');
    const dialog = await openGuide();
    const send = within(dialog).getByRole('button', { name: 'Send' });
    const close = within(dialog).getByRole('button', { name: 'Close guide' });
    send.focus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(send).toHaveFocus();
    // From the dialog container itself, Shift+Tab wraps to the last control.
    dialog.focus();
    await userEvent.tab({ shift: true });
    expect(send).toHaveFocus();
  });

  it('does not lock the page: content behind it stays in the document and reachable by script', async () => {
    renderApp('/');
    await openGuide();
    expect(screen.getByRole('main')).toBeVisible();
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
    expect(screen.getByRole('main')).not.toHaveAttribute('aria-hidden');
  });
});

describe('conversation', () => {
  it('greets with the DEMO notice and offers all six quick replies', async () => {
    renderApp('/');
    const dialog = await openGuide();
    expect(within(dialog).getByRole('log', { name: 'Conversation' })).toHaveTextContent(/scripted DEMO guide/i);
    const chips = within(within(dialog).getByRole('group', { name: 'Quick replies' })).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual([
      'Possible HIV exposure in the last 72 hours',
      'Where do I start?',
      'Learn about STIs',
      'Find a clinic',
      'Talk to a real health professional',
      'Change language',
    ]);
  });

  it('answers a quick reply with route links that use the router', async () => {
    renderApp('/');
    const dialog = await openGuide();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Find a clinic' }));
    await settle(dialog);
    const log = within(dialog).getByRole('log');
    expect(log).toHaveTextContent(/Clinics page will list testing options/);
    const link = within(log).getByRole('link', { name: 'Clinics' });
    expect(link).toHaveAttribute('href', '/clinics');
    await userEvent.click(link);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Clinics' })).toBeInTheDocument();
  });

  it('urgent quick reply shows prominent professional-assessment guidance, no diagnosis, no contacts', async () => {
    renderApp('/');
    const dialog = await openGuide();
    await userEvent.click(within(dialog).getByRole('button', { name: /Possible HIV exposure in the last 72 hours/ }));
    await settle(dialog);
    const log = within(dialog).getByRole('log');
    expect(log).toHaveTextContent(/please get a professional assessment now/i);
    expect(log).toHaveTextContent(/qualified health professional/i);
    expect(log).toHaveTextContent(/cannot assess your situation or advise on treatment/i);
    expect(log).not.toHaveTextContent(/you have|you are infected|take pep/i);
    expect(log.textContent).not.toMatch(/@|https?:|\d{4,}/);
    expect(within(log).getByRole('link', { name: 'Clinics' })).toHaveAttribute('href', '/clinics');
    expect(log.querySelector('.assistant__msg--urgent')).not.toBeNull();
  });

  it('typed text is matched locally, the user message is echoed, and the input is cleared', async () => {
    renderApp('/');
    const dialog = await openGuide();
    const input = within(dialog).getByRole('textbox');
    await userEvent.type(input, 'I think I was exposed yesterday{Enter}');
    await settle(dialog);
    const log = within(dialog).getByRole('log');
    expect(log).toHaveTextContent('I think I was exposed yesterday');
    expect(log).toHaveTextContent(/professional assessment/i);
    expect(input).toHaveValue('');
  });

  it('handoff to a real professional says no clinician is connected and links to Clinics', async () => {
    renderApp('/');
    const dialog = await openGuide();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Talk to a real health professional' }));
    await settle(dialog);
    const log = within(dialog).getByRole('log');
    expect(log).toHaveTextContent('No clinician is connected in this DEMO');
    expect(within(log).getByRole('link', { name: 'Clinics' })).toHaveAttribute('href', '/clinics');
  });

  it('unknown input gets the fallback and every suggestion stays available in the dropdown', async () => {
    renderApp('/');
    const dialog = await openGuide();
    await userEvent.type(within(dialog).getByRole('textbox'), 'qwerty zxcv{Enter}');
    await settle(dialog);
    expect(within(dialog).getByRole('log')).toHaveTextContent(/I did not understand that/);
    await userEvent.click(within(dialog).getByRole('button', { name: 'More suggested questions' }));
    expect(within(within(dialog).getByRole('group', { name: 'Suggested questions' })).getAllByRole('button')).toHaveLength(6);
  });

  it('after the first message the panel expands, the chips hide and the rest live in a suggestions dropdown', async () => {
    renderApp('/');
    const dialog = await openGuide();
    expect(dialog).not.toHaveClass('assistant__panel--chat');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Find a clinic' }));
    expect(within(dialog).getByRole('log')).toHaveTextContent('KAI is typing');
    await settle(dialog);
    expect(dialog).toHaveClass('assistant__panel--chat');
    expect(within(dialog).queryByRole('group', { name: 'Quick replies' })).toBeNull();
    const more = within(dialog).getByRole('button', { name: 'More suggested questions' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(more);
    const names = within(within(dialog).getByRole('group', { name: 'Suggested questions' })).getAllByRole('button').map((b) => b.textContent);
    expect(names).toHaveLength(5);
    expect(names).not.toContain('Find a clinic');
    // Escape closes only the dropdown, not the chat.
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).queryByRole('group', { name: 'Suggested questions' })).toBeNull();
    await userEvent.click(more);
    await userEvent.click(within(within(dialog).getByRole('group', { name: 'Suggested questions' })).getByRole('button', { name: 'Learn about STIs' }));
    await settle(dialog);
    expect(dialog.querySelectorAll('.assistant__msg--user')).toHaveLength(2);
    expect(within(dialog).getByRole('log')).toHaveTextContent(/Learn pages will explain STIs/);
  });

  it('ignores blank submissions and caps typed text at 200 characters', () => {
    renderApp('/');
    fireEvent.click(trigger());
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.form as HTMLFormElement);
    expect(within(dialog).getByRole('log').querySelectorAll('.assistant__msg')).toHaveLength(1);
    fireEvent.change(input, { target: { value: 'a'.repeat(250) } });
    expect(input.value).toHaveLength(200);
  });

  it('keeps the conversation in memory only: closing clears it', async () => {
    renderApp('/');
    let dialog = await openGuide();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Learn about STIs' }));
    expect(within(dialog).getByRole('log').querySelectorAll('.assistant__msg').length).toBeGreaterThan(1);
    await userEvent.keyboard('{Escape}');
    dialog = await openGuide();
    expect(within(dialog).getByRole('log').querySelectorAll('.assistant__msg')).toHaveLength(1);
  });

  it('changes language through the guide and re-renders guide messages in Filipino', async () => {
    renderApp('/');
    const dialog = await openGuide();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change language' }));
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Switch the language to Filipino' }));
    expect(document.documentElement.lang).toBe('fil');
    expect(screen.getByRole('dialog')).toHaveAccessibleName('KAI, ang iyong gabay sa Kalinga');
    expect(within(screen.getByRole('dialog')).getByRole('log')).toHaveTextContent(/Hindi pa nasusuri|Draft lamang ang tekstong Filipino/);
  });

  it('adds no role=status of its own (the single-status invariant holds)', async () => {
    renderApp('/');
    const dialog = await openGuide();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Find a clinic' }));
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(dialog.querySelector('[role="status"], [role="alert"]')).toBeNull();
  });
});

describe('local only: no network, no storage', () => {
  it('makes no fetch and writes no storage while the guide is used', async () => {
    renderApp('/');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const before = fetchMock.mock.calls.length;
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const dialog = await openGuide();
    await userEvent.click(within(dialog).getByRole('button', { name: /72 hours/ }));
    await userEvent.type(within(dialog).getByRole('textbox'), 'find a clinic{Enter}');
    await userEvent.keyboard('{Escape}');
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('assistant sources contain no network, storage, logging or inline-style APIs', () => {
    const dir = resolve(process.cwd(), 'src/assistant');
    const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
    expect(files.sort()).toEqual(['AssistantWidget.tsx', 'engine.ts', 'registry.ts']);
    // The KAI mark lives with shared components; it is inline SVG with no style attributes either.
    expect(readFileSync(resolve(process.cwd(), 'src/components/KaiAvatar.tsx'), 'utf8')).not.toMatch(/\bstyle=/);
    for (const f of files) {
      const src = readFileSync(resolve(dir, f), 'utf8');
      expect(src, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|console\.|dangerouslySetInnerHTML|\bstyle=|\beval\(|new Function/);
    }
  });

  it('does not touch the service worker or its cache policy', () => {
    for (const f of ['public/sw.js', 'public/cache-policy.js', 'public/offline.html']) {
      expect(readFileSync(resolve(process.cwd(), f), 'utf8'), f).not.toMatch(/assistant/i);
    }
  });
});

describe('CSS placement', () => {
  const rule = (sel: string) => appCss.split('\n').find((l) => l.startsWith(`${sel} {`)) ?? '';

  it('floats fixed at the lower right above the bottom nav and the safe-area inset', () => {
    const fab = rule('.assistant__fab');
    expect(fab).toMatch(/position:\s*fixed/);
    expect(fab).toMatch(/right:\s*16px/);
    expect(fab).toMatch(/bottom:\s*var\(--assistant-offset\)/);
    expect(appCss).toMatch(/--assistant-offset:\s*calc\(var\(--bottom-nav-height\)[^;]*env\(safe-area-inset-bottom\)\)/);
    expect(appCss).toMatch(/--bottom-nav-height:\s*56px/);
    // The bottom nav is at least 44px of link plus its border; the offset must clear it.
    expect(rule('.bottom-nav')).toMatch(/z-index:\s*50/);
    expect(fab).toMatch(/z-index:\s*60/);
    expect(rule('.assistant__panel')).toMatch(/bottom:\s*calc\(var\(--assistant-offset\)/);
  });

  it('drops the bottom-nav offset on desktop where the nav is hidden', () => {
    expect(appCss).toMatch(/@media \(min-width: 768px\)\s*\{\s*\/\*[^*]*\*\/\s*:root\s*\{[^}]*--bottom-nav-height:\s*0px/);
  });

  it('is hidden in print', () => {
    expect(appCss).toMatch(/@media print\s*\{[^}]*\.assistant\s*\{\s*display:\s*none\s*!important/);
  });

  it.each(['.assistant__fab', '.assistant__close', '.assistant__link', '.assistant__chip', '.assistant__input'])(
    '%s enforces the 44px touch target',
    (sel) => {
      expect(rule(sel)).toMatch(/min-height:\s*var\(--touch-target\)/);
    },
  );
});

describe('axe-core with the guide open', () => {
  for (const [locale, name] of [['en', 'Talk to KAI'], ['fil', 'Kausapin si KAI']] as const) {
    it(`zero violations (${locale}): closed, open, urgent reply and fallback`, async () => {
      const { container } = renderApp('/', locale);
      await waitFor(() => expect(container.querySelector('[data-state="ready"]')).not.toBeNull());
      expect(formatViolations(await runAxe(container))).toBe('');
      const dialog = await openGuide(name);
      expect(formatViolations(await runAxe(container))).toBe('');
      const chips = within(within(dialog).getByRole('group')).getAllByRole('button');
      await userEvent.click(chips[0]!); // urgent
      await settle(dialog);
      await userEvent.click(within(dialog).getByRole('button', { name: /^(More suggested questions|Higit pang mungkahing tanong)$/ }));
      const items = within(within(dialog).getByRole('group', { name: /^(Suggested questions|Mga mungkahing tanong)$/ })).getAllByRole('button');
      await userEvent.click(items[items.length - 1]!); // human handoff
      await settle(dialog);
      await userEvent.type(within(dialog).getByRole('textbox'), 'qwerty{Enter}');
      await settle(dialog);
      expect(formatViolations(await runAxe(container))).toBe('');
    });
  }
});

describe('SA-2: page-aware suggestions and final-site answers', () => {
  const chipsOf = (dialog: HTMLElement) => within(within(dialog).getByRole('group', { name: 'Quick replies' })).getAllByRole('button').map((c) => c.textContent);

  it('on the clinics page the chips favour request, profile and pathway but keep urgent first and a real person last', async () => {
    renderApp('/clinics');
    const dialog = await openGuide();
    const chips = chipsOf(dialog);
    expect(chips[0]).toBe('Possible HIV exposure in the last 72 hours');
    expect(chips.at(-1)).toBe('Talk to a real health professional');
    expect(chips).toContain('How do I request an appointment?');
    expect(chips).toContain('What is on a clinic profile?');
    expect(chips.length).toBeLessThanOrEqual(6);
  });

  it('on the status lookup page the chips favour status and reminders', async () => {
    renderApp('/appointments/lookup');
    const dialog = await openGuide();
    const chips = chipsOf(dialog);
    expect(chips).toEqual(expect.arrayContaining(['Check my request', 'About reminders']));
    expect(chips[0]).toBe('Possible HIV exposure in the last 72 hours');
    expect(chips.at(-1)).toBe('Talk to a real health professional');
  });

  it('the home page keeps the default six chips', async () => {
    renderApp('/');
    expect(chipsOf(await openGuide())).toHaveLength(6);
  });

  it('"How do I request an appointment?" explains it is a request, links to Clinics and the status page', async () => {
    renderApp('/clinics');
    const dialog = await openGuide();
    await userEvent.click(within(dialog).getByRole('button', { name: 'How do I request an appointment?' }));
    await settle(dialog);
    const log = within(dialog).getByRole('log');
    expect(log).toHaveTextContent(/This is a request, not a confirmation/);
    expect(within(log).getByRole('link', { name: 'Clinics' })).toHaveAttribute('href', '/clinics');
    expect(within(log).getByRole('link', { name: 'Check a request' })).toHaveAttribute('href', '/appointments/lookup');
  });

  it('typed booking, status and reminder questions get the right answer; urgent still wins', async () => {
    renderApp('/');
    const dialog = await openGuide();
    const input = within(dialog).getByRole('textbox');
    await userEvent.type(input, 'will you send me a reminder{Enter}');
    await settle(dialog);
    expect(within(dialog).getByRole('log')).toHaveTextContent(/mock only: no real message is sent/);
    await userEvent.type(input, 'how do I check my request status{Enter}');
    await settle(dialog);
    expect(within(dialog).getByRole('log')).toHaveTextContent(/enter the reference and the secret code/);
    await userEvent.type(input, 'I want to book but I was exposed last night{Enter}');
    await settle(dialog);
    expect(within(dialog).getByRole('log')).toHaveTextContent(/please get a professional assessment now/i);
  });

  it('the human handoff offers a DEMO clinic request or a real clinic and shows no contact details', async () => {
    renderApp('/clinics');
    const dialog = await openGuide();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Talk to a real health professional' }));
    await settle(dialog);
    const log = within(dialog).getByRole('log');
    expect(log).toHaveTextContent('No clinician is connected in this DEMO');
    expect(log).toHaveTextContent(/request an appointment with a DEMO clinic/);
    expect(log).toHaveTextContent(/contact a real health professional or clinic directly/);
    expect(log.textContent).not.toMatch(/@|https?:|\d{4,}/);
  });

  it('axe: zero violations on the clinics page with a route-specific chip set and a booking answer (en and fil)', async () => {
    for (const [locale, name, chip] of [['en', 'Talk to KAI', 'How do I request an appointment?'], ['fil', 'Kausapin si KAI', 'Paano humiling ng appointment?']] as const) {
      const { container, unmount } = renderApp('/clinics', locale);
      await waitFor(() => expect(container.querySelector('[data-state="ready"], .page, main')).not.toBeNull());
      const dialog = await openGuide(name);
      await userEvent.click(within(dialog).getByRole('button', { name: chip }));
      await settle(dialog);
      expect(formatViolations(await runAxe(container))).toBe('');
      unmount();
    }
  });
});
