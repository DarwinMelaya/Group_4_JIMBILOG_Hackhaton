import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App';
import { I18nProvider } from '../i18n/I18nProvider';
import { UpdatePrompt } from '../components/UpdatePrompt';
import { queryClient } from '../api/client';
import { formatViolations, runAxe } from '../a11y/axe';
import { createUpdateController, updateController } from './update';

class FakeWorker {
  state = 'installing';
  posted: unknown[] = [];
  private ls: Array<() => void> = [];
  postMessage(m: unknown) {
    this.posted.push(m);
  }
  addEventListener(_t: 'statechange', l: () => void) {
    this.ls.push(l);
  }
  setState(s: string) {
    this.state = s;
    this.ls.forEach((l) => l());
  }
}
class FakeRegistration {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  adds = 0;
  private ls: Array<() => void> = [];
  addEventListener(_t: 'updatefound', l: () => void) {
    this.adds++;
    this.ls.push(l);
  }
  found(w: FakeWorker) {
    this.installing = w;
    this.ls.forEach((l) => l());
  }
}
class FakeContainer {
  controller: unknown = {};
  adds = 0;
  private ls: Array<() => void> = [];
  addEventListener(_t: 'controllerchange', l: () => void) {
    this.adds++;
    this.ls.push(l);
  }
  changed() {
    this.ls.forEach((l) => l());
  }
}

function setup(controlled = true) {
  const reload = vi.fn();
  const ctl = createUpdateController(reload);
  const reg = new FakeRegistration();
  const container = new FakeContainer();
  if (!controlled) container.controller = null;
  ctl.track(reg, container);
  return { ctl, reg, container, reload };
}

describe('S1-9 (a) update controller', () => {
  it('shows nothing on first install (no controlling worker yet)', () => {
    const { ctl, reg } = setup(false);
    const w = new FakeWorker();
    reg.found(w);
    w.setState('installed');
    expect(ctl.getSnapshot()).toBe(false);
  });
  it('flags an update when a new worker installs under a controlling worker, and notifies subscribers', () => {
    const { ctl, reg } = setup();
    const listener = vi.fn();
    ctl.subscribe(listener);
    const w = new FakeWorker();
    reg.found(w);
    expect(ctl.getSnapshot()).toBe(false); // still installing
    w.setState('installed');
    expect(ctl.getSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('flags an update that is already waiting when tracking starts', () => {
    const ctl = createUpdateController(vi.fn());
    const reg = new FakeRegistration();
    reg.waiting = new FakeWorker();
    ctl.track(reg, new FakeContainer());
    expect(ctl.getSnapshot()).toBe(true);
  });
  it('sends SKIP_WAITING only on accept, then reloads once the new worker takes control', () => {
    const { ctl, reg, container, reload } = setup();
    const w = new FakeWorker();
    reg.found(w);
    w.setState('installed');
    expect(w.posted).toEqual([]); // nothing is sent before the user accepts
    ctl.accept();
    expect(w.posted).toEqual([{ type: 'SKIP_WAITING' }]);
    expect(reload).not.toHaveBeenCalled();
    container.changed();
    container.changed();
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('does not reload on controllerchange the user did not ask for (first-install claim)', () => {
    const { container, reload } = setup(false);
    container.changed();
    expect(reload).not.toHaveBeenCalled();
  });
  it('dismiss hides the prompt without messaging the worker; a newer update shows it again', () => {
    const { ctl, reg } = setup();
    const w = new FakeWorker();
    reg.found(w);
    w.setState('installed');
    ctl.dismiss();
    expect(ctl.getSnapshot()).toBe(false);
    expect(w.posted).toEqual([]);
    const w2 = new FakeWorker();
    reg.found(w2);
    w2.setState('installed');
    expect(ctl.getSnapshot()).toBe(true);
  });
  it('accept with no waiting worker is a no-op', () => {
    const { ctl, reload } = setup();
    ctl.accept();
    expect(reload).not.toHaveBeenCalled();
  });
  it('tracking the same registration twice does not duplicate listeners', () => {
    const { ctl, reg, container } = setup();
    ctl.track(reg, container);
    expect(reg.adds).toBe(1);
    expect(container.adds).toBe(1);
  });
});

function renderPrompt(ctl: ReturnType<typeof createUpdateController>, locale: 'en' | 'fil' = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <main>
        <UpdatePrompt controller={ctl} />
      </main>
    </I18nProvider>,
  );
}
function withUpdate() {
  const s = setup();
  const w = new FakeWorker();
  s.reg.found(w);
  w.setState('installed');
  return { ...s, w };
}

describe('S1-9 (a) UpdatePrompt', () => {
  it('renders nothing while no update is waiting', () => {
    const { ctl } = setup();
    const { container } = renderPrompt(ctl);
    expect(container.querySelector('.update-prompt')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('appears when an update waits, announces itself, and offers two labelled buttons', async () => {
    const { ctl, reg } = setup();
    renderPrompt(ctl);
    expect(screen.queryByRole('button', { name: 'Update now' })).toBeNull();
    const w = new FakeWorker();
    await act(async () => {
      reg.found(w);
      w.setState('installed');
    });
    expect(screen.getByRole('status')).toHaveTextContent('A new version of KALINGA is ready');
    expect(screen.getByRole('region', { name: 'A new version of KALINGA is ready' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
  });
  it('Update now sends SKIP_WAITING; Later dismisses without it', async () => {
    const user = userEvent.setup();
    const a = withUpdate();
    renderPrompt(a.ctl);
    await user.click(screen.getByRole('button', { name: 'Update now' }));
    expect(a.w.posted).toEqual([{ type: 'SKIP_WAITING' }]);

    const b = withUpdate();
    renderPrompt(b.ctl);
    await user.click(screen.getAllByRole('button', { name: 'Later' }).at(-1)!);
    expect(b.w.posted).toEqual([]);
    expect(b.ctl.getSnapshot()).toBe(false);
  });
  it('is reachable by keyboard', async () => {
    const user = userEvent.setup();
    const { ctl, w } = withUpdate();
    renderPrompt(ctl);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Update now' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Later' })).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}{Enter}');
    expect(w.posted).toEqual([{ type: 'SKIP_WAITING' }]);
  });
  it('renders Filipino strings', () => {
    const { ctl } = withUpdate();
    renderPrompt(ctl, 'fil');
    expect(screen.getByRole('button', { name: 'I-update ngayon' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mamaya' })).toBeInTheDocument();
  });
  it.each(['en', 'fil'] as const)('has zero axe violations (%s)', async (locale) => {
    const { ctl } = withUpdate();
    const { container } = renderPrompt(ctl, locale);
    const v = await runAxe(container);
    expect(formatViolations(v)).toBe('');
  });
});

describe('S1-9 (a) prompt is wired into the app shell', () => {
  afterEach(() => updateController.dismiss());
  it('shows in AppShell when the app-wide controller has a waiting update', async () => {
    queryClient.clear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    render(
      <I18nProvider initialLocale="en">
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Update now' })).toBeNull();
    await act(async () => {
      const reg = new FakeRegistration();
      reg.waiting = new FakeWorker();
      updateController.track(reg, new FakeContainer());
    });
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
