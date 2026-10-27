import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { GLYPH_DEFS } from './mapIcons';
import { ink } from '@/lib/mapTokens';

/**
 * Rasterizes category icons into MapLibre images so unclustered pins can show
 * a glyph on top of their track-coloured dot — bar vs sauna vs event readable
 * at a glance on the canvas itself.
 *
 * The glyph is INK, not white. Ink-on-track measures 5.22 (pink) / 7.72 (blue)
 * / 10.67 (green) / 13.15 (yellow); white-on-track fails badly on the two
 * light tracks, which is what this used to draw. Recolouring was an
 * accessibility fix that the palette change merely forced.
 *
 * Degrades safely: if rasterization fails for any icon, that glyph is simply
 * absent (the `['image', …]` expression returns null and the coloured circle
 * still renders). Never throws into the map lifecycle.
 */

const GLYPH_PX = 20; // logical size; rendered at 2× for retina
const SCALE = 2;

function rasterize(name: TransitIconName): Promise<ImageData | null> {
  return new Promise((resolve) => {
    try {
      // `color` (not a className) because this markup is serialised standalone
      // into a data-URI — there is no ancestor for `currentColor` to inherit.
      // TransitIcon picks its own stroke weight from `size`, which is why the
      // old explicit strokeWidth is gone.
      const svg = renderToStaticMarkup(
        createElement(TransitIcon, { name, size: GLYPH_PX, color: ink() }),
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
    GLYPH_DEFS.map(async ({ key, icon }) => {
      if (map.hasImage(key)) return;
      const data = await rasterize(icon);
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
