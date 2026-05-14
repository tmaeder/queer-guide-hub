# Build pipeline (Phase 0 inventory, 2026-05-14)

Source-of-truth summary of every custom build/deploy/i18n script touching production. Captured before tech-debt remediation begins so we know what we're inheriting.

## Vite (`vite.config.ts`)

- **Plugins:** `@vitejs/plugin-react-swc`, `@tailwindcss/vite`, custom `cfRocketLoaderBypass` (adds `data-cfasync="false"` to every `<script>` tag so Cloudflare's Rocket Loader doesn't mangle ES modules), `@sentry/vite-plugin` (production only — uploads source maps then deletes the `.map` files in `dist/assets/js/`), and an optional `rollup-plugin-visualizer` (enabled via `BUNDLE_STATS=1`, writes `bundle-baselines/stats.html`).
- **Entry / chunks:** single SPA entry. `build.rollupOptions.output.manualChunks` hand-splits 20+ vendor groups (vendor=React, router, utils=date-fns, graph, exceljs, maplibre, tiptap, hls, pdfjs, mammoth, gsap, boneyard, sentry, i18n, radix, motion, react-query, react-table, dnd-kit, forms, zod, lucide, ui-extras). Splitting alone does not make a lib lazy — the lib loads on initial paint if any module statically imports it.
- **Production tweaks:** `esbuild.drop=['console','debugger']`, `legalComments='none'`, `target='es2022'`, `sourcemap='hidden'`, `cssCodeSplit=true`, `reportCompressedSize=false`, `chunkSizeWarningLimit=1300`.
- **Dedup:** forced `dedupe: ['react', 'react-dom']` + `optimizeDeps.include: ['boneyard-js/react']` to work around a dual-React-instance bug in boneyard-js.

## NPM scripts (`package.json`)

| Script | Command | Purpose |
| ------ | ------- | ------- |
| `dev` | `vite` | Local dev server on port 8080 |
| `build` | `vite build` | What Cloudflare Pages runs in CI |
| `build:check` | `node --max-old-space-size=8192 node_modules/vite/bin/vite.js build && node scripts/check-bundle-shape.mjs` | Local build with bumped heap + chunk-size guard |
| `prerender` | `node scripts/prerender.mjs` | (252 lines) static HTML prerendering — invoked manually, not in CI |
| `bones` / `bones:force` | `boneyard build` | `boneyard-js` skeleton-generation step (separate tool) |
| `i18n:check` | `tsx scripts/sync-translations.ts` | Walks the i18n source-of-truth files and reports missing keys per locale |
| `i18n:check:defaults` | `node scripts/check-i18n-german-defaults.mjs` | (83 lines) detects English fallbacks in `de-DE` translations |
| `i18n:fill` | `tsx scripts/sync-translations.ts --fill` | Auto-fills missing keys from defaults |
| `verify:gh-sync` | `tsx scripts/verify-github-sync.ts` | Compares local repo against `main` to catch drift |

## Bundle-shape guard (`scripts/check-bundle-shape.mjs`)

71 lines. Walks `dist/assets/js/`. Two checks:

1. Per-chunk KB caps by filename prefix: `index: 1500`, `maplibre: 1200`, `vendor: 200`, `router: 80`, `exceljs: 1100`, `tiptap: 700`, `mui: 550`, `pdfjs: 500`, `mammoth: 600`. Exceeding any value emits a `::error::` and exits 1.
2. Forbidden-string scan on `index-*.js`: `xyflow`, `PipelineBuilder`, `WorkflowDashboard`. Catches the admin workflow builder leaking into the public entry.

Note: there is no cap on the *count* of chunks loaded eagerly, and the `index` cap is in raw bytes, not gzipped. Phase 1 should add a gzipped-initial-JS budget.

## CI

`.github/workflows/deploy-pages.yml` (recently fixed in #900, #901, #902) auto-deploys to Cloudflare Pages on push to `main`. There is no current PR gate on `typecheck && lint && test && build` — Phase 1 must add one.

## Heap-bump rationale (the symptom)

`build:check` uses `--max-old-space-size=8192`. Plain `build` (what CF Pages runs) does not. Likely cause: production build with sourcemaps generates large in-memory rollup graphs before sentry-vite-plugin uploads + deletes them. Cannot be confirmed without profiling. Should be revisited after Phase 1 splitting reduces module count in the main graph.

## Open questions to resolve before Phase 1

- Why are there three `index.esm-*.js` chunks (565 / 232 / 27 KB gz)? Confirmed: all three are `@zxcvbn-ts/*` (already dynamically imported). Rollup names them `index.esm` after the package's entry file. Cosmetic — rename via `manualChunks` for clarity.
- The `index-*.js` set contains both the app entry (305 KB gz) and several lazy route chunks. The bundle-shape guard's `index` cap matches all of them. Lazy routes are likely safe but the regex is too greedy.
