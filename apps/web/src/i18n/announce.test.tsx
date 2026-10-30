import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App';
import { I18nProvider } from './I18nProvider';

function renderApp(initialLocale?: 'en' | 'fil', strict = false) {
  const tree = (
    <I18nProvider initialLocale={initialLocale}>
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>
    </I18nProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('language announcement fires on every user switch', () => {
  it('announces again when the same locale is re-selected, as a fresh live-region node', async () => {
    renderApp('en');
    const announcer = screen.getByTestId('locale-announcer');
    expect(announcer).toHaveTextContent('');
    expect(announcer.childElementCount).toBe(0);

    const english = screen.getAllByRole('button', { name: 'English' })[0]!;
    await userEvent.click(english);
    expect(announcer).toHaveTextContent('Language changed to English');
    const first = announcer.firstElementChild;
    expect(first).not.toBeNull();

    await userEvent.click(english);
    expect(announcer).toHaveTextContent('Language changed to English');
    const second = announcer.firstElementChild;
    expect(second).not.toBeNull();
    // Identical text, but a newly mounted node, which is what makes assistive tech re-announce it.
    expect(second).not.toBe(first);
    expect(announcer.childElementCount).toBe(1);
  });

  it('handles repeated identical switches in a row and alternating switches', async () => {
    renderApp('en');
    const announcer = screen.getByTestId('locale-announcer');
    const nodes = new Set<Element | null>();
    for (let i = 0; i < 3; i++) {
      await userEvent.click(screen.getAllByRole('button', { name: 'Filipino' })[0]!);
      expect(announcer).toHaveTextContent('Napalitan ang wika sa Filipino');
      nodes.add(announcer.firstElementChild);
    }
    expect(nodes.size).toBe(3);
    await userEvent.click(screen.getAllByRole('button', { name: 'English' })[0]!);
    expect(announcer).toHaveTextContent('Language changed to English');
  });

  it('has one storage write and one announcement node per click, even in StrictMode', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderApp('en', true);
    const announcer = screen.getByTestId('locale-announcer');
    await userEvent.click(screen.getAllByRole('button', { name: 'English' })[0]!);
    await userEvent.click(screen.getAllByRole('button', { name: 'English' })[0]!);
    expect(setItem).toHaveBeenCalledTimes(2);
    expect(setItem).toHaveBeenLastCalledWith('kalinga.locale', 'en');
    expect(announcer.textContent).toBe('Language changed to English');
    expect(announcer.childElementCount).toBe(1);
    expect(document.documentElement.lang).toBe('en');
    setItem.mockRestore();
  });

  it('keeps no role=status in default en state, only the fil review notice after switching, and one announcer', async () => {
    renderApp('en');
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(document.querySelectorAll('.sr-only[aria-live]')).toHaveLength(1);
    await userEvent.click(screen.getAllByRole('button', { name: 'English' })[0]!);
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    await userEvent.click(screen.getAllByRole('button', { name: 'Filipino' })[0]!);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(document.querySelectorAll('.sr-only[aria-live]')).toHaveLength(1);
  });

  it('does not announce on initial load', () => {
    renderApp('fil');
    expect(screen.getByTestId('locale-announcer')).toHaveTextContent('');
    expect(screen.getByTestId('locale-announcer').childElementCount).toBe(0);
  });
});
