/** @vitest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import de from '@/i18n/locales/de.json';
import { CookieConsentBanner } from '../CookieConsentBanner';

const necessary = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCookieConsent', () => ({
  useCookieConsent: () => ({
    showBanner: true,
    acceptAll: vi.fn(),
    acceptNecessary: necessary,
    preferences: null,
    updatePreferences: vi.fn(),
  }),
}));

it('localizes the banner and settings dialog while preserving the necessary-only choice', async () => {
  const i18n = createInstance();
  await i18n.init({ lng: 'de', resources: { de: { translation: de } } });
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <CookieConsentBanner />
      </MemoryRouter>
    </I18nextProvider>,
  );
  expect(screen.getByRole('region', { name: 'Cookie-Einstellungen' })).toBeTruthy();
  expect(screen.queryByText('Accept All')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Anpassen' }));
  expect(await screen.findByRole('dialog')).toBeTruthy();
  expect(screen.getByText('Notwendige Cookies')).toBeTruthy();
  expect(screen.getByText('Einstellungen speichern')).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: 'Nur notwendige' })[0]);
  expect(necessary).toHaveBeenCalledOnce();
});
