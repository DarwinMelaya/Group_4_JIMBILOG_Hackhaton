import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeBase, registerServiceWorker } from './register';

function fakes(readyState: DocumentReadyState) {
  const registration = { waiting: null, installing: null, addEventListener: vi.fn() };
  const container = {
    controller: null,
    addEventListener: vi.fn(),
    register: vi.fn(async () => registration as unknown as ServiceWorkerRegistration),
  };
  let onLoad: (() => void) | undefined;
  const win = {
    addEventListener: vi.fn((t: string, l: () => void) => {
      if (t === 'load') onLoad = l;
    }),
  };
  return { registration, container, win, doc: { readyState }, load: () => onLoad?.() };
}

describe('S1-9 (f) registerServiceWorker', () => {
  it('normalizeBase always yields a root-relative path with leading and trailing slash', () => {
    expect(normalizeBase('/')).toBe('/');
    expect(normalizeBase('/kalinga')).toBe('/kalinga/');
    expect(normalizeBase('/kalinga/')).toBe('/kalinga/');
    expect(normalizeBase(undefined)).toBe('/');
    expect(normalizeBase('')).toBe('/');
    expect(normalizeBase('./')).toBe('/');
    expect(normalizeBase('https://cdn.example/x/')).toBe('/');
  });
  it('does nothing outside production builds', async () => {
    const f = fakes('complete');
    await expect(registerServiceWorker({ prod: false, ...f })).resolves.toBeNull();
    expect(f.container.register).not.toHaveBeenCalled();
    expect(f.win.addEventListener).not.toHaveBeenCalled();
  });
  it('waits for the window load event before registering', async () => {
    const f = fakes('loading');
    const pending = registerServiceWorker({ prod: true, base: '/', ...f });
    await Promise.resolve();
    expect(f.container.register).not.toHaveBeenCalled(); // first paint is not competing with the worker
    expect(f.win.addEventListener).toHaveBeenCalledWith('load', expect.any(Function), { once: true });
    f.load();
    await expect(pending).resolves.toBe(f.registration);
    expect(f.container.register).toHaveBeenCalledTimes(1);
  });
  it('registers immediately when the page has already finished loading', async () => {
    const f = fakes('complete');
    await registerServiceWorker({ prod: true, base: '/', ...f });
    expect(f.container.register).toHaveBeenCalledTimes(1);
    expect(f.win.addEventListener).not.toHaveBeenCalled();
  });
  it('uses the root base by default for script and scope', async () => {
    const f = fakes('complete');
    await registerServiceWorker({ prod: true, base: '/', ...f });
    expect(f.container.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });
  it('follows a non-root base for both script URL and scope', async () => {
    const f = fakes('complete');
    await registerServiceWorker({ prod: true, base: '/kalinga', ...f });
    expect(f.container.register).toHaveBeenCalledWith('/kalinga/sw.js', { scope: '/kalinga/' });
  });
  it('starts watching the registration for updates', async () => {
    const f = fakes('complete');
    await registerServiceWorker({ prod: true, base: '/', ...f });
    expect(f.registration.addEventListener).toHaveBeenCalledWith('updatefound', expect.any(Function));
    expect(f.container.addEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function));
  });
  it('resolves null and never throws when registration fails', async () => {
    const f = fakes('complete');
    f.container.register.mockRejectedValueOnce(new Error('SecurityError'));
    await expect(registerServiceWorker({ prod: true, base: '/', ...f })).resolves.toBeNull();
  });
  it('resolves null when service workers are unavailable', async () => {
    const f = fakes('complete');
    await expect(
      registerServiceWorker({ prod: true, base: '/', win: f.win, doc: f.doc, container: undefined }),
    ).resolves.toBeNull();
  });
  it('reads the base from import.meta.env.BASE_URL, not a hard-coded path', () => {
    const src = fs.readFileSync(path.resolve(import.meta.dirname, 'register.ts'), 'utf8');
    expect(src).toContain('import.meta.env.BASE_URL');
    expect(src).not.toMatch(/register\(\s*['"`]\/sw\.js/);
  });
});
