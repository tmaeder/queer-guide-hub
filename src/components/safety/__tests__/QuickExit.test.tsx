import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { QuickExit, performQuickExit } from '../QuickExit';

beforeEach(() => {
  if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
      lng: 'en',
      resources: { en: { translation: {} } },
      interpolation: { escapeValue: false },
    });
  }
});

describe('QuickExit', () => {
  it('renders a labelled button', () => {
    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <QuickExit />
      </I18nextProvider>,
    );
    expect(getByRole('button', { name: /leave this page/i })).toBeTruthy();
  });

  it('navigates away on ESC', () => {
    const replace = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { replace },
      writable: true,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <QuickExit />
      </I18nextProvider>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('weather.com'));
  });

  it('performQuickExit replaces history and navigates', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const replace = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { replace },
      writable: true,
    });
    performQuickExit();
    expect(replaceState).toHaveBeenCalled();
    expect(replace).toHaveBeenCalled();
  });
});
