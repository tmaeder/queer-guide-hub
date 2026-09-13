import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CONSENT_STORAGE_KEY,
  analyticsAllowed,
  hasAnalyticsConsent,
  isAutomatedClient,
  isDoNotTrackEnabled,
  onAnalyticsConsentChange,
} from '../analyticsConsent';

/**
 * These assertions guard a privacy rule, so each one is written to fail if the
 * corresponding guard is deleted or inverted — every `return false` in
 * `analyticsConsent.ts` has a case here that only passes while it is present.
 */

function store(value: unknown) {
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value));
}

function grant(analytics: boolean, version = '1.0') {
  store({
    version,
    preferences: { necessary: true, functional: false, analytics, marketing: false },
    timestamp: new Date().toISOString(),
  });
}

function setDnt(value: string | undefined) {
  Object.defineProperty(window, 'doNotTrack', { value, configurable: true });
  Object.defineProperty(navigator, 'doNotTrack', { value, configurable: true });
}

function setWebdriver(value: boolean) {
  Object.defineProperty(navigator, 'webdriver', { value, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  setDnt(undefined);
  setWebdriver(false);
});

afterEach(() => {
  setDnt(undefined);
  setWebdriver(false);
  vi.restoreAllMocks();
});

describe('hasAnalyticsConsent — fails closed', () => {
  it('is false with nothing stored', () => {
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('is false when analytics is explicitly refused', () => {
    grant(false);
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('is false when the stored consent is an older version', () => {
    // The version bump is how a policy change re-asks. Honouring a stale
    // record would silently carry consent across a policy the user never saw.
    grant(true, '0.9');
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('is false when the stored value is not JSON', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'not json{');
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('is false when preferences are missing entirely', () => {
    store({ version: '1.0' });
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('is false for a truthy non-boolean analytics value', () => {
    // Strict `=== true`: a stringified "false" is truthy and must not consent.
    store({ version: '1.0', preferences: { analytics: 'false' } });
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('is false when localStorage itself throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage blocked');
    });
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('is true only for an explicit boolean grant at the current version', () => {
    grant(true);
    expect(hasAnalyticsConsent()).toBe(true);
  });
});

describe('isDoNotTrackEnabled', () => {
  it('is false when no DNT signal is present', () => {
    expect(isDoNotTrackEnabled()).toBe(false);
  });

  it.each(['1', 'yes'])('is true for doNotTrack=%s', (value) => {
    setDnt(value);
    expect(isDoNotTrackEnabled()).toBe(true);
  });

  it('is false for doNotTrack=0 (an explicit opt-in to tracking)', () => {
    setDnt('0');
    expect(isDoNotTrackEnabled()).toBe(false);
  });

  it('reads the legacy navigator.msDoNotTrack spelling', () => {
    Object.defineProperty(navigator, 'msDoNotTrack', { value: '1', configurable: true });
    expect(isDoNotTrackEnabled()).toBe(true);
    Object.defineProperty(navigator, 'msDoNotTrack', {
      value: undefined,
      configurable: true,
    });
  });
});

describe('isAutomatedClient', () => {
  it('is false for an ordinary browser', () => {
    expect(isAutomatedClient()).toBe(false);
  });

  it('is true when navigator.webdriver is set', () => {
    setWebdriver(true);
    expect(isAutomatedClient()).toBe(true);
  });
});

describe('analyticsAllowed — consent AND not-DNT AND not-automated', () => {
  it('is false without consent even when nothing else objects', () => {
    expect(analyticsAllowed()).toBe(false);
  });

  it('is false when consent is granted but DNT is on', () => {
    grant(true);
    setDnt('1');
    expect(analyticsAllowed()).toBe(false);
  });

  it('is false when consent is granted but the client is automated', () => {
    grant(true);
    setWebdriver(true);
    expect(analyticsAllowed()).toBe(false);
  });

  it('is true only when all three agree', () => {
    grant(true);
    expect(analyticsAllowed()).toBe(true);
  });
});

describe('onAnalyticsConsentChange', () => {
  it('reports the granted permission from the event detail', () => {
    const seen: boolean[] = [];
    const off = onAnalyticsConsentChange((allowed) => seen.push(allowed));

    window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { detail: { analytics: true } }));
    expect(seen).toEqual([true]);
    off();
  });

  it('reports false when the detail refuses analytics', () => {
    const seen: boolean[] = [];
    const off = onAnalyticsConsentChange((allowed) => seen.push(allowed));

    window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { detail: { analytics: false } }));
    expect(seen).toEqual([false]);
    off();
  });

  it('does NOT report true for a DNT visitor who accepted everything', () => {
    // The listener must report the effective permission, not the raw flag —
    // otherwise a consent event re-enables tracking for a DNT visitor.
    grant(true);
    setDnt('1');
    const seen: boolean[] = [];
    const off = onAnalyticsConsentChange((allowed) => seen.push(allowed));

    window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { detail: { analytics: true } }));
    expect(seen).toEqual([false]);
    off();
  });

  it('re-reads storage when the event carries no usable detail', () => {
    // This is the shape a consent *withdrawal* dispatch takes: the record is
    // already gone from storage, so re-reading is what yields false.
    const seen: boolean[] = [];
    const off = onAnalyticsConsentChange((allowed) => seen.push(allowed));

    window.dispatchEvent(new CustomEvent('cookieConsentUpdated'));
    expect(seen).toEqual([false]);

    grant(true);
    window.dispatchEvent(new CustomEvent('cookieConsentUpdated'));
    expect(seen).toEqual([false, true]);
    off();
  });

  it('stops reporting after the returned unsubscribe is called', () => {
    const seen: boolean[] = [];
    const off = onAnalyticsConsentChange((allowed) => seen.push(allowed));
    off();

    window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { detail: { analytics: true } }));
    expect(seen).toEqual([]);
  });
});
