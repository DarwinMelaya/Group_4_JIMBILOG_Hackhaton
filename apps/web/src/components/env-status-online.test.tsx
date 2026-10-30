import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { EnvStatus } from './EnvStatus';
import { I18nProvider } from '../i18n/I18nProvider';
import { queryClient } from '../api/client';

function setOnLine(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

beforeEach(() => {
  queryClient.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('EnvStatus subscribes to online/offline events', () => {
  it('switches between the error and offline messages without a reload, and unsubscribes on unmount', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network');
    }));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(
      <I18nProvider initialLocale="en">
        <EnvStatus />
      </I18nProvider>,
    );
    expect(add.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['online', 'offline']));

    await waitFor(() => expect(screen.getByRole('contentinfo')).toHaveTextContent(/status unavailable/), { timeout: 6000 });

    act(() => setOnLine(false));
    await waitFor(() => expect(screen.getByRole('contentinfo')).toHaveTextContent(/appear to be offline/));

    act(() => setOnLine(true));
    await waitFor(() => expect(screen.getByRole('contentinfo')).toHaveTextContent(/status unavailable/));

    unmount();
    expect(remove.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['online', 'offline']));
  });
});
