import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * These exercise the REAL detection path: a cross-origin fetch probe.
 *
 * An earlier version of this suite drove a hand-written `map.on('error')`
 * event and passed — while the feature was completely inert, because
 * maplibre-gl v6 does not emit `error` for tile HTTP failures at all (verified
 * in a browser against a tile URL returning 429: zero error events). Mocking
 * `fetch` here keeps the tests pointed at the mechanism that actually runs.
 */

const PRIMARY = 'https://primary.example/planet/{z}/{x}/{y}.mvt';
const FALLBACK = 'https://fallback.example/planet/{z}/{x}/{y}.mvt';

function mockConfig(fallback: string | undefined) {
  vi.doMock('@/config/mapStyle', () => ({
    BASEMAP_SOURCE_ID: 'protomaps',
    TILE_URL: PRIMARY,
    FALLBACK_TILE_URL: fallback,
  }));
}

/**
 * Minimal stand-in for the bits of maplibregl.Map this module touches.
 *
 * `sourceReady: false` models the pre-style-load window, where getSource()
 * returns undefined. `isStyleLoaded` is deliberately hardwired to a LIE
 * (always false) — the real thing reports false while sources are still
 * loading, which with failing tiles can be forever, and an earlier version of
 * this module gated on it and consequently never fired.
 */
function makeMap(opts: { sourceReady?: boolean; source?: unknown } = {}) {
  const { sourceReady = true } = opts;
  const setTiles = vi.fn();
  const realSource = 'source' in opts ? opts.source : { setTiles };
  let ready = sourceReady;
  const once: Record<string, (() => void)[]> = {};
  return {
    setTiles,
    makeSourceReady: () => {
      ready = true;
    },
    fireLoad: () => (once.load ?? []).forEach((f) => f()),
    map: {
      isStyleLoaded: () => false,
      once: (ev: string, fn: () => void) => {
        (once[ev] ??= []).push(fn);
      },
      getSource: () => (ready ? realSource : undefined),
    } as never,
  };
}

/** Let the probe promise + its .then settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('installBasemapFallback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.doUnmock('@/config/mapStyle');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does nothing, and never probes, when no fallback is configured', async () => {
    mockConfig(undefined);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { installBasemapFallback } = await import('../basemapFallback');
    const h = makeMap();

    installBasemapFallback(h.map);
    await flush();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(h.setTiles).not.toHaveBeenCalled();
  });

  it('probes z0/0/0 of the primary, not the {z}/{x}/{y} template', async () => {
    mockConfig(FALLBACK);
    const fetchSpy = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal('fetch', fetchSpy);
    const { installBasemapFallback } = await import('../basemapFallback');

    installBasemapFallback(makeMap().map);
    await flush();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://primary.example/planet/0/0/0.mvt',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('leaves a healthy primary alone', async () => {
    mockConfig(FALLBACK);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 }));
    const { installBasemapFallback } = await import('../basemapFallback');
    const h = makeMap();

    installBasemapFallback(h.map);
    await flush();

    expect(h.setTiles).not.toHaveBeenCalled();
  });

  it('fails over when the probe THROWS — the real 429 signal, which has no CORS headers', async () => {
    mockConfig(FALLBACK);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { installBasemapFallback } = await import('../basemapFallback');
    const h = makeMap();

    installBasemapFallback(h.map);
    await flush();

    expect(h.setTiles).toHaveBeenCalledWith([FALLBACK]);
  });

  it('marks the document so the degraded state is visible in PRODUCTION', async () => {
    // Production drops every console.* (vite.config.ts esbuild.drop), so the
    // warning is dev-only and the attribute is the sole prod-visible signal.
    delete document.documentElement.dataset.basemapFallback;
    mockConfig(FALLBACK);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')));
    const { installBasemapFallback } = await import('../basemapFallback');

    installBasemapFallback(makeMap().map);
    await flush();

    expect(document.documentElement.dataset.basemapFallback).toBe('active');
  });

  it('does NOT mark the document when the primary is healthy', async () => {
    delete document.documentElement.dataset.basemapFallback;
    mockConfig(FALLBACK);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 }));
    const { installBasemapFallback } = await import('../basemapFallback');

    installBasemapFallback(makeMap().map);
    await flush();

    expect(document.documentElement.dataset.basemapFallback).toBeUndefined();
  });

  it('fails over on a readable 429/5xx/401/403 but not on 200/404/400', async () => {
    for (const [status, expected] of [
      [429, true],
      [500, true],
      [503, true],
      [401, true],
      [403, true],
      [200, false],
      [404, false], // sparse planet builds legitimately 404
      [400, false],
    ] as const) {
      vi.resetModules();
      mockConfig(FALLBACK);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status }));
      const { installBasemapFallback } = await import('../basemapFallback');
      const h = makeMap();

      installBasemapFallback(h.map);
      await flush();

      expect(h.setTiles.mock.calls.length > 0, `status ${status}`).toBe(expected);
    }
  });

  it('swaps immediately when the source already exists, even though isStyleLoaded() is false', async () => {
    // REGRESSION. The first version gated on isStyleLoaded() and otherwise
    // registered once('load'). Because the probe is async, `load` had usually
    // already fired by then, so that handler never ran — and isStyleLoaded()
    // stays false while sources are loading, which failing tiles make
    // permanent. Net effect: the fallback never fired at all in a real browser
    // despite every unit test passing. Gate on the source, not the style.
    mockConfig(FALLBACK);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')));
    const { installBasemapFallback } = await import('../basemapFallback');
    const h = makeMap({ sourceReady: true }); // isStyleLoaded() lies: false

    installBasemapFallback(h.map);
    await flush();

    // Must NOT have waited for a 'load' that already happened.
    expect(h.setTiles).toHaveBeenCalledWith([FALLBACK]);
  });

  it('defers to load only when the source genuinely is not there yet', async () => {
    mockConfig(FALLBACK);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')));
    const { installBasemapFallback } = await import('../basemapFallback');
    const h = makeMap({ sourceReady: false });

    installBasemapFallback(h.map);
    await flush();
    expect(h.setTiles).not.toHaveBeenCalled(); // deferred, not dropped

    h.makeSourceReady();
    h.fireLoad();
    expect(h.setTiles).toHaveBeenCalledWith([FALLBACK]);
  });

  it('probes once even across several map instances', async () => {
    mockConfig(FALLBACK);
    const fetchSpy = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal('fetch', fetchSpy);
    const { installBasemapFallback } = await import('../basemapFallback');

    installBasemapFallback(makeMap().map);
    installBasemapFallback(makeMap().map);
    installBasemapFallback(makeMap().map);
    await flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not touch a map that was disposed before the probe resolved', async () => {
    mockConfig(FALLBACK);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')));
    const { installBasemapFallback } = await import('../basemapFallback');
    const h = makeMap();

    const dispose = installBasemapFallback(h.map);
    dispose();
    await flush();

    expect(h.setTiles).not.toHaveBeenCalled();
  });

  it('survives a source that cannot setTiles instead of throwing at the map', async () => {
    mockConfig(FALLBACK);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')));
    const { installBasemapFallback } = await import('../basemapFallback');
    const h = makeMap({ source: {} });

    installBasemapFallback(h.map);
    await expect(flush()).resolves.not.toThrow();
  });
});
