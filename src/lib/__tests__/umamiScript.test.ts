import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUPPORTED_LOCALES } from '@/i18n/languages';

/**
 * `public/umami.js` is the ONE page-view pipeline. It ships unbuilt out of
 * public/ (and is excluded from Pages Functions in public/_routes.json), so
 * nothing in the normal test tree imports it and nothing type-checks it. This
 * suite loads the real file and drives it in jsdom.
 *
 * Every case here corresponds to a defect measured on prod 2026-09-12; see the
 * file's own header and src/components/layout/LayoutShell.tsx.
 */

const SCRIPT_PATH = resolve(__dirname, '../../../public/umami.js');
const source = readFileSync(SCRIPT_PATH, 'utf8');

let fetchMock: ReturnType<typeof vi.fn>;

// Raw prototype references, captured once. The identity assertions below
// compare against these, so they must not be re-bound per test — a fresh
// `.bind()` is a different function object and would make "history is
// untouched" unfalsifiable in one direction and unprovable in the other.
const nativePushState = History.prototype.pushState;
const nativeReplaceState = History.prototype.replaceState;

/** Navigate without going through whatever the tracker may have patched. */
function go(url: string) {
  nativeReplaceState.call(history, {}, '', url);
}

function loadTracker() {
   
  new Function(source)();
}

function beacons() {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url,
    body: JSON.parse((init as RequestInit).body as string) as Record<string, unknown>,
  }));
}

function setFlag(target: object, key: string, value: unknown) {
  Object.defineProperty(target, key, { value, configurable: true });
}

beforeEach(() => {
  history.pushState = nativePushState;
  history.replaceState = nativeReplaceState;
  go('/');
  fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
  setFlag(window, 'doNotTrack', undefined);
  setFlag(navigator, 'doNotTrack', undefined);
  setFlag(navigator, 'webdriver', false);
  delete (window as { umami?: unknown }).umami;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  history.pushState = nativePushState;
  history.replaceState = nativeReplaceState;
  delete (window as { umami?: unknown }).umami;
});

describe('public/umami.js — who it refuses to track', () => {
  it('sends nothing when Do Not Track is on', () => {
    setFlag(navigator, 'doNotTrack', '1');
    loadTracker();
    vi.advanceTimersByTime(1000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the client is automated (navigator.webdriver)', () => {
    // Playwright/Puppeteer/Lighthouse set this on themselves. Our own e2e and
    // Lighthouse runs must not land in the traffic numbers.
    setFlag(navigator, 'webdriver', true);
    loadTracker();
    vi.advanceTimersByTime(1000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves history untouched when it refuses to track', () => {
    setFlag(navigator, 'doNotTrack', '1');
    loadTracker();
    expect(history.pushState).toBe(nativePushState);
  });
});

describe('public/umami.js — one navigation, one beacon', () => {
  it('records the initial page view', () => {
    loadTracker();
    vi.advanceTimersByTime(400);
    expect(beacons()).toHaveLength(1);
    expect(beacons()[0].url).toBe('/api/track');
  });

  it('never patches history.replaceState', () => {
    // A replaceState in this app is a component writing UI state back to the
    // URL — the editorial scroll-spy issues one every 300ms while a reader
    // scrolls. Patching it made /travel alone 268,313 views in 30 days.
    loadTracker();
    expect(history.replaceState).toBe(nativeReplaceState);
    expect(history.pushState).not.toBe(nativePushState);
  });

  it('does not count a replaceState as a page view', () => {
    loadTracker();
    vi.advanceTimersByTime(400);
    fetchMock.mockClear();

    history.replaceState({}, '', '/travel?section=stay');
    history.replaceState({}, '', '/travel');
    vi.advanceTimersByTime(1000);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('collapses two pushStates to the same URL into one beacon', () => {
    loadTracker();
    vi.advanceTimersByTime(400);
    fetchMock.mockClear();

    history.pushState({}, '', '/venues');
    vi.advanceTimersByTime(400);
    history.pushState({}, '', '/venues');
    vi.advanceTimersByTime(400);

    expect(beacons()).toHaveLength(1);
    expect(beacons()[0].body.url).toBe('/venues');
  });

  it('still records a genuine navigation to a different page', () => {
    loadTracker();
    vi.advanceTimersByTime(400);
    fetchMock.mockClear();

    history.pushState({}, '', '/venues');
    vi.advanceTimersByTime(400);
    history.pushState({}, '', '/events');
    vi.advanceTimersByTime(400);

    expect(beacons().map((b) => b.body.url)).toEqual(['/venues', '/events']);
  });
});

describe('public/umami.js — URL normalization', () => {
  it.each(SUPPORTED_LOCALES.filter((l) => l !== 'en'))('strips the /%s locale prefix', (locale) => {
    go(`/${locale}/travel`);
    loadTracker();
    vi.advanceTimersByTime(400);
    expect(beacons()[0].body.url).toBe('/travel');
  });

  it('reduces a bare locale root to /', () => {
    go('/de');
    loadTracker();
    vi.advanceTimersByTime(400);
    expect(beacons()[0].body.url).toBe('/');
  });

  it('does NOT strip a two-letter path segment that is not a locale', () => {
    // stripLocale() in src/lib/locale.ts uses /^\/(?:[a-z]{2}\/)?/, which would
    // rewrite /go/:slug to /:slug and merge unrelated pages. The tracker
    // enumerates the real locales instead — this is the case that proves it.
    go('/go/berlin-pride');
    loadTracker();
    vi.advanceTimersByTime(400);
    expect(beacons()[0].body.url).toBe('/go/berlin-pride');
  });

  it('drops ?section= and ?preview= but keeps real query params', () => {
    go('/travel?section=stay&q=berlin&preview=1');
    loadTracker();
    vi.advanceTimersByTime(400);
    expect(beacons()[0].body.url).toBe('/travel?q=berlin');
  });

  it('treats two ?section= values of one page as the same page view', () => {
    go('/travel');
    loadTracker();
    vi.advanceTimersByTime(400);
    fetchMock.mockClear();

    history.pushState({}, '', '/travel?section=stay');
    vi.advanceTimersByTime(400);
    history.pushState({}, '', '/travel?section=eat');
    vi.advanceTimersByTime(400);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('public/umami.js — custom events', () => {
  it('exposes window.umami.track and does not dedupe named events', () => {
    loadTracker();
    vi.advanceTimersByTime(400);
    fetchMock.mockClear();

    (window as unknown as { umami: { track: (n: string, d?: unknown) => void } }).umami.track(
      'travel_deal_click',
      { id: 1 },
    );
    (window as unknown as { umami: { track: (n: string, d?: unknown) => void } }).umami.track(
      'travel_deal_click',
      { id: 2 },
    );

    const sent = beacons();
    expect(sent).toHaveLength(2);
    expect(sent[0].body.name).toBe('travel_deal_click');
  });

  it('refuses custom events under Do Not Track too', () => {
    loadTracker();
    vi.advanceTimersByTime(400);
    fetchMock.mockClear();
    setFlag(navigator, 'doNotTrack', '1');

    (window as unknown as { umami: { track: (n: string) => void } }).umami.track('x');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('public/umami.js — locale list drift', () => {
  it('enumerates exactly the locales the router supports', () => {
    const match = source.match(/var LOCALE_RE = \/\^\\\/\(\?:([^)]+)\)/);
    expect(match, 'LOCALE_RE not found in public/umami.js').toBeTruthy();
    expect(new Set(match![1].split('|'))).toEqual(new Set(SUPPORTED_LOCALES));
  });
});
