import { layers, namedFlavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';

// Tile server URL — CF Worker serving PMTiles from R2
const TILE_URL = 'https://protomaps-tiles.maeder-tobiassimon.workers.dev/planet/{z}/{x}/{y}.mvt';

// Font glyphs and sprite assets from Protomaps CDN
const GLYPHS_URL = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf';
const SPRITE_URL = 'https://protomaps.github.io/basemaps-assets/sprites/v4/light';

/**
 * Shared MapLibre style for all map components.
 * Uses Protomaps basemap tiles served from Cloudflare R2.
 */
export const mapStyle: StyleSpecification = {
  version: 8,
  glyphs: GLYPHS_URL,
  sprite: SPRITE_URL,
  sources: {
    protomaps: {
      type: 'vector',
      tiles: [TILE_URL],
      maxzoom: 6, // Current extract is z0-6; increase to 15 when full planet is uploaded
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    },
  },
  layers: layers('protomaps', namedFlavor('light'), { lang: 'en' }),
};

/**
 * Fog/atmosphere settings for globe projection maps.
 */
export const globeFog = {
  color: 'rgb(255, 255, 255)',
  'high-color': 'rgb(200, 200, 225)',
  'horizon-blend': 0.02,
};
