/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CONSENT_KEY = 'queer-guide-cookie-consent';

function setConsent(analytics: boolean): void {
  localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: '1.0', preferences: { analytics } }));
}

async function loadWriter() {
  return import('../consentedAnalytics');
}

describe('trackConsentedEvent', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
    delete (window as unknown as { umami?: unknown }).umami;
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false });
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: '0' });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    delete (window as unknown as { umami?: unknown }).umami;
  });

  it('delivers immediately when consent and the tracker are ready', async () => {
    setConsent(true);
    const track = vi.fn();
    (window as unknown as { umami: unknown }).umami = { track };
    const { trackConsentedEvent } = await loadWriter();

    trackConsentedEvent('trip_created', { source: 'dialog' });

    expect(track).toHaveBeenCalledWith('trip_created', { source: 'dialog' });
  });

  it('queues consented events and flushes them in order when Umami is ready', async () => {
    setConsent(true);
    const { ANALYTICS_READY_EVENT, trackConsentedEvent } = await loadWriter();
    trackConsentedEvent('first', { n: '1' });
    trackConsentedEvent('second', { n: '2' });

    const track = vi.fn();
    (window as unknown as { umami: unknown }).umami = { track };
    window.dispatchEvent(new Event(ANALYTICS_READY_EVENT));

    expect(track.mock.calls).toEqual([
      ['first', { n: '1' }],
      ['second', { n: '2' }],
    ]);
  });

  it('never queues an event without effective analytics permission', async () => {
    const { ANALYTICS_READY_EVENT, trackConsentedEvent } = await loadWriter();
    trackConsentedEvent('before_consent', {});
    setConsent(true);

    const track = vi.fn();
    (window as unknown as { umami: unknown }).umami = { track };
    window.dispatchEvent(new Event(ANALYTICS_READY_EVENT));

    expect(track).not.toHaveBeenCalled();
  });

  it.each([
    ['Do Not Track', 'doNotTrack'],
    ['browser automation', 'webdriver'],
  ])('never queues an event for %s', async (_label, property) => {
    setConsent(true);
    Object.defineProperty(navigator, property, {
      configurable: true,
      value: property === 'webdriver' ? true : '1',
    });
    const { ANALYTICS_READY_EVENT, trackConsentedEvent } = await loadWriter();
    trackConsentedEvent('blocked', {});
    Object.defineProperty(navigator, property, {
      configurable: true,
      value: property === 'webdriver' ? false : '0',
    });

    const track = vi.fn();
    (window as unknown as { umami: unknown }).umami = { track };
    window.dispatchEvent(new Event(ANALYTICS_READY_EVENT));

    expect(track).not.toHaveBeenCalled();
  });

  it('clears queued events when consent is withdrawn', async () => {
    setConsent(true);
    const { ANALYTICS_READY_EVENT, trackConsentedEvent } = await loadWriter();
    trackConsentedEvent('queued', {});
    setConsent(false);
    window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { detail: { analytics: false } }));
    setConsent(true);

    const track = vi.fn();
    (window as unknown as { umami: unknown }).umami = { track };
    window.dispatchEvent(new Event(ANALYTICS_READY_EVENT));

    expect(track).not.toHaveBeenCalled();
  });

  it('expires queued events when the tracker stays unavailable', async () => {
    setConsent(true);
    const { ANALYTICS_READY_EVENT, trackConsentedEvent } = await loadWriter();
    trackConsentedEvent('stale', {});
    vi.advanceTimersByTime(30_001);

    const track = vi.fn();
    (window as unknown as { umami: unknown }).umami = { track };
    window.dispatchEvent(new Event(ANALYTICS_READY_EVENT));

    expect(track).not.toHaveBeenCalled();
  });

  it('bounds the queue and retains the newest consented events', async () => {
    setConsent(true);
    const { ANALYTICS_READY_EVENT, trackConsentedEvent } = await loadWriter();
    for (let i = 0; i < 105; i += 1) trackConsentedEvent(`event_${i}`, {});

    const track = vi.fn();
    (window as unknown as { umami: unknown }).umami = { track };
    window.dispatchEvent(new Event(ANALYTICS_READY_EVENT));

    expect(track).toHaveBeenCalledTimes(100);
    expect(track.mock.calls[0][0]).toBe('event_5');
    expect(track.mock.calls.at(-1)?.[0]).toBe('event_104');
  });
});
