import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

/**
 * Point MapLibre at a worker URL we actually ship.
 *
 * maplibre-gl 6 derives its worker URL at RUNTIME, from a template variable:
 *
 *   let t = import.meta.url.endsWith('-dev.mjs')
 *     ? 'maplibre-gl-worker-dev.mjs' : 'maplibre-gl-worker.mjs';
 *   return new URL(`./${t}`, import.meta.url).href;
 *
 * No bundler can see through that, so the asset is never emitted. In
 * production `import.meta.url` is the emitted chunk (/assets/js/maplibre-*.js),
 * so the worker was requested from /assets/js/maplibre-gl-worker.mjs — which
 * does not exist, and Cloudflare Pages' SPA fallback answers it with
 * index.html at `200 text/html`. A module worker built from HTML never starts,
 * and MapLibre parses tiles, glyphs AND GeoJSON in that worker, so the map is
 * dead — not degraded. Measured against https://queer.guide/map with headless
 * Chromium: 26 "Failed to load module script ... MIME type text/html" errors,
 * ZERO tile / glyph / sprite requests, and no `canvas.maplibregl-canvas` in the
 * DOM at all. The surrounding page still renders, which is what made this look
 * cosmetic; it is not. Same script against this build: worker loads
 * `200 text/javascript`, .mvt tiles and glyph .pbf are fetched, basemap draws.
 *
 * `?worker&url` makes Vite bundle the worker as its own entry (crucially
 * resolving the ~478 KB `./maplibre-gl-shared.mjs` sibling it imports, so a
 * plain `?url` copy would still 404) and hand back the hashed URL. It emits to
 * /assets/maplibre-gl-worker-<hash>.js — inside the `/assets/*` glob that
 * public/_headers stamps `immutable, max-age=31536000` and that
 * public/_routes.json excludes from Pages Functions, both of which are correct
 * for a content-hashed file.
 *
 * Imported for its side effect by src/config/mapStyle.ts — the one module every
 * map surface already pulls in for `getMapStyle()` — so this runs before any
 * `new maplibregl.Map()`.
 */
setWorkerUrl(workerUrl);
