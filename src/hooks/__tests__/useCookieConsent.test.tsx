import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CookieConsentProvider, useCookieConsent } from '../useCookieConsent';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <CookieConsentProvider>{children}</CookieConsentProvider>
);

describe('useCookieConsent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should throw when used outside provider', () => {
    expect(() => renderHook(() => useCookieConsent())).toThrow(
      'useCookieConsent must be used within a CookieConsentProvider',
    );
  });

  it('should show banner when no consent stored', () => {
    const { result } = renderHook(() => useCookieConsent(), { wrapper });
    expect(result.current.showBanner).toBe(true);
    expect(result.current.hasConsented).toBe(false);
  });

  it('should accept all cookies', () => {
    const { result } = renderHook(() => useCookieConsent(), { wrapper });
    act(() => { result.current.acceptAll(); });
    expect(result.current.preferences?.analytics).toBe(true);
    expect(result.current.preferences?.marketing).toBe(true);
    expect(result.current.showBanner).toBe(false);
    expect(result.current.hasConsented).toBe(true);
  });

  it('should accept only necessary cookies', () => {
    const { result } = renderHook(() => useCookieConsent(), { wrapper });
    act(() => { result.current.acceptNecessary(); });
    expect(result.current.preferences?.necessary).toBe(true);
    expect(result.current.preferences?.analytics).toBe(false);
    expect(result.current.preferences?.marketing).toBe(false);
  });

  it('should force necessary to true in updatePreferences', () => {
    const { result } = renderHook(() => useCookieConsent(), { wrapper });
    act(() => {
      result.current.updatePreferences({
        necessary: false, // should be overridden
        functional: true,
        analytics: false,
        marketing: false,
      });
    });
    expect(result.current.preferences?.necessary).toBe(true);
    expect(result.current.preferences?.functional).toBe(true);
  });

  it('should persist to localStorage', () => {
    const { result } = renderHook(() => useCookieConsent(), { wrapper });
    act(() => { result.current.acceptAll(); });
    const stored = JSON.parse(localStorage.getItem('queer-guide-cookie-consent')!);
    expect(stored.version).toBe('1.0');
    expect(stored.preferences.analytics).toBe(true);
  });

  it('should load saved consent on mount', () => {
    localStorage.setItem('queer-guide-cookie-consent', JSON.stringify({
      version: '1.0',
      preferences: { necessary: true, functional: false, analytics: true, marketing: false },
    }));
    const { result } = renderHook(() => useCookieConsent(), { wrapper });
    expect(result.current.showBanner).toBe(false);
    expect(result.current.hasConsented).toBe(true);
    expect(result.current.preferences?.analytics).toBe(true);
  });

  it('should reset consent', () => {
    const { result } = renderHook(() => useCookieConsent(), { wrapper });
    act(() => { result.current.acceptAll(); });
    act(() => { result.current.resetConsent(); });
    expect(result.current.showBanner).toBe(true);
    expect(result.current.hasConsented).toBe(false);
    expect(result.current.preferences).toBeNull();
    expect(localStorage.getItem('queer-guide-cookie-consent')).toBeNull();
  });

  it('should show banner for outdated consent version', () => {
    localStorage.setItem('queer-guide-cookie-consent', JSON.stringify({
      version: '0.9',
      preferences: { necessary: true, functional: true, analytics: true, marketing: true },
    }));
    const { result } = renderHook(() => useCookieConsent(), { wrapper });
    expect(result.current.showBanner).toBe(true);
  });
});
