import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attemptedAssetUrls,
  documentAssetUrls,
  failedAssetUrls,
  healAssetUrls,
  healBootAssets,
  healFailedAssets,
} from '@/utils/assetHeal';

const ORIGIN = window.location.origin;

type FakeEntry = {
  name: string;
  initiatorType?: string;
  responseStatus?: number;
  transferSize?: number;
  decodedBodySize?: number;
};

function stubResourceEntries(entries: FakeEntry[]) {
  return vi
    .spyOn(performance, 'getEntriesByType')
    .mockReturnValue(entries as unknown as PerformanceEntryList);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.head.querySelectorAll('script, link').forEach((el) => el.remove());
});

describe('documentAssetUrls', () => {
  it('collects own-origin /assets/ scripts, modulepreloads and stylesheets only', () => {
    document.head.innerHTML = `
      <script src="/assets/js/index-abc.js"></script>
      <link rel="modulepreload" href="/assets/js/vendor-def.js">
      <link rel="stylesheet" href="/assets/css/index-ghi.css">
      <link rel="stylesheet" href="/other/style.css">
      <link rel="preload" href="/fonts/inter.woff2">
    `;
    const external = document.createElement('script');
    external.src = 'https://third.party/widget.js';
    document.head.appendChild(external);

    expect(documentAssetUrls().sort()).toEqual([
      `${ORIGIN}/assets/css/index-ghi.css`,
      `${ORIGIN}/assets/js/index-abc.js`,
      `${ORIGIN}/assets/js/vendor-def.js`,
    ]);
  });
});

describe('attemptedAssetUrls', () => {
  it('returns only own-origin /assets/ resource entries', () => {
    stubResourceEntries([
      { name: `${ORIGIN}/assets/js/useTrips-x.js` },
      { name: `${ORIGIN}/fonts/inter.woff2` },
      { name: 'https://api.supabase.co/rest/v1/venues' },
    ]);
    expect(attemptedAssetUrls()).toEqual([`${ORIGIN}/assets/js/useTrips-x.js`]);
  });
});

describe('failedAssetUrls', () => {
  it('flags error statuses and empty completed transfers, not healthy loads', () => {
    stubResourceEntries([
      // Chromium exposes the status: a cached/synthesized 404 — the incident shape.
      { name: `${ORIGIN}/assets/js/tripPhase-a.js`, responseStatus: 404, transferSize: 0, decodedBodySize: 0 },
      { name: `${ORIGIN}/assets/js/router-b.js`, responseStatus: 200, transferSize: 0, decodedBodySize: 4000 },
      // No responseStatus (Safari): empty body is the only failure signal.
      { name: `${ORIGIN}/assets/js/currency-c.js`, transferSize: 0, decodedBodySize: 0 },
      { name: `${ORIGIN}/assets/js/avatar-d.js`, transferSize: 0, decodedBodySize: 812 },
      // Failed but not ours.
      { name: 'https://third.party/x.js', responseStatus: 404, transferSize: 0, decodedBodySize: 0 },
    ]);
    expect(failedAssetUrls()).toEqual([
      `${ORIGIN}/assets/js/tripPhase-a.js`,
      `${ORIGIN}/assets/js/currency-c.js`,
    ]);
  });

  it('ignores non-critical initiators (aborted images cannot blank the app)', () => {
    stubResourceEntries([
      { name: `${ORIGIN}/assets/img/hero-x.webp`, initiatorType: 'img', transferSize: 0, decodedBodySize: 0 },
      { name: `${ORIGIN}/assets/js/chunk-y.js`, initiatorType: 'script', responseStatus: 404, transferSize: 0, decodedBodySize: 0 },
    ]);
    expect(failedAssetUrls()).toEqual([`${ORIGIN}/assets/js/chunk-y.js`]);
  });
});

describe('healBootAssets', () => {
  it('puts event-derived and failed URLs ahead of document URLs (cap keeps the head)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    document.head.innerHTML = '<link rel="modulepreload" href="/assets/js/vendor-doc.js">';
    stubResourceEntries([
      { name: `${ORIGIN}/assets/js/lazy-failed.js`, responseStatus: 404, transferSize: 0, decodedBodySize: 0 },
    ]);

    await healBootAssets([`${ORIGIN}/assets/js/from-event.js`, 'https://evil.example/assets/x.js']);

    const calls = fetchMock.mock.calls.map((c) => c[0]);
    expect(calls[0]).toBe(`${ORIGIN}/assets/js/from-event.js`);
    expect(calls[1]).toBe(`${ORIGIN}/assets/js/lazy-failed.js`);
    expect(calls).toContain(`${ORIGIN}/assets/js/vendor-doc.js`);
    expect(calls).not.toContain('https://evil.example/assets/x.js');
  });
});

describe('healFailedAssets', () => {
  it('never re-heals a URL twice in one document lifetime', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const url = `${ORIGIN}/assets/js/once-only.js`;
    stubResourceEntries([
      { name: url, responseStatus: 404, transferSize: 0, decodedBodySize: 0 },
    ]);

    await healFailedAssets();
    await healFailedAssets();

    expect(fetchMock.mock.calls.filter((c) => c[0] === url)).toHaveLength(1);
  });
});

describe('healAssetUrls', () => {
  it('re-fetches each unique URL with cache:reload and resolves despite rejections', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('ok'))
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    const a = `${ORIGIN}/assets/js/index-a.js`;
    const b = `${ORIGIN}/assets/js/router-b.js`;
    await healAssetUrls([a, b, a]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(a, { cache: 'reload' });
    expect(fetchMock).toHaveBeenCalledWith(b, { cache: 'reload' });
  });

  it('resolves immediately with nothing to heal', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await healAssetUrls([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves via the hard timeout when a fetch never settles', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    let settled = false;
    const healed = healAssetUrls([`${ORIGIN}/assets/js/index-a.js`]).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(3999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await healed;
    expect(settled).toBe(true);
  });
});
