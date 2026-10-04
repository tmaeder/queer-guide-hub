import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { COLOR_TOKENS } from '@/components/admin/design/tokenCatalog';
import { ROUTE_BULLET_MAP } from '@/components/transit/routeBulletMap';
import { AREA_LAYERS, LAYER_DEFS } from '@/config/mapLayers';

/**
 * The map's colour gate.
 *
 * There is no other one. The canvas is a `<canvas>`, so the e2e "sanctioned
 * ink" sweep — which walks DOM backgrounds looking for unapproved hues —
 * physically cannot see a single pixel the basemap, the pins or the cluster
 * donuts draw. Until this file existed, `LAYER_COLORS` sat on Tailwind's stock
 * indigo/pink/blue/red/emerald/amber for months with every check green, and
 * `src/components/map/**` was in the ESLint ignore list for both design blocks
 * on top of that.
 *
 * These assertions are cheap arithmetic over the token catalog, so they run in
 * the required `test` job rather than a path-filtered browser sweep.
 */

type Mode = 'light' | 'dark';

/** Design tokens the map is allowed to paint with, as `--var: "h s% l%"`.
 *
 *  Both modes, and that is load-bearing. Until 2026-10-03 this was a single map
 *  seeded from `t.light`, so every assertion below silently evaluated light
 *  values and **dark-mode map colour was entirely unguarded** — a track that
 *  drifted only in `.dark`, or a layer that picked up dark `--destructive`
 *  (`0 80% 66%`, a different string from the light `0 70% 38%` the old single
 *  map compared against), passed. Dark mode is live: `.dark` is at
 *  src/index.css:638 and `ThemeProvider` adds the class on a flip. */
const CHANNELS: Record<Mode, Map<string, string>> = {
  light: new Map(COLOR_TOKENS.map((t) => [t.key, t.light])),
  dark: new Map(COLOR_TOKENS.map((t) => [t.key, t.dark])),
};

let mode: Mode = 'light';
const channel = (key: string): string => CHANNELS[mode].get(key) ?? '';

/** jsdom has no stylesheet, so `getComputedStyle` returns '' for every custom
 *  property. Serve the catalog's values instead — which also means this test
 *  fails if a map colour resolves a token that the catalog does not define.
 *
 *  Reads `mode` through the closure rather than capturing a map, so flipping it
 *  in a `beforeEach` re-points every colour the map resolves afterwards.
 *  `mapTokens`' helpers are functions that call `getComputedStyle` per access
 *  (they must be, for `/admin/design` runtime overrides), so no module reset is
 *  needed to make `LAYER_COLORS` follow the mode. */
beforeAll(() => {
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () =>
      ({
        getPropertyValue: (name: string) => channel(name.replace(/^--/, '')),
      }) as unknown as CSSStyleDeclaration,
  );
});

/**
 * Chroma as RGB channel spread (0–1).
 *
 * Deliberately NOT the HSL saturation number: paper is `60 33% 97%`, which
 * reads as 33% "saturated" while actually being #FAFAF5 — a 2% spread, i.e.
 * white with a warm cast. Saturation is meaningless at the top of the
 * lightness range, so measuring it there flags the entire basemap.
 */
const chromaOf = (hsl: string): number => {
  const m = hsl.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!m) return 0;
  const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const [r, g, b] = (
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  ) as [number, number, number];
  return Math.max(r, g, b) - Math.min(r, g, b);
};

describe.each(['light', 'dark'] as const)('map palette (%s mode)', (m) => {
  beforeEach(() => {
    mode = m;
    // `getMapStyle()` memoises, so this stops the dark run re-inspecting a
    // style object built under light tokens.
    //
    // MEASURED, not load-bearing: dropping this reset leaves the suite green,
    // because the only assertion here that reads the style ("no chromatic
    // value") holds in BOTH modes, so it cannot tell the two apart. The reset
    // that does bite is the one inside `builds a different basemap per mode`.
    // Kept anyway — it costs nothing and it is what would keep a future
    // style-COMPARING assertion in this block from being vacuous.
    //
    // It is also not what guards `styleCache`'s invalidation. That cache keys
    // on `documentElement`'s `dark` class, which this fixture never moves, so
    // both modes resolve the same slot either way; the `map style cache`
    // block at the bottom of this file is the one that moves the class.
    vi.resetModules();
  });

  it('paints every layer with a catalogued token, never a literal', async () => {
    const { LAYER_COLORS } = await import('@/hooks/useExploreMapData');
    for (const { type } of LAYER_DEFS) {
      const color = LAYER_COLORS[type];
      expect(color, `${type} resolved to nothing — token missing from the catalog`).toMatch(
        /^hsl\(/,
      );
      expect(color, `${type} still holds a literal`).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  it('gives the four point layers four DIFFERENT tracks', async () => {
    const { LAYER_COLORS } = await import('@/hooks/useExploreMapData');
    const pointLayers = LAYER_DEFS.map((d) => d.type).filter((t) => !AREA_LAYERS.includes(t));
    // venues / events / hotels / restrooms — the whole reason `hotel` moved
    // blue → yellow in ROUTE_BULLET_MAP. Two pin types sharing a hue is
    // indistinguishable on a canvas, where there is no letter to fall back on.
    expect(pointLayers).toHaveLength(4);
    const hues = pointLayers.map((t) => LAYER_COLORS[t]);
    expect(new Set(hues).size).toBe(4);
  });

  it('keeps area layers off the tracks entirely', async () => {
    const { LAYER_COLORS } = await import('@/hooks/useExploreMapData');
    const inkValue = `hsl(${channel('foreground')})`;
    for (const layer of AREA_LAYERS) {
      expect(LAYER_COLORS[layer], `${layer} should be ink, not a track`).toBe(inkValue);
    }
  });

  it('derives its colours from ROUTE_BULLET_MAP rather than a second table', async () => {
    const { LAYER_COLORS } = await import('@/hooks/useExploreMapData');
    const { trackColor } = await import('@/lib/mapTokens');
    // If someone re-introduces a map-local palette, these stop agreeing.
    expect(LAYER_COLORS.venues).toBe(trackColor(ROUTE_BULLET_MAP.venue.track));
    expect(LAYER_COLORS.events).toBe(trackColor(ROUTE_BULLET_MAP.event.track));
    expect(LAYER_COLORS.hotels).toBe(trackColor(ROUTE_BULLET_MAP.hotel.track));
    expect(LAYER_COLORS.restrooms).toBe(trackColor(ROUTE_BULLET_MAP.restroom.track));
  });

  it('never puts the destructive hue on a layer', async () => {
    const { LAYER_COLORS } = await import('@/hooks/useExploreMapData');
    // `countries` was `#dc2626` — the danger red, on a layer that carries no
    // danger meaning. Track colours never encode risk (CLAUDE.md, design).
    const destructive = `hsl(${channel('destructive')})`;
    for (const { type } of LAYER_DEFS) {
      expect(LAYER_COLORS[type]).not.toBe(destructive);
    }
  });

  it('builds a basemap with no chromatic value in it', async () => {
    const { getMapStyle } = await import('@/config/mapStyle');
    const style = getMapStyle();
    const layers = style.layers as unknown as Record<string, unknown>[];
    expect(layers.length).toBeGreaterThan(20);

    // Walk every paint value the flavor produced. Stock Protomaps `light` puts
    // blue water, green landcover and orange motorway shields under our pins;
    // paper/ink means the four tracks are the only hues on the canvas.
    const offenders: string[] = [];
    const walk = (node: unknown, layerId: string) => {
      if (typeof node === 'string') {
        if (node.startsWith('hsl(') && chromaOf(node) > 0.1) offenders.push(`${layerId}: ${node}`);
        if (/#[0-9a-f]{3,8}\b/i.test(node) || node.startsWith('rgb')) {
          offenders.push(`${layerId}: ${node}`);
        }
        return;
      }
      if (Array.isArray(node)) return node.forEach((n) => walk(n, layerId));
      if (node && typeof node === 'object') {
        return Object.values(node).forEach((n) => walk(n, layerId));
      }
    };
    for (const layer of layers) walk(layer.paint, String(layer.id));
    expect(offenders).toEqual([]);
  });
});

/**
 * Cross-mode invariants.
 *
 * The suite above now runs twice, which only means something if the two token
 * sets actually differ — hence the control first. These read the catalog
 * directly rather than through the map, because they are assertions about the
 * palette's own shape: a track colour is IDENTITY and must not flip, while ink
 * and paper must.
 */
describe('map palette across modes', () => {
  const TRACKS = ['track-pink', 'track-blue', 'track-green', 'track-yellow'] as const;

  it('has a non-degenerate dark fixture', () => {
    // THE POSITIVE CONTROL. If dark resolved the same channels as light, every
    // "identical" assertion below would pass trivially and the whole dark run
    // of the suite above would be a silent duplicate of the light one.
    //
    // Asserted over CHANNELS, not COLOR_TOKENS, and that distinction is the
    // point: CHANNELS is what the mode-parameterised suite actually reads, so
    // a fixture built with the wrong field (`t.light` twice) is the real
    // failure mode. A catalog-level check passes straight through that — which
    // is how the first draft of this control was itself vacuous.
    const differing = [...CHANNELS.light].filter(([k, v]) => CHANNELS.dark.get(k) !== v);
    expect(
      differing.length,
      'the dark fixture resolves light channels — the dark run measures nothing',
    ).toBeGreaterThan(10);
  });

  it('keeps every track channel identical in both modes', () => {
    // A track colour is brand identity, not a theme value: `--track-ring` takes
    // the ink role instead so type on a track fill never inverts. Flipping a
    // track in `.dark` would make the same line two different colours.
    for (const key of TRACKS) {
      const t = COLOR_TOKENS.find((c) => c.key === key);
      expect(t, `${key} missing from the token catalog`).toBeDefined();
      expect(t!.dark, `${key} differs between modes — tracks are identity, not theme`).toBe(
        t!.light,
      );
    }
  });

  it('marks exactly the four tracks as fill-only', () => {
    // `ink: true` is the flag that enrols a colour in the fill-only ban and the
    // >25° distance check against --destructive. A fifth member means a new
    // chromatic token arrived without a decision.
    expect(
      COLOR_TOKENS.filter((t) => t.ink)
        .map((t) => t.key)
        .sort(),
    ).toEqual([...TRACKS].sort());
  });

  it('swaps ink and paper between modes', () => {
    const fg = COLOR_TOKENS.find((t) => t.key === 'foreground')!;
    const bg = COLOR_TOKENS.find((t) => t.key === 'background')!;
    // An exact swap, not merely "different": dark paper IS light ink.
    expect(fg.dark).toBe(bg.light);
    expect(bg.dark).toBe(fg.light);
  });

  it('builds a different basemap per mode', async () => {
    // The map-level consequence of the swap, and the assertion the old
    // light-only fixture could not make at all. Needs the module reset for the
    // same cache-slot reason as above.
    const paperOf = async (m: Mode) => {
      mode = m;
      vi.resetModules();
      const { getMapStyle } = await import('@/config/mapStyle');
      const style = getMapStyle() as unknown as { layers: Record<string, unknown>[] };
      const bg = style.layers.find((l) => l.id === 'background');
      return JSON.stringify(bg?.paint ?? {});
    };
    const light = await paperOf('light');
    const dark = await paperOf('dark');
    expect(light).not.toBe('{}');
    expect(
      dark,
      'basemap paper is the same in both modes — tokens did not reach the style',
    ).not.toBe(light);
    mode = 'light';
  });
});

/**
 * The cache-invalidation half, which the per-mode suite above cannot reach.
 *
 * `styleCache` was ONE slot, assigned at the first map mount and never
 * invalidated, so the basemap froze in whichever theme happened to be active
 * then — light paper under dark chrome, on all 14 `getMapStyle()` call sites.
 *
 * Two things make this its own `describe` rather than another case up there.
 * It must move `documentElement`'s `dark` class, which is what the cache keys
 * on and what the mocked-`mode` fixture never touches. And it must run with
 * **no `vi.resetModules()` between the two calls** — a reset drops the cache
 * and makes the assertion pass against the defect, which is exactly how this
 * hole stayed open while a both-modes suite sat right above it.
 */
describe('map style cache', () => {
  const paperOf = (style: unknown): string => {
    const layers = (style as { layers: Record<string, unknown>[] }).layers;
    const bg = layers.find((l) => l.id === 'background');
    expect(bg, 'no `background` layer — the flavor shape moved').toBeTruthy();
    return (bg!.paint as Record<string, string>)['background-color'];
  };

  const setRootMode = (m: Mode) => {
    mode = m;
    document.documentElement.classList.toggle('dark', m === 'dark');
  };

  // A root left in `dark` would silently re-point every later test's cache
  // slot, so the flip is always undone.
  afterEach(() => setRootMode('light'));

  it('re-resolves paper when the theme flips, with no module reset', async () => {
    vi.resetModules();
    const { getMapStyle } = await import('@/config/mapStyle');

    setRootMode('light');
    const light = paperOf(getMapStyle());
    setRootMode('dark');
    const dark = paperOf(getMapStyle());

    expect(light).toBe(`hsl(${CHANNELS.light.get('background')})`);
    expect(dark).toBe(`hsl(${CHANNELS.dark.get('background')})`);
    // Stated separately: the two could agree only if the catalog stopped
    // swapping paper, in which case the swap assertion above is the thing to
    // re-read rather than this one.
    expect(dark).not.toBe(light);
  });
});
