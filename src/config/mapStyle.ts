import { layers, namedFlavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';

// Tile server URL — CF Worker serving PMTiles from R2.
const TILE_URL = 'https://protomaps-tiles.maeder-tobiassimon.workers.dev/planet/{z}/{x}/{y}.mvt';

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
      protomaps: {
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
