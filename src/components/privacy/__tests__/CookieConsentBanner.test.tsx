/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { OPEN_COOKIE_PREFERENCES_EVENT } from '@/lib/analyticsConsent';

const consent = vi.hoisted(() => ({
  showBanner: false,
  acceptAll: vi.fn(),
  acceptNecessary: vi.fn(),
}));
vi.mock('@/hooks/useCookieConsent', () => ({ useCookieConsent: () => consent }));
vi.mock('../CookiePreferencesDialog', () => ({
  CookiePreferencesDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Preferences</div> : null,
}));
import { CookieConsentBanner } from '../CookieConsentBanner';
const mount = () =>
  render(
    <MemoryRouter>
      <CookieConsentBanner />
    </MemoryRouter>,
  );

describe('CookieConsentBanner', () => {
  beforeEach(() => {
    cleanup();
    consent.showBanner = false;
    vi.clearAllMocks();
  });
  it('does not mount the preference dialog until requested', () => {
    mount();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps both consent actions usable and opens lazy preferences', async () => {
    consent.showBanner = true;
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Accept All' }));
    expect(consent.acceptAll).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Necessary Only' }));
    expect(consent.acceptNecessary).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Preferences');
  });
  it('reopens preferences after the banner is dismissed', async () => {
    mount();
    act(() => window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT)));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Preferences');
  });
});
