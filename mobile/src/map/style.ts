import { layers, type Flavor } from '@protomaps/basemaps';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { dark, light, type TokenName } from '@/theme/tokens';

/**
 * The native basemap: the web's paper-and-ink Protomaps style
 * (src/config/mapStyle.ts), ported as a PURE function of the palette.
 *
 * The web resolves CSS custom properties at runtime; there is no DOM here, so
 * the same flavor is computed from `src/theme/tokens.ts` instead. Values are
 * emitted in comma `hsl()`/`hsla()` syntax, which MapLibre Native's colour
 * parser accepts (the CSS4 space syntax the web emits is not guaranteed to be).
 *
 * Tiles: the same PMTiles Worker the web uses. A drift test asserts the URL
 * matches `TILE_URL` in src/config/mapStyle.ts.
 */
export const TILE_URL =
  'https://protomaps-tiles.maeder-tobiassimon.workers.dev/planet/{z}/{x}/{y}.mvt';

export const BASEMAP_SOURCE_ID = 'protomaps';
const ASSETS_BASE = 'https://protomaps.github.io/basemaps-assets';

/** Noto until the brand-glyph mirror exists (same rule as the web). */
export const MAP_FONT_REGULAR = 'Noto Sans Regular';
export const MAP_FONT_BOLD = 'Noto Sans Medium';

type Rgb = [number, number, number];
type Palette = Record<TokenName, string>;

function channelsToRgb(raw: string): Rgb {
  const m = raw.match(/([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!m) throw new Error(`not HSL channels: ${raw}`);
  const h = Number(m[1]);
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function rgbToHsl([r, g, b]: Rgb): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return `hsl(${r1(h)}, ${r1(s * 100)}%, ${r1(l * 100)}%)`;
}

const commaHsl = (channels: string, alpha?: number) => {
  const [h, s, l] = channels.trim().split(/\s+/);
  return alpha == null ? `hsl(${h}, ${s}, ${l})` : `hsla(${h}, ${s}, ${l}, ${alpha})`;
};

export function paperFlavor(p: Palette): Flavor {
  const P = commaHsl(p.background);
  const ink = (a?: number) => commaHsl(p.foreground, a);
  const inkMuted = () => commaHsl(p['muted-foreground']);
  const wash = (a: number) => ink(a);
  const fg = channelsToRgb(p.foreground);
  const bg = channelsToRgb(p.background);
  /** OPAQUE ink-on-paper mix — line layers must not stack alpha at junctions. */
  const inkOnPaper = (t: number) => rgbToHsl([0, 1, 2].map((i) => bg[i]! + (fg[i]! - bg[i]!) * t) as Rgb);

  return {
    background: P,
    earth: P,
    park_a: wash(0.05),
    park_b: wash(0.07),
    wood_a: wash(0.06),
    wood_b: wash(0.08),
    scrub_a: wash(0.04),
    scrub_b: wash(0.05),
    hospital: wash(0.05),
    industrial: wash(0.05),
    school: wash(0.05),
    pedestrian: wash(0.04),
    glacier: wash(0.03),
    sand: wash(0.04),
    beach: wash(0.05),
    aerodrome: wash(0.04),
    runway: wash(0.1),
    zoo: wash(0.05),
    military: wash(0.05),
    buildings: wash(0.045),
    pier: wash(0.17),
    water: wash(0.12),

    other: inkOnPaper(0.08),
    minor_service: inkOnPaper(0.09),
    minor_a: inkOnPaper(0.1),
    minor_b: inkOnPaper(0.1),
    link: inkOnPaper(0.13),
    major: inkOnPaper(0.15),
    highway: inkOnPaper(0.22),
    minor_service_casing: P,
    minor_casing: P,
    link_casing: P,
    major_casing_early: P,
    major_casing_late: P,
    highway_casing_early: P,
    highway_casing_late: P,

    tunnel_other: inkOnPaper(0.05),
    tunnel_minor: inkOnPaper(0.06),
    tunnel_link: inkOnPaper(0.08),
    tunnel_major: inkOnPaper(0.09),
    tunnel_highway: inkOnPaper(0.12),
    tunnel_other_casing: P,
    tunnel_minor_casing: P,
    tunnel_link_casing: P,
    tunnel_major_casing: P,
    tunnel_highway_casing: P,

    bridges_other: inkOnPaper(0.08),
    bridges_minor: inkOnPaper(0.1),
    bridges_link: inkOnPaper(0.13),
    bridges_major: inkOnPaper(0.15),
    bridges_highway: inkOnPaper(0.22),
    bridges_other_casing: P,
    bridges_minor_casing: P,
    bridges_link_casing: P,
    bridges_major_casing: P,
    bridges_highway_casing: P,

    railway: wash(0.35),
    boundaries: wash(0.3),

    country_label: ink(),
    state_label: inkMuted(),
    state_label_halo: P,
    city_label: ink(),
    city_label_halo: P,
    subplace_label: inkMuted(),
    subplace_label_halo: P,
    roads_label_major: inkMuted(),
    roads_label_major_halo: P,
    roads_label_minor: ink(0.55),
    roads_label_minor_halo: P,
    address_label: ink(0.5),
    address_label_halo: P,
    ocean_label: ink(0.45),

    pois: {
      blue: ink(0.55),
      green: ink(0.55),
      lapis: ink(0.55),
      pink: ink(0.55),
      red: ink(0.55),
      slategray: ink(0.55),
      tangerine: ink(0.55),
      turquoise: ink(0.55),
    },

    landcover: {
      barren: wash(0.03),
      farmland: wash(0.04),
      forest: wash(0.06),
      glacier: wash(0.03),
      grassland: wash(0.04),
      scrub: wash(0.05),
      urban_area: wash(0.06),
    },
  };
}

export const ROAD_WIDTH_SCALE = 1.5;
const NON_STREET = /^roads_(rail|runway|taxiway|pier)$/;
type LayerSpec = StyleSpecification['layers'][number];

function scaleWidth(value: unknown, k: number): unknown {
  if (typeof value === 'number') return value * k;
  if (!Array.isArray(value)) return value;
  if (value[0] === 'interpolate') {
    return value.map((v, i) => (i >= 3 && (i - 3) % 2 === 1 ? scaleWidth(v, k) : v));
  }
  if (value[0] === 'step') {
    return value.map((v, i) => (i >= 2 && i % 2 === 0 ? scaleWidth(v, k) : v));
  }
  return value;
}

/** Same transform as the web's `subwayRoads()`: one round-capped stroke per street. */
export function subwayRoads(input: LayerSpec[]): LayerSpec[] {
  return input.flatMap((layer) => {
    if (layer.type !== 'line' || layer['source-layer'] !== 'roads') return [layer];
    if (NON_STREET.test(layer.id)) return [layer];
    const isCasing = layer.id.includes('_casing');
    if (isCasing && !layer.id.includes('bridges')) return [];
    const paint = { ...(layer.paint ?? {}) } as Record<string, unknown>;
    if (isCasing) {
      if (paint['line-gap-width'] != null) {
        paint['line-gap-width'] = scaleWidth(paint['line-gap-width'], ROAD_WIDTH_SCALE);
      }
    } else if (paint['line-width'] != null) {
      paint['line-width'] = scaleWidth(paint['line-width'], ROAD_WIDTH_SCALE);
    }
    return [
      {
        ...layer,
        layout: { ...(layer.layout ?? {}), 'line-cap': 'round', 'line-join': 'round' },
        paint,
      } as LayerSpec,
    ];
  });
}

const cache: Partial<Record<string, StyleSpecification>> = {};

export function mapStyle(scheme: 'light' | 'dark', lang = 'en'): StyleSpecification {
  const key = `${scheme}:${lang}`;
  const hit = cache[key];
  if (hit) return hit;
  const style: StyleSpecification = {
    version: 8,
    glyphs: `${ASSETS_BASE}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${ASSETS_BASE}/sprites/v4/${scheme}`,
    sources: {
      [BASEMAP_SOURCE_ID]: {
        type: 'vector',
        tiles: [TILE_URL],
        maxzoom: 15,
        attribution: '© Protomaps © OpenStreetMap',
      },
    },
    // POIs dropped, as on the web: their sprite icons carry their own hues.
    layers: subwayRoads(
      layers(BASEMAP_SOURCE_ID, paperFlavor(scheme === 'dark' ? dark : light), { lang }).filter(
        (l) => l.id !== 'pois',
      ) as LayerSpec[],
    ),
  };
  cache[key] = style;
  return style;
}
