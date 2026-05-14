# Consolidation 2026 Q2 — final report

Sprint scope: reduce surface area (deprecated edge functions, dual UI library, migration sprawl, doc drift) without breaking prod. Spec from inbound brief. Branch: `claude/consolidation` off `queer-guide-hub` `main`.

## What landed

| Phase | Status | Commit |
|---|---|---|
| **0** Inventory + state doc | ✅ done | `d40ade0d` |
| **1a** Delete 410-stub edge functions | ✅ done (3 deleted: `algolia-search`, `fetch-ilga-data`, `algolia-sync`) + dangling-ref cleanup | `4dd8de9e` |
| **1b** Feature-flag legacy `fetch-news` UI triggers | ✅ done (env var `VITE_LEGACY_NEWS_TRIGGER`, removal target 2026-06-01) | `f9899f76` |
| **3** ADR for UI library consolidation | ✅ Proposed (chosen: shadcn) — awaits user acceptance | `1da72883` |
| **5c** Operations runbook | ✅ done | `1da72883` |
| **6** This final report | ✅ this commit | (this commit) |

## Numbers — before vs after this branch

| Metric | Before | After branch | Delta |
|---|---|---|---|
| Edge functions on disk | 202 | **199** | −3 |
| 410 stubs (functions returning HTTP 410 with zero callers) | 4 | **1** (`background-import-manager`/`ingestion-pipeline` have callers, `trip-ical` is share-token-expiry, not a stub) | −3 |
| Lines of code in deleted/refactored files | — | **−847** lines | |
| MUI imports | 502 | 502 | 0 (ADR Proposed; migration deferred) |
| Migrations | 648 / 645 tracked | 645 | 0 (Phase 4 deferred) |
| Documented operational state | none | `consolidation-state-2026-05-01.md` + `operations.md` | +2 docs |
| ADRs | 0 (under `docs/adrs/`) | 1 | +1 |

## Files deleted

- `supabase/functions/algolia-search/index.ts`
- `supabase/functions/algolia-sync/index.ts`
- `supabase/functions/fetch-ilga-data/index.ts`

## Files modified (small surface)

- `supabase/config.toml` — drop `[functions.fetch-ilga-data]` block
- `supabase/functions/function-monitor/index.ts` — drop 3 dangling registry rows
- `src/components/admin/NewsSourcesManager.tsx` — gate trigger button on flag
- `src/pages/AdminNewsSources.tsx` — gate "Fetch Now" rowAction on flag

## Files created

- `src/lib/featureFlags.ts` — `LEGACY_NEWS_TRIGGER_ENABLED`
- `docs/consolidation-state-2026-05-01.md`
- `docs/adrs/0001-ui-library-consolidation.md`
- `docs/operations.md`
- `docs/consolidation-2026-Q2-final.md` (this file)

## ADRs produced

| ADR | Status | What it decides |
|---|---|---|
| [`0001-ui-library-consolidation`](adrs/0001-ui-library-consolidation.md) | **Proposed** | Consolidate to shadcn/ui; retire MUI v7. ESLint rule + 4-month / 7-month migration milestones. **Needs user acceptance.** |

## Deferred to future engagements

These were in the original spec but deliberately not done in this session — each requires either multi-week implementation or external system access this engagement didn't have.

### Phase 1c — archive zero-ref legacy migrations
- Phase 0 found exactly **one** orphan from legacy SQL: `trip_reviews` table (no application refs). Other "legacy" migrations create still-active core tables (venues, events, profiles, marketplace_listings, community_posts) and must NOT be archived.
- Action when picked back up: write a single migration `DROP TABLE IF EXISTS trip_reviews;` and verify against production via Supabase MCP (don't rely on grep alone for table-drop decisions).

### Phase 2 — `source-fetch` consolidation + caller migration
- Per-source `source-*` and `import-*` functions partially DAG-ified already; remaining consolidation needs a `Plan` agent run.
- **Includes:** migrating the 7 `useBackgroundImports.tsx` call sites off `background-import-manager` (410 stub) and the 5+ scraper invocations off `ingestion-pipeline` (410 stub). Both stubs return HTTP 410 today — current admin UI silently errors.
- Multi-week effort; do not big-bang. Pilot 2 sources, prove parity, batch-3 the rest.

### Phase 4 — migration baseline + schema-rename ADR
- Squashing 645 migrations to a single `00000000000000_baseline.sql` requires `pg_dump --schema-only` against production. Use Supabase MCP `execute_sql` + the dashboard schema export.
- Old migrations move to `supabase/migrations/_archive/`, not deleted (production already has them applied; baseline is for new environments only).
- Schema-rename ADR (`0002-schema-naming-cleanup.md`) covers `news_articles.is_featured` vs `venues.featured`, `personalities.birth_date`, `news_sources.source_type`, `events.title`, `unified_tags`, `personalities.profession + lgbti_connection`. Each rename ships in two phases: backwards-compatible view first, then drop old columns after application layer migrates.

### Phase 5a — iCloud move
- **Skipped — not needed.** Phase 0 verified the repo is NOT under `~/Library/Mobile Documents/`. The iCloud-corruption warning in CLAUDE.md is precautionary; can stay.

### Phase 5b — restore 3 high-value e2e tests
- 21 Playwright specs exist under `e2e/`; many are stale per CLAUDE.md.
- Recommended 3 to revive (highest-business-value flows):
  - **`submit-upload-errors.spec.ts`** — covers Chrome extension submission via `workers/submit/`
  - **`admin-pipelines.spec.ts`** — covers news pipeline e2e
  - **(no Stripe spec exists)** — write a new `checkout.spec.ts` covering `create-checkout-session` + `stripe-webhook` (or fall back to mocking)
- The other 18 specs should be triaged: each either earns its keep (passes locally + CI within a week) or gets `test.skip()` with a TODO. Untrustworthy tests are worse than no tests.
- Wire the 3 into a `e2e-pr.yml` GitHub Action that runs on PRs touching `src/`, `supabase/functions/`, or `workers/`. Daily-only is the current state.
- **Why deferred:** can't run Playwright in this session to verify which specs pass; reviving without verification is busywork.

### Phase 5d — Sentry SLO for edge functions
- Frontend Sentry is wired (`src/sentry.ts`). **Zero edge functions initialize Sentry.** Confirmed during Phase 0.
- Action: add `Sentry.init` in each edge function's entry, wrapped via a `_shared/sentry.ts` helper. Touches DSN + auth tokens — user should do this.

### Phase 1a — additional 410-stub deletions
- `background-import-manager` and `ingestion-pipeline` are also 410 stubs but each have multiple active call sites. Caller migration is a prerequisite — rolled into Phase 2.

## Discovered surprises (worth knowing)

These came up mid-engagement and aren't in the original spec.

1. **Two-repo layout.** The umbrella `/Users/tobiasmaeder/QG/` is a separate git repo from the queer-guide-hub project at `/Users/tobiasmaeder/QG/Dev/web/`. The umbrella explicitly ignores `Dev/web/*` ("queer-guide-hub clone — ignore most, but keep workflows"). Some workers (`email-ingest`, `scraper-api`, `telegram-ingest`) live ONLY in the umbrella; web/`workers/` has different ones (`ingest`, `submit`, `search-proxy`, `snapshot-archiver`). CLAUDE.md in each repo describes its own tree, not the combined one.

2. **`fetch-news` is half-disabled.** CLAUDE.md said "old fetch-news direct-upsert is disabled" — true for cron, **misleading for the manual UI**. Three admin call sites still hit it. Phase 1b feature-flagged them.

3. **`function-monitor` registry includes already-deleted refs.** Same-PR cleanup needed — otherwise the monitor false-alerts on every check. Watch this when deleting future stubs.

4. **`search` edge function still calls `universal_search` PG FTS RPC.** The Meilisearch migration is incomplete; PG FTS is the fallback. If you delete `universal_search` or its RPC during a Phase 4 rename, `search` breaks.

5. **`ingest-worker` wrangler cron is `* * * * *`** — every minute. Likely intentional but worth confirming.

6. **`legacy-cron` daily 06:00** — purpose unclear; investigate before disturbing.

7. **CMS BEFORE-triggers can null fields silently** (per memory notes). `events`, `venues`, `personalities` had `sanitize_website_field` triggers. Document in operations.md.

## Operating posture going forward

Per spec rules followed throughout:
- Every destructive op gated on chat confirmation.
- Verification before declaration (zero-callers grep before deletion, etc.).
- Subagents used for read-only inventory to keep main context small.
- Single commit per scope. Rollback = `git revert <sha>`.
- No bot-account commits; all `Co-Authored-By: Claude`.

## CLAUDE.md status

`Dev/web/CLAUDE.md` on `main` already has accurate function/migration counts (no hardcoded numbers). The `Dev/CLAUDE.md` umbrella copy is stale (118 / 435+) — defer to a separate umbrella-repo PR; not landing here.

This file (`docs/consolidation-2026-Q2-final.md`) and the inventory doc are linked from the runbook (`docs/operations.md`) under "Where to find more". Update CLAUDE.md to point to them when the branch lands.

## Open follow-ups (in priority order)

1. **User accepts or rejects ADR 0001.** Without acceptance, MUI/shadcn drift continues.
2. **Push branch + open PR** for review of the 6 commits.
3. **Schedule the 30-day flag-removal sweep:** delete `LEGACY_NEWS_TRIGGER_ENABLED`, both UI sites, and the `fetch-news` edge function on or after **2026-06-01**.
4. **Phase 2 Plan agent run** — caller migration for `background-import-manager` and `ingestion-pipeline` blocks further deletion.
5. **Phase 4 Plan agent run** — schema baseline + rename ADR; needs Supabase MCP access.
