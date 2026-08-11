import { describe, it, expect, vi, beforeAll } from 'vitest';
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

/** Design tokens the map is allowed to paint with, as `--var: "h s% l%"`. */
const TOKEN_CHANNELS = new Map(COLOR_TOKENS.map((t) => [t.key, t.light]));

/** jsdom has no stylesheet, so `getComputedStyle` returns '' for every custom
 *  property. Serve the catalog's values instead — which also means this test
 *  fails if a map colour resolves a token that the catalog does not define. */
beforeAll(() => {
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () =>
      ({
        getPropertyValue: (name: string) => TOKEN_CHANNELS.get(name.replace(/^--/, '')) ?? '',
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

describe('map palette', () => {
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
    const inkValue = `hsl(${TOKEN_CHANNELS.get('foreground')})`;
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
    const destructive = `hsl(${TOKEN_CHANNELS.get('destructive')})`;
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
