/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useNavigate } from 'react-router';

const pwa = { canInstall: true, isInstalled: false, promptInstall: vi.fn(async () => true) };
const consent = { showBanner: false };
vi.mock('../PWAProvider', () => ({ usePWA: () => pwa }));
vi.mock('@/hooks/useCookieConsent', () => ({ useCookieConsent: () => consent }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { InstallBanner } from '../InstallBanner';
import { isIOSSafari } from '../isIOSSafari';

let go: (p: string) => void = () => {};
function Nav() {
  const n = useNavigate();
  useEffect(() => {
    go = (p) => act(() => n(p));
  }, [n]);
  return null;
}

function mount(start = '/a') {
  render(
    <MemoryRouter initialEntries={[start]}>
      <Nav />
      <InstallBanner />
    </MemoryRouter>,
  );
}

const card = () => screen.queryByRole('region', { name: 'pwa.install.ariaLabel' });

beforeEach(() => {
  localStorage.clear();
  pwa.canInstall = true;
  pwa.isInstalled = false;
  consent.showBanner = false;
});

describe('InstallBanner', () => {
  it('waits for three distinct pages', () => {
    mount();
    go('/a');
    go('/b');
    expect(card()).toBeNull();
    go('/c');
    expect(card()).not.toBeNull();
    expect(screen.getByText('pwa.install.headline')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('never stacks on the cookie banner', () => {
    consent.showBanner = true;
    mount();
    go('/b');
    go('/c');
    expect(card()).toBeNull();
  });

  it('stays off crisis pages', () => {
    mount();
    go('/b');
    go('/c');
    go('/help');
    expect(card()).toBeNull();
  });

  it('"Not now" closes and is remembered', () => {
    mount();
    go('/b');
    go('/c');
    fireEvent.click(screen.getByRole('button', { name: 'pwa.install.notNow' }));
    expect(card()).toBeNull();
    expect(Number(localStorage.getItem('pwa-install-dismissed'))).toBeGreaterThan(Date.now());
  });

  it('closes after the native dialog answers', async () => {
    mount();
    go('/b');
    go('/c');
    await act(async () => fireEvent.click(screen.getByText('pwa.install.action')));
    expect(pwa.promptInstall).toHaveBeenCalled();
    expect(card()).toBeNull();
  });
});

describe('isIOSSafari', () => {
  const safari =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  it('accepts iPhone Safari and iPadOS desktop UA', () => {
    expect(isIOSSafari(safari, 5)).toBe(true);
    expect(
      isIOSSafari(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        5,
      ),
    ).toBe(true);
  });
  it('rejects Chrome iOS, in-app browsers and desktop Mac', () => {
    expect(isIOSSafari(safari.replace('Version/17.0', 'CriOS/120.0'), 5)).toBe(false);
    expect(isIOSSafari(safari + ' Instagram 300.0', 5)).toBe(false);
    expect(
      isIOSSafari(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        0,
      ),
    ).toBe(false);
  });
});
