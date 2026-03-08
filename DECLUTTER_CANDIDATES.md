# Declutter Candidates

Generated: 2026-03-03 | Updated: 2026-03-05
Branch: `chore/declutter-20260303`
Baseline: Build passes, 183 tests pass, typecheck clean

## Batch 1 — Dead Files (0 imports, safe to delete)

| File | Type | Evidence |
|------|------|----------|
| `src/hooks/useAlgoliaSearch.tsx` | Hook | Algolia removed Round 4 (2026-02-09). 0 imports found. |
| `src/hooks/useOptimizedDirectory.tsx` | Hook | 0 imports found anywhere in codebase. |
| `src/hooks/usePushNotifications.tsx` | Hook | 0 imports. Uses `@capacitor/*` which isn't installed (Capacitor removed). |
| `src/components/demo/ImageOptimizationDemo.tsx` | Component | Demo code, 0 imports. |
| `src/components/redis/RedisDemo.tsx` | Component | Demo code, 0 imports. |
| `src/components/performance/LazyComponent.tsx` | Component | Performance experiment, 0 imports. |
| `src/components/performance/MemoryOptimizations.tsx` | Component | Performance experiment, 0 imports. |
| `src/fancy/components/physics/cursor-attractor-and-gravity.tsx` | Component | Unused fancy animation, 0 imports. |
| `src/styled-system/jsx.ts` | Config | Park UI removed. 0 imports. |
| `src/styled-system/recipes.ts` | Config | Park UI removed. 0 imports. |
| `src/scripts/` | Directory | Empty (only .gitkeep or nothing). |

**Lines removed:** ~800 estimated
**Risk:** None — all verified 0 imports

## Batch 2 — Unused Dependencies

| Package | Type | Evidence |
|---------|------|----------|
| `@hookform/resolvers` | dep | 0 imports in `src/`. Not used with react-hook-form zod integration. |
| `@mui/icons-material` | dep | 0 imports in `src/`. MUI icons not used despite MUI being present. |
| `@mui/lab` | dep | 0 imports in `src/`. Lab components not used. |
| `class-variance-authority` | dep | 0 imports in `src/`. shadcn/ui CVA pattern not used. |
| `browserslist` | dep | 0 direct imports. Transitive dep pulled by autoprefixer already. Explicit dep unnecessary. |
| `vite-tsconfig-paths` | dep | Not referenced in vite.config.ts or any config file. |

**Bundle impact:** `@mui/icons-material` alone is ~60KB+ in vendor chunk when tree-shaken
**Risk:** Low — all confirmed unused via grep + depcheck

## Batch 3 — Stale Root Artifacts

| File | Evidence |
|------|----------|
| `vite.config.ts.timestamp-*.mjs` (2 files) | Vite build cache artifacts. Auto-generated, no source value. |
| `vite.config.test2.ts.timestamp-*.mjs` | Test config artifact. |
| `vite.test.mjs.timestamp-*.mjs` (2 files) | Test config artifacts. |
| `SECURITY_FIXES_IMPLEMENTED.md` | Implementation complete (2026-02-10). Info captured in MEMORY.md. |
| `DESIGN_SYSTEM_AUDIT_LOG.md` | Audit complete (2026-02-10). Historical record only. |

**Risk:** None — build artifacts are junk; docs are archived in git history

## Batch 4 — Stale Scripts

| File | Evidence |
|------|----------|
| `scripts/create-sample-images.sh` | One-off demo image creator. Not in any CI/build pipeline. |
| `scripts/generate-images.js` | Uses `sharp` (not installed). One-off generator. |
| `scripts/image-optimizer.js` | Optimization wrapper. Not referenced in package.json scripts. |
| `scripts/optimize-existing-images.js` | Batch optimizer. Not automated anywhere. |

**Risk:** Low — none referenced in package.json scripts, CI, or build config

---

## Batch 5 — Dead Duplicate Hook

| File | Evidence |
|------|----------|
| `src/hooks/useUniversalSearch.tsx` | 0 external importers. Old client-side ilike search superseded by `useSearch` (edge fn + PostgreSQL FTS). 427 lines. |

**Lines removed:** 427
**Risk:** None — verified 0 imports outside own file

---

---

## Batch 6 — Dead Hooks (2026-03-05)

| File | Lines | Evidence |
|------|-------|----------|
| `src/hooks/useRedis.tsx` | 182 | 0 imports. Redis integration never shipped. |
| `src/hooks/usePerformanceOptimizations.tsx` | 65 | 0 imports. Experiment, superseded. |
| `src/hooks/useVirtualization.tsx` | 43 | 0 imports. Unused virtualization experiment. |
| `src/hooks/usePersonalityStats.tsx` | 104 | 0 imports. Stats fetched inline in pages. |
| `src/hooks/useILGAData.tsx` | 113 | 0 imports. ILGA data handled by edge function cron only. |
| `src/hooks/useSecurePasskeyStorage.tsx` | 132 | 0 imports. Passkey feature not implemented. |

**Lines removed:** ~639 | **Risk:** None

---

## Batch 7 — Dead Pages (replaced by CMS)

All routes now served via `CMSRoutePage`. These static page components are unreferenced.

| File | Lines | Evidence |
|------|-------|----------|
| `src/pages/AboutHub.tsx` | 369 | Route: `<CMSRoutePage slug="about-hub" />`. 0 imports. |
| `src/pages/AccessibilityHub.tsx` | 112 | No route. 0 imports. |
| `src/pages/AdminAudio.tsx` | 42 | No route. 0 imports. |
| `src/pages/AdminFestivals.tsx` | 445 | Route removed: comment says "festivals integrated into events". 0 imports. |
| `src/pages/AdminSecurityDashboard.tsx` | 290 | No route, AdminConsolidated handles this. 0 imports. |
| `src/pages/AdminVideos.tsx` | 42 | No route. 0 imports. |
| `src/pages/CookiePolicy.tsx` | 155 | Route: `<CMSRoutePage slug="cookies" />`. 0 imports. |
| `src/pages/FestivalDetail.tsx` | 263 | Route: `<Navigate to="/events" />`. 0 imports. |
| `src/pages/LegalHub.tsx` | 326 | Route: `<CMSRoutePage slug="legal" />`. 0 imports. |
| `src/pages/OurValues.tsx` | 279 | No route, merged into About. 0 imports. |
| `src/pages/OurVision.tsx` | 222 | No route, merged into About. 0 imports. |
| `src/pages/Press.tsx` | 193 | No route. 0 imports. |
| `src/pages/PrivacyPolicy.tsx` | 160 | Route: `<CMSRoutePage slug="privacy" />`. 0 imports. |
| `src/pages/Sustainability.tsx` | 204 | No route. 0 imports. |
| `src/pages/TermsOfService.tsx` | 111 | Route: `<CMSRoutePage slug="terms" />`. 0 imports. |

**Lines removed:** ~3,213 | **Risk:** Low — confirmed unreferenced. CMS equivalents live.

---

## Batch 8 — Dead Utils + Finder Duplicate

| File | Lines | Evidence |
|------|-------|----------|
| `src/utils/FirecrawlService.ts` | 104 | 0 imports. Web crawl feature never shipped. |
| `src/utils/performanceUtils.ts` | 101 | 0 imports. Unused experiment. |
| `src/utils/requestBatcher.ts` | 116 | 0 imports. Batching replaced by React Query. |
| `src/components/admin/venues/VenueCard 2.tsx` | — | Identical to `VenueCard.tsx`. macOS Finder duplicate (space in name). |

**Lines removed:** ~321 | **Risk:** None

---

## Batch 9 — Generated Data Files in scripts/

| Path | Size | Evidence |
|------|------|----------|
| `scripts/output/` | 2.6MB | Generated boundary GeoJSON + nominatim JSON. Reproducible. Not in package.json. |
| `scripts/tmp/` | 4.7MB | Temp Natural Earth shapefiles (downloaded artifacts). |

**Freed:** ~7.3MB | **Risk:** None — reproducible generated files

---

## Future Candidates (needs human review, not auto-deletable)

### Duplicate Hook Pairs (both versions are actively imported)
- `useVenues.tsx` (4 imports) vs `useOptimizedVenues.tsx` (5 imports) — different APIs, need migration
- `usePlaces.tsx` (2 imports) vs `useOptimizedPlaces.tsx` (2 imports) — different APIs, need migration
- `useEvents.tsx` (6 imports) vs `useOptimizedEvents.tsx` (4 imports) — different APIs, need migration
- `useCMS.tsx` (2 imports: CRUD) vs `useUniversalCMS.tsx` (2 imports: dashboard read) — **complementary, not duplicates**

### Duplicate Components (both actively used)
- `src/components/venues/VenueCard.tsx` (4 imports: public pages) vs `src/components/admin/venues/VenueCard.tsx` (1 import: VenuesList) — **different contexts** (public vs admin), keep both
- `src/components/ErrorBoundary.tsx` (App.tsx) vs `src/components/error/OptimizedErrorBoundary.tsx` (ProfileSettings) — keep both

### Large Chunks Worth Investigating
- `maplibre` — 1,059 KB (expected for map rendering)
- `exceljs` — 938 KB (admin export, consider lazy-loading)
- `index` — 640 KB (main bundle, investigate with vite-bundle-visualizer)
- `tiptap` — 607 KB (CMS editor, already lazy-loaded)

### Dev/ Root Loose Files (not in web/ git)
These are at `/Dev/` root — one-off scripts and data files from completed import runs:
- `firebase-debug.log` (844KB), `scraped_tags.json` (1.6MB), `import_batches.json` (1.3MB), `batch0.sql` (48KB)
- `TAG_TAXONOMY_AUDIT.md` (40KB), `plan.md`, `fix_sx_props.py`, `scrape_xhamster_tags.py`, `.plan`
