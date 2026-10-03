/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (_k: string, d?: string) => d ?? _k,
      i18n: { changeLanguage: () => Promise.resolve() },
    }),
  };
});

import { QuickExit } from '../QuickExit';
import { performQuickExit } from '../perform-quick-exit';

describe('QuickExit', () => {
  it('renders a labelled button', () => {
    const { getByRole } = render(<QuickExit />);
    expect(getByRole('button', { name: /leave this page/i })).toBeTruthy();
  });

  it('does not steal Escape from an open dialog or sheet', () => {
    const replace = vi.fn();
    Object.defineProperty(window, 'location', { value: { replace }, writable: true });
    render(<QuickExit />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(replace).not.toHaveBeenCalled();
  });

  it('navigates away when the explicit control is activated', () => {
    const replace = vi.fn();
    Object.defineProperty(window, 'location', { value: { replace }, writable: true });
    const { getByRole } = render(<QuickExit />);
    fireEvent.click(getByRole('button', { name: /leave this page/i }));
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('weather.com'));
  });

  it('performQuickExit replaces history and navigates', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const replace = vi.fn();
    Object.defineProperty(window, 'location', { value: { replace }, writable: true });
    performQuickExit();
    expect(replaceState).toHaveBeenCalled();
    expect(replace).toHaveBeenCalled();
  });
});
