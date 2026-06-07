import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { LucideIcon } from 'lucide-react';
import { GLYPH_DEFS } from './mapIcons';

/**
 * Rasterizes lucide category icons into MapLibre images so unclustered pins
 * can show a white category glyph on top of their colored dot — bar vs sauna
 * vs event readable at a glance on the canvas itself.
 *
 * Degrades safely: if rasterization fails for any icon, that glyph is simply
 * absent (the `['image', …]` expression returns null and the colored circle
 * still renders). Never throws into the map lifecycle.
 */

const GLYPH_PX = 20; // logical size; rendered at 2× for retina
const SCALE = 2;

function rasterize(Icon: LucideIcon): Promise<ImageData | null> {
  return new Promise((resolve) => {
    try {
      const svg = renderToStaticMarkup(
        createElement(Icon, {
          size: GLYPH_PX,
          color: '#ffffff',
          strokeWidth: 2.5,
          absoluteStrokeWidth: true,
        }),
      );
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = GLYPH_PX * SCALE;
          canvas.height = GLYPH_PX * SCALE;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    } catch {
      resolve(null);
    }
  });
}

// Per-map guard — images live on the map instance, so each map loads its own.
const loadedMaps = new WeakSet<MaplibreMap>();

/** Idempotently load all glyph images into the map, then repaint. */
export async function loadGlyphImages(map: MaplibreMap): Promise<void> {
  if (loadedMaps.has(map)) return;
  loadedMaps.add(map);
  await Promise.all(
    GLYPH_DEFS.map(async ({ key, Icon }) => {
      if (map.hasImage(key)) return;
      const data = await rasterize(Icon);
      if (data && !map.hasImage(key)) {
        try {
          map.addImage(key, data, { pixelRatio: SCALE });
        } catch {
          /* image already added by a concurrent map instance — ignore */
        }
      }
    }),
  );
  try {
    map.triggerRepaint();
  } catch {
    /* map may be gone */
  }
}
