import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installAnalyticsConsentLoader } from '../analyticsLoader';

const CONSENT_KEY = 'queer-guide-cookie-consent';

function setConsent(analytics: boolean) {
  localStorage.setItem(
    CONSENT_KEY,
    JSON.stringify({
      version: '1.0',
      preferences: { necessary: true, functional: false, analytics, marketing: false },
      timestamp: new Date().toISOString(),
    }),
  );
}

function umamiTagPresent() {
  return Boolean(document.getElementById('umami-analytics'));
}

beforeEach(() => {
  localStorage.clear();
  document.getElementById('umami-analytics')?.remove();
});

afterEach(() => {
  document.getElementById('umami-analytics')?.remove();
});

describe('installAnalyticsConsentLoader (fail-closed)', () => {
  it('does NOT inject umami when there is no stored consent', () => {
    installAnalyticsConsentLoader();
    expect(umamiTagPresent()).toBe(false);
  });

  it('does NOT inject umami when consent explicitly refuses analytics', () => {
    setConsent(false);
    installAnalyticsConsentLoader();
    expect(umamiTagPresent()).toBe(false);
  });

  it('injects umami immediately when consent already grants analytics', () => {
    setConsent(true);
    installAnalyticsConsentLoader();
    const tag = document.getElementById('umami-analytics') as HTMLScriptElement | null;
    expect(tag).not.toBeNull();
    expect(tag!.src).toContain('/umami.js');
    expect(tag!.dataset.websiteId).toBe('queer-guide');
  });

  it('injects umami when the user later grants consent via the banner event', () => {
    installAnalyticsConsentLoader();
    expect(umamiTagPresent()).toBe(false);

    window.dispatchEvent(
      new CustomEvent('cookieConsentUpdated', {
        detail: { necessary: true, functional: false, analytics: true, marketing: false },
      }),
    );

    expect(umamiTagPresent()).toBe(true);
  });

  it('does not double-inject when the consent event fires twice', () => {
    installAnalyticsConsentLoader();
    window.dispatchEvent(
      new CustomEvent('cookieConsentUpdated', {
        detail: { analytics: true },
      }),
    );
    window.dispatchEvent(
      new CustomEvent('cookieConsentUpdated', {
        detail: { analytics: true },
      }),
    );
    expect(document.querySelectorAll('#umami-analytics').length).toBe(1);
  });
});
