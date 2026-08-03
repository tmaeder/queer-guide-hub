import { layers, namedFlavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';

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

/** Basemap flavor — follows the app's resolved theme. */
export type BasemapMode = 'light' | 'dark';

const styleCache: Partial<Record<BasemapMode, StyleSpecification>> = {};

/**
 * Shared MapLibre style for all map components, in the given theme flavor.
 * Uses Protomaps basemap tiles served from Cloudflare R2. Cached per mode —
 * `layers()` builds a large spec, so don't rebuild it per map instance.
 */
export function getMapStyle(mode: BasemapMode = 'light'): StyleSpecification {
  const cached = styleCache[mode];
  if (cached) return cached;
  const style: StyleSpecification = {
    version: 8,
    glyphs: GLYPHS_URL,
    sprite: `${ASSETS_BASE}/sprites/v4/${mode}`,
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
    layers: layers('protomaps', namedFlavor(mode), { lang: 'en' }),
  };
  styleCache[mode] = style;
  return style;
}

/** Light-flavor style — legacy alias; theme-aware surfaces use getMapStyle(). */
export const mapStyle: StyleSpecification = getMapStyle('light');

/**
 * Fog/atmosphere settings for globe projection maps.
 */
export const globeFog = {
  color: 'rgb(255, 255, 255)',
  'high-color': 'rgb(200, 200, 225)',
  'horizon-blend': 0.02,
};
