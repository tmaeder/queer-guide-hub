import { layers, type Flavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';
import { ink, paper, inkMuted, inkOnPaper } from '@/lib/mapTokens';

// Side-effect import: registers the bundled MapLibre worker URL. Must run
// before any map is constructed, which importing it here guarantees — every
// map surface reaches MapLibre through getMapStyle() below. See the file for
// why maplibre-gl 6 cannot find its own worker in a bundled build.
import './maplibreWorker';

// Tile server URL — CF Worker serving PMTiles from R2.
export const TILE_URL =
  'https://protomaps-tiles.maeder-tobiassimon.workers.dev/planet/{z}/{x}/{y}.mvt';

/** Style source id for the basemap vector tiles. Exported so the runtime
 *  fallback can find the source without re-deriving the string. */
export const BASEMAP_SOURCE_ID = 'protomaps';

/**
 * Optional emergency basemap, used ONLY when the primary tile URL is failing.
 *
 * Unset (the default) = feature off and the map behaves exactly as before.
 *
 * Motivation: the tile worker above lives on the project's Cloudflare account,
 * so an account-level fault takes the whole basemap down and the map renders
 * blank — sprites and glyphs come from elsewhere and keep working, which makes
 * it look like a broken app rather than a missing tile source. Measured during
 * the 2026-08-03 outage: every /planet/{z}/{x}/{y}.mvt returned
 * `429 error code: 1027` (free-tier daily cap) while the style itself loaded.
 *
 * MUST serve the SAME Protomaps v4 vector schema as the primary. The layer
 * definitions come from `layers('protomaps', ...)` below and key off that
 * schema's layer names — pointing this at a differently-schema'd provider
 * (OpenFreeMap, MapTiler's own styles, …) yields an empty map, not a
 * different-looking one. A hosted Protomaps API URL or a self-hosted mirror of
 * the same build are the valid choices.
 *
 *   VITE_BASEMAP_FALLBACK_TILE_URL=https://example.com/planet/{z}/{x}/{y}.mvt
 */
export const FALLBACK_TILE_URL: string | undefined =
  import.meta.env.VITE_BASEMAP_FALLBACK_TILE_URL || undefined;

// Font glyphs and sprite assets.
//
// Default points at protomaps.github.io for now. GitHub Pages is rate-limited
// (~10 req/s/IP) and explicitly disallowed by GitHub TOS for primary
// infrastructure — Protomaps' own docs warn against it. The plan is to mirror
// `protomaps/basemaps-assets@v5.7.0` (sprites + Noto Sans glyph PBFs) to our
// own R2 bucket fronted by the existing tiles worker. To switch over without
// a code change, set `VITE_BASEMAP_ASSETS_URL` at build time, e.g.
//   VITE_BASEMAP_ASSETS_URL=https://tiles.queer.guide/basemaps-assets
// See scripts/sync-basemap-assets.sh for the upload step.
const ASSETS_BASE =
  import.meta.env.VITE_BASEMAP_ASSETS_URL ?? 'https://protomaps.github.io/basemaps-assets';
const GLYPHS_URL = `${ASSETS_BASE}/fonts/{fontstack}/{range}.pbf`;

/**
 * Brand font stacks for the basemap's own labels.
 *
 * These are directory names under `${ASSETS_BASE}/fonts/`, and Protomaps
 * substitutes them for its hardcoded `Noto Sans Regular / Medium / Italic`
 * wherever the flavor supplies them (`e.regular || "Noto Sans Regular"` in the
 * built layer specs). Space Grotesk has no italic cut, so the italic slot —
 * used only for water labels — takes the regular one rather than letting
 * MapLibre synthesise a slant.
 *
 * Requires the matching SDF glyph PBFs to exist at that path. Until
 * `VITE_BASEMAP_ASSETS_URL` points at a mirror that has them, this falls back
 * to Noto (see BASEMAP_FONTS_AVAILABLE below) — a missing fontstack makes
 * MapLibre drop every label on the map, which is far worse than the wrong
 * typeface.
 */
const BRAND_FONTS = {
  regular: 'Space Grotesk Regular',
  bold: 'Space Grotesk Bold',
  italic: 'Space Grotesk Regular',
} as const;

/** Only claim the brand glyphs when we're serving our own asset mirror —
 *  protomaps.github.io has Noto and nothing else. */
const useBrandFonts = Boolean(import.meta.env.VITE_BASEMAP_ASSETS_URL);

/**
 * The paper-and-ink basemap.
 *
 * Every value is paper, ink, ink at an alpha, or an opaque ink-on-paper mix, so the
 * basemap is a printed map rather than a satellite-ish one, and so the four
 * track colours are the only chromatic marks on the whole canvas. This is what
 * makes the pins readable: on stock Protomaps `light` a pink pin sat on green
 * landcover next to blue water and orange motorway shields.
 *
 * Roads are drawn the way a transit diagram draws its base streets: ONE solid
 * stroke per street, round-capped, a quiet grey under the coloured lines. They
 * were paper ribbons with an ink casing until 2026-10-31 — Protomaps draws a
 * casing as a `line-gap-width` line, i.e. two thin parallel strokes with the
 * road's own width left empty between them, so every street on the map read
 * as a double outline. The casing layers are now dropped (see
 * `subwayRoads()`), the fill carries the tone, and hierarchy is carried by
 * tone AND width together: a motorway is darker and fatter than a side street.
 *
 * Every road tone is OPAQUE (`inkOnPaper`), never `ink(alpha)` — translucent
 * strokes darken wherever two segments overlap, which on a street grid prints
 * a knot at every junction.
 *
 * Bridges keep a casing, but in PAPER: the transit-map "crossing gap", a thin
 * knock-out that lets a road passing over another read as over rather than
 * merged into it.
 *
 * POI and landcover colours are included deliberately: Protomaps tints POI
 * icons blue/green/pink/red/tangerine/turquoise by category, which would put
 * six uncontrolled hues back on the canvas one zoom level below where the
 * track colours live.
 */
function paperFlavor(): Flavor {
  const P = paper();
  const wash = (a: number) => ink(a);

  return {
    background: P,
    earth: P,

    // Land uses — barely-there ink washes, ordered so a park reads as slightly
    // more "something" than bare earth without ever competing with a pin.
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
    // Lighter than the lightest street, so a block never swallows the
    // street that bounds it.
    buildings: wash(0.06),
    // Piers sit ON water, so they must stay a step darker than it.
    pier: wash(0.17),

    // Water is a wash, not a colour. A transit map prints the harbour in the
    // same ink as everything else. 0.12 (was 0.09): at 0.09 a river read as
    // barely darker than a city block (buildings are 0.06) and vanished
    // under the street grid.
    water: wash(0.12),

    // Roads — one opaque grey stroke each; tone climbs with importance. The
    // `*_casing` keys are still required by the Flavor type, but only the
    // bridge casings are drawn (as paper knock-outs) — the rest are filtered
    // out in `subwayRoads()`.
    other: inkOnPaper(0.1),
    minor_service: inkOnPaper(0.11),
    minor_a: inkOnPaper(0.13),
    minor_b: inkOnPaper(0.13),
    link: inkOnPaper(0.17),
    major: inkOnPaper(0.19),
    highway: inkOnPaper(0.27),
    minor_service_casing: P,
    minor_casing: P,
    link_casing: P,
    major_casing_early: P,
    major_casing_late: P,
    highway_casing_early: P,
    highway_casing_late: P,

    // Tunnels: the same ladder, lighter — they are under something.
    tunnel_other: inkOnPaper(0.07),
    tunnel_minor: inkOnPaper(0.08),
    tunnel_link: inkOnPaper(0.1),
    tunnel_major: inkOnPaper(0.11),
    tunnel_highway: inkOnPaper(0.15),
    tunnel_other_casing: P,
    tunnel_minor_casing: P,
    tunnel_link_casing: P,
    tunnel_major_casing: P,
    tunnel_highway_casing: P,

    // Bridges: the surface ladder, plus the paper crossing gap (casing).
    bridges_other: inkOnPaper(0.1),
    bridges_minor: inkOnPaper(0.13),
    bridges_link: inkOnPaper(0.17),
    bridges_major: inkOnPaper(0.19),
    bridges_highway: inkOnPaper(0.27),
    bridges_other_casing: P,
    bridges_minor_casing: P,
    bridges_link_casing: P,
    bridges_major_casing: P,
    bridges_highway_casing: P,

    railway: wash(0.35),
    boundaries: wash(0.3),

    // Labels — ink on paper haloes, ranked by ink strength.
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

    ...(useBrandFonts ? BRAND_FONTS : {}),

    // Protomaps tints POI icons by category. Flatten them all to ink so the
    // track colours stay the only hues on the canvas.
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

/** How much fatter a road fill is than Protomaps draws it. The stock fill is
 *  the empty gap BETWEEN two casing strokes; with the casings gone the fill is
 *  the whole road, so it takes roughly their combined width back. */
export const ROAD_WIDTH_SCALE = 1.5;

/** Line layers on the `roads` source-layer that are not streets. */
const NON_STREET = /^roads_(rail|runway|taxiway|pier)$/;

type LayerSpec = StyleSpecification['layers'][number];

/** Multiply every OUTPUT stop of a zoom `interpolate`/`step` width, or a bare
 *  number. A `["*", k, expr]` wrapper is not allowed: MapLibre only accepts a
 *  `zoom` expression as the TOP-level interpolate/step of a paint value. */
function scaleWidth(value: unknown, k: number): unknown {
  if (typeof value === 'number') return value * k;
  if (!Array.isArray(value)) return value;
  if (value[0] === 'interpolate') {
    // [interpolate, curve, input, z0, v0, z1, v1, ...]
    return value.map((v, i) => (i >= 3 && (i - 3) % 2 === 1 ? scaleWidth(v, k) : v));
  }
  if (value[0] === 'step') {
    // [step, input, v0, z1, v1, ...]
    return value.map((v, i) => (i >= 2 && i % 2 === 0 ? scaleWidth(v, k) : v));
  }
  return value;
}

/**
 * Turn Protomaps' cased roads into transit-diagram strokes.
 *
 * - Drops every road casing except bridges'. A Protomaps casing is a line with
 *   `line-gap-width` = the road's width, which renders as TWO thin parallel
 *   strokes — the "double outline" on every street.
 * - Widens the remaining fills by {@link ROAD_WIDTH_SCALE} and rounds their
 *   caps and joins (the subway rule: round terminals, no mitred spikes).
 * - Widens bridge casings' gap by the same factor so the paper knock-out still
 *   hugs the (now wider) bridge.
 */
export function subwayRoads(layers: LayerSpec[]): LayerSpec[] {
  return layers.flatMap((layer) => {
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

const styleCache: Partial<Record<'light' | 'dark', StyleSpecification>> = {};

/**
 * Shared MapLibre style for every map surface in the app.
 *
 * Took a `'light' | 'dark'` flavor argument until 2026-08-10, when it was
 * dropped on the stated grounds that dark mode had been removed with the
 * subway rebrand. **That premise was false and the comment stood until
 * 2026-10-03:** `src/index.css` carries a full `.dark {}` block, `ThemeToggle`
 * renders from `Footer.tsx` and `MobileNavSheet.tsx`, `ThemeProvider` stamps
 * `light`/`dark` onto the root element, and `tokenCatalog.ts` carries a dark
 * value for every token. Dark mode is a supported mode; CLAUDE.md records the
 * same correction.
 *
 * Cached: `layers()` builds a large spec, so don't rebuild it per instance.
 * Cached PER MODE, because `paperFlavor()` resolves live CSS custom
 * properties — a single-slot cache was set at the first map mount and never
 * invalidated, so a user who loaded in light and flipped to dark got a light
 * paper basemap under dark chrome (and vice versa) on all 14 call sites.
 * Cached LAZILY, and never at module scope — those custom properties do not
 * exist until the stylesheet has been applied. (The old eager
 * `export const mapStyle = getMapStyle()` is gone for exactly this reason;
 * nothing outside the tests used it.)
 *
 * The mode comes off the root element rather than from `useTheme()`, so this
 * stays a zero-argument function and the 14 callers need no change.
 *
 * **An already-mounted map is deliberately NOT repainted on a theme flip.**
 * The only way to swap a live basemap is `map.setStyle()`, and this app cannot
 * use it: it tears down every source and layer while `usePointLayers`,
 * `useAreaLayers`, `useHeatmapLayer` and `useFocusRing` each still hold their
 * own "already added" ref — the same constraint that made the tile fallback
 * use `setTiles` (see the note in `basemapFallback.ts`). So a flip costs the
 * currently-open map its basemap tone until navigation, and every map opened
 * after it is correct. If that trade is ever revisited, the work is in the
 * layer hooks, not here.
 */
export function getMapStyle(): StyleSpecification {
  const mode = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  const cached = styleCache[mode];
  if (cached) return cached;
  const style: StyleSpecification = {
    version: 8,
    glyphs: GLYPHS_URL,
    sprite: `${ASSETS_BASE}/sprites/v4/light`,
    sources: {
      [BASEMAP_SOURCE_ID]: {
        type: 'vector',
        tiles: [TILE_URL],
        maxzoom: 15, // Full planet z0-15 (20260301 build)
        // Protomaps license requires attribution alongside OpenStreetMap.
        attribution:
          '&copy; <a href="https://protomaps.com">Protomaps</a> ' +
          '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    // The `pois` layer is dropped, not restyled. Its icons come from the
    // Protomaps SPRITE — a pre-coloured raster atlas — so no flavor value can
    // reach them: measured on the paper basemap, parks still drew green
    // markers, stations blue and the zoo its own hue, six uncontrolled colours
    // sitting one layer under our own pins. (The palette unit test cannot see
    // this either; it walks paint values, and a sprite icon has none.) A
    // transit map does not print generic OSM POIs anyway — the stations ARE
    // the points of interest here, and the labels were competing with them.
    layers: subwayRoads(
      layers('protomaps', paperFlavor(), { lang: 'en' }).filter((l) => l.id !== 'pois'),
    ),
  };
  styleCache[mode] = style;
  return style;
}

/** The map's own label fontstacks, for overlay layers that add their own
 *  `text-font` (cluster counts, area labels, boundary labels). Keeping them on
 *  the same stack as the basemap is the whole point of shipping the glyphs. */
export const MAP_FONT_REGULAR = useBrandFonts ? BRAND_FONTS.regular : 'Noto Sans Regular';
export const MAP_FONT_BOLD = useBrandFonts ? BRAND_FONTS.bold : 'Noto Sans Medium';

/**
 * Fog/atmosphere settings for globe projection maps. Paper all the way out —
 * the old `rgb(200, 200, 225)` high-colour put a blue rim on the globe, the
 * last chromatic value in this file.
 */
export const globeFog = () => ({
  color: paper(),
  'high-color': ink(0.12),
  'horizon-blend': 0.02,
});
