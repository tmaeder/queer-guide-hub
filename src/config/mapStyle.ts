import { layers, type Flavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';
import { ink, paper, inkMuted } from '@/lib/mapTokens';

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
 * Every value is one of three things — paper, ink, or ink at an alpha — so the
 * basemap is a printed map rather than a satellite-ish one, and so the four
 * track colours are the only chromatic marks on the whole canvas. This is what
 * makes the pins readable: on stock Protomaps `light` a pink pin sat on green
 * landcover next to blue water and orange motorway shields.
 *
 * Roads follow the printed-map convention: paper fill with an ink casing, so
 * the network reads as drawn lines at every zoom instead of coloured ribbons.
 * Weight, not hue, carries the hierarchy — casings darken from `other` up to
 * `highway`.
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
    buildings: wash(0.09),
    pier: wash(0.12),

    // Water is a wash, not a colour. A transit map prints the harbour in the
    // same ink as everything else.
    water: wash(0.09),

    // Roads — paper fill, ink casing, hierarchy by casing weight.
    other: P,
    minor_service: P,
    minor_a: P,
    minor_b: P,
    link: P,
    major: P,
    highway: P,
    minor_service_casing: wash(0.16),
    minor_casing: wash(0.2),
    link_casing: wash(0.26),
    major_casing_early: wash(0.3),
    major_casing_late: wash(0.3),
    highway_casing_early: wash(0.42),
    highway_casing_late: wash(0.42),

    // Tunnels: same ladder, lighter (they're under something).
    tunnel_other: P,
    tunnel_minor: P,
    tunnel_link: P,
    tunnel_major: P,
    tunnel_highway: P,
    tunnel_other_casing: wash(0.1),
    tunnel_minor_casing: wash(0.12),
    tunnel_link_casing: wash(0.16),
    tunnel_major_casing: wash(0.18),
    tunnel_highway_casing: wash(0.24),

    // Bridges: same ladder, heavier (they're over something).
    bridges_other: P,
    bridges_minor: P,
    bridges_link: P,
    bridges_major: P,
    bridges_highway: P,
    bridges_other_casing: wash(0.2),
    bridges_minor_casing: wash(0.24),
    bridges_link_casing: wash(0.3),
    bridges_major_casing: wash(0.34),
    bridges_highway_casing: wash(0.46),

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

let styleCache: StyleSpecification | undefined;

/**
 * Shared MapLibre style for every map surface in the app.
 *
 * Took a `'light' | 'dark'` flavor argument until 2026-08-10. Dark mode was
 * removed with the subway rebrand — `ThemeProvider` always reports light and
 * the `.dark` block is gone from index.css — so the dark branch had been
 * unreachable while still making ten surfaces subscribe to `resolvedTheme` and
 * tear down + rebuild their whole MapLibre instance on a "theme flip" that can
 * never happen.
 *
 * Cached: `layers()` builds a large spec, so don't rebuild it per instance.
 * Cached LAZILY, though, and never at module scope — `paperFlavor()` reads
 * live CSS custom properties, which do not exist until the stylesheet has
 * been applied. (The old eager `export const mapStyle = getMapStyle()` is gone
 * for exactly this reason; nothing outside the tests used it.)
 */
export function getMapStyle(): StyleSpecification {
  if (styleCache) return styleCache;
  styleCache = {
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
    layers: layers('protomaps', paperFlavor(), { lang: 'en' }).filter((l) => l.id !== 'pois'),
  };
  return styleCache;
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
