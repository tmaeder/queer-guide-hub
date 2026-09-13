import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installAnalyticsConsentLoader } from '../analyticsLoader';
import { CONSENT_STORAGE_KEY } from '@/lib/analyticsConsent';

/**
 * Withdrawing consent has to stop tracking NOW, not after the next reload.
 *
 * The loader only ever handled `analytics === true`, and `resetConsent` never
 * dispatched the consent event at all — so the one moment a visitor explicitly
 * asked us to stop was the one moment nothing listened. Dropping
 * `window.umami` is what actually silences it: the injected script's history
 * patch and its `track` closure both survive the tag being removed, and every
 * remaining custom-event emitter goes through that global.
 */

function grant(analytics: boolean) {
  localStorage.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify({
      version: '1.0',
      preferences: { necessary: true, functional: false, analytics, marketing: false },
      timestamp: new Date().toISOString(),
    }),
  );
}

function consentEvent(analytics: boolean) {
  return new CustomEvent('cookieConsentUpdated', {
    detail: { necessary: true, functional: false, analytics, marketing: false },
  });
}

const tagPresent = () => Boolean(document.getElementById('umami-analytics'));

beforeEach(() => {
  localStorage.clear();
  document.getElementById('umami-analytics')?.remove();
  delete (window as { umami?: unknown }).umami;
});

afterEach(() => {
  document.getElementById('umami-analytics')?.remove();
  delete (window as { umami?: unknown }).umami;
});

describe('consent withdrawal tears tracking down in-session', () => {
  it('removes the script tag and the umami global when analytics is refused', () => {
    grant(true);
    installAnalyticsConsentLoader();
    expect(tagPresent()).toBe(true);
    // Stand in for the script having run.
    (window as { umami?: unknown }).umami = { track: () => {} };

    window.dispatchEvent(consentEvent(false));

    expect(tagPresent()).toBe(false);
    expect((window as { umami?: unknown }).umami).toBeUndefined();
  });

  it('tears down on a detail-less event too (the resetConsent shape)', () => {
    grant(true);
    installAnalyticsConsentLoader();
    (window as { umami?: unknown }).umami = { track: () => {} };

    window.dispatchEvent(new CustomEvent('cookieConsentUpdated'));

    expect(tagPresent()).toBe(false);
    expect((window as { umami?: unknown }).umami).toBeUndefined();
  });

  it('can be re-granted after a withdrawal without a reload', () => {
    // Positive control: without this, a loader that simply never injects also
    // passes both assertions above.
    installAnalyticsConsentLoader();
    window.dispatchEvent(consentEvent(true));
    expect(tagPresent()).toBe(true);

    window.dispatchEvent(consentEvent(false));
    expect(tagPresent()).toBe(false);

    window.dispatchEvent(consentEvent(true));
    expect(tagPresent()).toBe(true);
  });
});
