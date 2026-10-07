# Cruising map performance and reliability design

## Problem

The authenticated cruising page loaded the 1.09 MB MapLibre runtime and 507 KB worker as part of opening the route, delaying the directory shell. Its capability guard also accepted WebGL 1 even though MapLibre GL JS 6 requires WebGL 2, so WebGL-1-only browsers could pass the guard and fail during map construction. The production E2E check only asserted that controls existed; it did not prove that tiles or pixels rendered.

The map also issued an initial unbounded 500-row spot query before it knew its viewport. Overlay sources waited for MapLibre's full `load` event, coupling cruising markers to basemap tile completion.

## Design

- Keep the authenticated directory and dating panel as the primary route shell.
- Load the MapLibre component through a suspense boundary after that shell renders.
- Require WebGL 2 in the shared capability check and release the temporary probe context.
- Catch renderer-construction failures locally and retain the complete spot directory as the fallback.
- Add overlays when the style becomes mutable, without waiting for all basemap tiles.
- Let the initialized map publish its viewport, then request mapped spots for that viewport instead of running the initial global query.
- Strengthen production E2E coverage to require a successful vector tile, a non-blank canvas, a ready renderer, and at least one viewport spot.

## Verification

- Unit coverage for WebGL 2 and WebGL-1-only environments.
- Cruising page tests for deferred viewport querying.
- Typecheck ratchet, production build, and bundle-shape validation.
- Focused authenticated Playwright run against production after deployment.
