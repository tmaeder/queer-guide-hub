# Declutter Candidates

Evidence-backed ledger for the `/codebase-declutter` pass. Each row carries the proof that a
removal is safe (or why an item is kept). Verification = the check run before/after acting.
Companion: [`DECLUTTER_PLAN.md`](DECLUTTER_PLAN.md), [`docs/architecture/repo-map.md`](docs/architecture/repo-map.md).

Overall finding: the repo is **already well-maintained** — no config drift, no unused
dependencies (heavy libs are lazy-loaded/chunked), scripts/docs/CI all serve a purpose. The
clutter is narrow and concentrated in (1) a duplicate hook, (2) unused UI primitives, (3) a few
deprecated/unused edge functions.

## A — Duplicate / near-duplicate

| # | Item | Evidence | Risk | Action | Verification |
|---|------|----------|------|--------|--------------|
| A1 | `src/hooks/useFxRates.ts` | Shadows `useFxRates.tsx` at the same extensionless import path (`@/hooks/useFxRates`). `.ts` returns `Map<string,number>`; `.tsx` returns object `FxRates` (`{USD:1,…}`). Consumers (`MarketplaceCard`, `CostSplitSummary`, `useTripBudget`) + test mocks expect the **object** form. | Low | Delete `.ts`, keep `.tsx` | `npm run typecheck`, `npm test` |

## B — Dead UI components (zero production importers)

Confirmed via `rg "from '@/components/ui/<name>'"` → no non-test, non-self matches.

| # | Item | Evidence | Risk | Action |
|---|------|----------|------|--------|
| B1 | `ui/TextType.tsx` (+ colocated css) | 0 importers; decorative typing animation — violates CLAUDE.md "Motion: functional only" | Low | Delete + test |
| B2 | `ui/search-input-typed.tsx` | 0 importers; depends on TextType (also decorative) | Low | Delete + test |
| B3 | `ui/carousel.tsx` | 0 importers (embla shadcn primitive never adopted) | Low-Med | Delete + test |
| B4 | `ui/resizable.tsx` | 0 importers (react-resizable-panels primitive never adopted) | Low-Med | Delete |
| B5 | `ui/ErrorRetry.tsx` | 0 importers (design-system primitive, not yet adopted) | Low-Med | Delete + test |
| B6 | `ui/LoadingList.tsx` | 0 importers (design-system primitive) | Low-Med | Delete + test |
| B7 | `ui/SectionHeader.tsx` | 0 importers (design-system primitive) | Low-Med | Delete |
| B8 | `ui/Surface.tsx` | 0 importers (design-system primitive) | Low-Med | Delete |
| B9 | `ui/status-badge.tsx` | 0 importers. **Note:** `StatusBadge` is referenced in CLAUDE.md Design section — update that line when removing. (The many `StatusBadge` grep hits are `ImportStatusBadge` substring matches, not this component.) | Med | Delete + update CLAUDE.md |

Associated deps to re-check with `depcheck` after B3/B4: `embla-carousel-react`, `react-resizable-panels`.

## C — Deprecated / superseded edge functions

| # | Item | Evidence | Risk | Action |
|---|------|----------|------|--------|
| C1 | `supabase/functions/background-import-manager/` | Migration `20260501030000` disables it (`is_enabled=false`), description `[DEPRECATED 2026-05-01]`, comment "function deletion in follow-up PR". Only repo ref is that disable migration; 0 frontend invokes, 0 cross-function calls. | Med | Delete dir + `supabase functions delete` + remove from `function-monitor` + cleanup-migration for leftover `workflow_definitions` rows — **after live-DB gate** |
| C2 | `supabase/functions/ingestion-pipeline/` | Same disable migration. Other `ingestion-pipeline` migration hits are `hotel-ingestion-pipeline` (substring). 0 live callers. | Med | Same as C1 |

## D — Unused admin/manual utility functions (live-DB-gated)

Referenced **only** by `function-monitor/index.ts` metadata; 0 frontend invokes; 0 cron/workflow
refs in repo. Repo evidence is necessary but **not sufficient** — each must be checked against
live `cron.job` + enabled `workflow_definitions` before deletion. Keep any with a live reference.

| # | Item | Repo evidence | Action |
|---|------|---------------|--------|
| D1 | `reimport-personality-images` | only function-monitor | delete if live-DB clean; else keep |
| D2 | `backfill-personality-qids` | no refs at all | delete if live-DB clean |
| D3 | `link-locations` | only function-monitor | delete if live-DB clean |
| D4 | `update-musician-concerts` | only function-monitor | delete if live-DB clean |
| D5 | `price-drop-check` | no refs at all | delete if live-DB clean |
| D6 | `source-email-ingestions` | no refs at all | delete if live-DB clean |
| D7 | `source-ilga` | header "Replaces import-ilga-data"; no DAG ref | delete if live-DB clean (confirm not a planned source) |
| D8 | `import-refuge-restrooms` | referenced by `source-refuge-restrooms` | **investigate first — likely keep** |

## E — Disabled scrape-source adapters (optional)

`source-tomtom` + scraper adapters for `mister-bnb`, `gaycities-*`, `travelgay-pride`,
`equaldex-api`, `eventfrog-lgbtiq` — disabled in `scrape_sources` (migrations `20260330600000`,
`20260414240100`, mostly Cloudflare 403 / SPA). Delete only if **permanently** retired; otherwise
leave with a one-line note. Low priority.

## Kept — verified in active use (do NOT remove)

| Item | Why kept |
|------|----------|
| `getRandomFallbackImage` (`src/utils/fallbackImages.ts`) | Heavily used (~15 files: hotels, news, discovery, detail pages). First-pass agent was wrong. |
| `fetch-news` edge function | Still invoked from `AdminNewsSources.tsx:143` behind a feature flag. |
| `ingest-api-error` edge function | Active internal error endpoint — called by `sentry-webhook` + `_shared/report-api-error.ts`. |
| `StaggerGrid.tsx` | Gutted to passthrough but still imported at 10 call sites — keep as compat shim. |
| 6× `backfill-*-images` / `backfill-venue-cities` | Active via cron/triggers in migrations. |
| `algolia-sync`, `universal_search()` | Already removed from repo — nothing to do. |
| All deps, scripts, CI workflows, docs subdirs | Audited — all justified. |
