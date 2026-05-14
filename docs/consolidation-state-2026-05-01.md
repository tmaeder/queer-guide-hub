# Consolidation state — 2026-05-01

Phase 0 inventory for the queer.guide consolidation sprint. Source of truth for Phases 1–6. Generated from three parallel `Explore` subagents over `/Users/tobiasmaeder/QG/Dev/`.

**Repo layout note.** Two repos live nested:
- **Outer / "umbrella"** at `/Users/tobiasmaeder/QG/` — scraper, infra, CF workers (`email-ingest`, `scraper-api`, `telegram-ingest`, etc.). Tracks `Dev/CLAUDE.md` but ignores `Dev/web/*`.
- **Inner / "queer-guide-hub"** at `/Users/tobiasmaeder/QG/Dev/web/` (this file lives here) — React app, Supabase functions, Supabase migrations, app-side workers (`ingest`, `search-proxy`, `snapshot-archiver`, `submit`).

Some "missing worker" callouts to CLAUDE.md across two earlier sessions were drift artifacts of the dual-repo split, not actual gaps.

---

## 1. Inventory

### Edge functions (queer-guide-hub repo)
- **Total directories on disk:** 202
- **Tracked in git on `main`:** 291 files across `supabase/functions/`
- **10 most recently modified (mtime):**
  | Function | mtime |
  |---|---|
  | `_shared` | May 1 13:35 |
  | `pipeline-media-process` | Apr 30 22:15 |
  | `pipeline-executor` | Apr 30 21:43 |
  | `translate-i18n-batch` | Apr 30 10:45 |
  | `source-csv-upload` | Apr 30 10:45 |
  | `search-intelligence` | Apr 30 10:45 |
  | `pipeline-validate` | Apr 30 10:45 |
  | `meilisearch-sync` | Apr 30 10:45 |
  | `import-ticketmaster-events` | Apr 30 10:45 |
  | `import-eventbrite-events` | Apr 30 10:45 |

### Migrations
- **Total on disk:** 648 (local user copy includes uncommitted) / **645 on `main`**
- **10 most recent (by filename):**
  - `20260501010100_personality_internal_notes_revoke_algolia.sql`
  - `20260501010000_relax_events_website_sanitizer.sql`
  - `20260501010000_personality_internal_notes.sql`
  - `20260501000000_cms_audit_log_insert_policy.sql`
  - `20260430030000_personalities_death_place.sql`
  - `20260430020000_personalities_cause_of_death.sql`
  - `20260430010000_feedback_routine_local_runner.sql`
  - `20260430000300_feedback_routine_advisor_fixes.sql`
  - `20260430000200_backfill_feedback_handoffs.sql`
  - `drafts/` (directory)

### Frontend
- **Files in `src/components/`:** 642
- **Importing `@mui/material`:** 502
- **Importing `@/components/ui` (shadcn):** 449
- **Importing BOTH:** **356** — high overlap, real consolidation cost is ~146 net switches plus the 356 hybrids
- **10 most recently modified components (May 1 13:35):**
  `search-input-typed.tsx`, `TextType.tsx`, `AdminRouteGuard.tsx`, `UniversalSearchBar.tsx`, `SearchFiltersPanel.tsx`, `BasicInfoTab.tsx`, `MediaLibrary.tsx`, `CMSDuplicateManager.tsx`, `SecurityMonitoringDashboard.tsx`, `ImageOptimizationManager.tsx`

### Workers (across both repos)
| Path | Repo | wrangler config |
|---|---|---|
| `Dev/web/workers/ingest/` | queer-guide-hub | check on disk |
| `Dev/web/workers/search-proxy/` | queer-guide-hub | yes |
| `Dev/web/workers/snapshot-archiver/` | queer-guide-hub | yes |
| `Dev/web/workers/submit/` | queer-guide-hub | check on disk |
| `Dev/workers/email-ingest/` | umbrella | yes |
| `Dev/workers/scraper-api/` | umbrella | yes |
| `Dev/workers/telegram-ingest/` | umbrella | yes |
| `Dev/geo-boundaries-worker/` | umbrella | yes |
| `Dev/tiles-worker/` | umbrella | no |
| `Dev/web/functions/api/` | queer-guide-hub | no (Pages Functions) |

### Tests
- Unit (`*.test.{ts,tsx}`, `*.spec.ts` under `web/src/`): **250 files**
- Playwright (`web/e2e/`): **21 files**

---

## 2. Deprecation surface

### HTTP 410 stub functions (Phase 1a deletion candidates)

| Function | Stub mtime | Replacement |
|---|---|---|
| `algolia-search` | Apr 8 | `/functions/v1/search` |
| `background-import-manager` | Apr 12 | `pipeline-executor` + source-adapter nodes |
| `fetch-ilga-data` | Apr 8 | `source-ilga` via `pipeline-executor` |
| `ingestion-pipeline` | Apr 12 | `pipeline-executor` with composable nodes |
| `trip-ical` | Apr 18 | (returns 410 only when share token expires — **not a stub**, keep) |

**4 candidates ≥30 days old as of 2026-05-01.** Each needs zero-callers grep before deletion.

### Deprecated-by-comment (not stubs)
- `search/index.ts` — DEPRECATED comment, but **still has live caller** via `universal_search` RPC. Cannot delete.
- `pipeline-deduplicate` line 238: internal naming, false positive
- `pipeline-commit` line 11: internal legacy code-path comment, keep
- `source-rss-news`: "Replaces fetch-news (v485)" — informational
- `travel-deals` lines 9–10: API-shape advisory

### Legacy migration stubs (`*legacy*.sql`)
189 files plus 4 specialized:
- `20260429310000_disable_legacy_fetch_news_cron.sql`
- `20260417200000_drop_legacy_reservations.sql` — drops `bookings`, `trip_reservations`
- `20260422030000_delete_legacy_template_pipelines.sql`
- `20260410070803_legacy.sql` — community submissions / feedback screenshots

Major schema objects in legacy migrations + reference status:

| Object | Still referenced | First reference |
|---|---|---|
| `venues` | yes (1221) | `web/src/App.tsx` |
| `events` | yes (1498) | `web/src/App.tsx` |
| `profiles` | yes (273) | `web/src/utils/queryOptimizations.ts` |
| `marketplace_listings` | yes (83) | `web/src/config/contentTypeRegistry.ts` |
| `community_posts` | yes (30) | `web/src/integrations/supabase/types.ts` |
| `trip_reviews` | **NO** | — |

**Phase 4 input:** `trip_reviews` is the only orphan. Most "legacy" migrations created still-active core tables and must be archived (renamed under `_archive/`), not deleted.

### `fetch-news` status (correction to CLAUDE.md)
- Function is **still functional** (not a 410 stub).
- **Cron disabled** by `20260429310000_disable_legacy_fetch_news_cron.sql`.
- **Manual UI callers still active:**
  - `web/src/components/admin/NewsSourcesManager.tsx`
  - `web/src/pages/AdminNewsSources.tsx`
  - `web/src/hooks/useBackgroundImports.tsx`
- The nested CLAUDE.md (line 47) **already documents this correctly** as "Legacy (TODO ARCH-3)". Phase 1b feature-flag work IS still relevant.

---

## 3. Operational state

### Cron schedules (47 total)

**SQL pg_cron (high-frequency, every 5–30 min):**
- `pipeline-venue-{validate,dedup,commit}` `*/5 * * * *` (staggered offsets)
- `pipeline-event-{validate,dedup,commit}` `*/5 * * * *` (staggered offsets)
- `social-ingestion` `*/10 * * * *`
- `data-ops-alerts` `*/30 * * * *`
- `push-subscriptions` `2-59/5 * * * *`

**Hourly:** `source-quality-alerts` (`5,35`), `advisor-sync-cron` (`17`), `refresh-source-reliability` (`17`), `hourly-task` (`0`), `geo-link-content` (`30`), `fetch-news` (`0` — should be unscheduled per migration `20260429310000`; verify).

**Daily UTC (early morning):**
- 02:00 — `anonymize-location-data`, `import-foursquare-venues`, `import-ilga-data`, `date-normalizer`
- 03:00 — `run-automated-reviews`, `contact-normalizer`
- 03:15 — `event-occurrences-expansion`, GitHub Actions full scrape
- 03:27 — `suggest-story-from-ids-and-titler`
- 03:30 — `geo-enricher`
- 04:00 — `content-quality-checker`
- 04:30 — `detect-stale-venues`, `search-intelligence-reconcile`, `auto-tagger`
- 05:00 — `geo-validate`
- 05:00–05:40 (staggered every 5 min) — automation modules: `auto-tagger`, `content-classifier`, `content-validator`, `data-normalizer`, `dedup-checker`, `event-validator`, `geo-enricher`, `link-sanitizer`
- 06:00 — `legacy-cron`, GH Actions `pipeline-health.yml`
- 06:15 — GH Actions `e2e-i18n.yml`
- 06:30 — GH Actions `a11y.yml`
- 08:00 — `workflow-dispatcher-health`
- 09:03 — `push-subscriptions-health`

**Weekly (Sun):** `tags-ingestion` 05:00, `sync-content-links` 04:00, `validate-links` 04:30, `link-validator-full` 05:00, `snapshot-archiver` (wrangler) 04:00

**≤6h:** `validate-links-recheck`, `link-validator-incremental` every 6h, GH Actions hourly events scrape

**Wrangler triggers:**
- `snapshot-archiver` — `0 4 * * SUN` (weekly)
- **`ingest-worker` — `* * * * *` (every minute) — verify intent**

**Open:** `legacy-cron` daily 06:00 — what does it do? Phase 1 review.

### Direct writes to `news_articles`
**No app-layer bypasses.** Only schema migrations:
- `20260409120000_add_slugs_to_content_tables.sql:114,157` — slug backfill
- `20260415170500_unified_tag_dedup.sql:153` — tag dedup migration

`fetch-news` writes via the canonical `news_commit_staging_batch` RPC, not direct upsert.

### Legacy search references
- `web/src/integrations/supabase/types.ts:17989` — generated `universal_search` type def
- `web/supabase/functions/function-monitor/index.ts:30-31` — monitors `algolia-search` + `algolia-sync` (will false-alert post-deletion; update needed in Phase 1a)
- **`web/supabase/functions/search/index.ts:78-79`** — **active** `supabase.rpc('universal_search', ...)` call. Meilisearch migration incomplete; `search` function still falls back to PG FTS.

### Sentry init
- `web/src/sentry.ts` — `Sentry.init()` ✓
- `web/src/main.tsx` — imports `./sentry` ✓
- **Edge functions — none initialize Sentry.** Phase 5d gap confirmed.

---

## CLAUDE.md drift status

`Dev/web/CLAUDE.md` on `main` is already correct (no hardcoded function/migration counts; workers list is accurate for queer-guide-hub-side workers).

`Dev/CLAUDE.md` (umbrella) on its current branches still shows "118 Deno edge functions" and "435+ migrations" — out of date but lives in a different repo and on a different active branch. Defer fix to a separate umbrella-repo PR.

---

## Discovered issues (out of scope; logged for later)

- `function-monitor/index.ts` references `algolia-sync` + `algolia-search` — will false-alert once Phase 1a deletes them. Same-PR fix needed.
- `ingest-worker` wrangler cron `* * * * *` (every minute) — verify intent.
- `legacy-cron` daily 06:00 — unclear what it does.
- `Dev/web/.git/AUTO_MERGE` artifact present (not an active merge; safe to leave).
- iCloud path: repo NOT under `~/Library/Mobile Documents/`. Phase 5a iCloud warning unnecessary.

---

## Phase 1+ readiness

| Phase | Ready? | Blocker |
|---|---|---|
| **1a** delete 4 × 410 stubs + update function-monitor | ✅ | none — proceed after gate + zero-callers grep |
| **1b** flag `fetch-news` UI triggers | ✅ | needs UI feature-flag implementation |
| **1c** archive legacy SQL stubs | ⚠️ partial | most legacy files create active tables; only `trip_reviews` clearly orphan |
| **2** consolidate `source-*` to `source-fetch` | ⚠️ | needs `Plan` agent run; pipeline already half-DAG-ified |
| **3** UI library ADR | ✅ | data ready (502/449/356 split) |
| **4** migration squash | ⚠️ | requires production schema dump (Supabase MCP) |
| **5a** iCloud move | ❌ skip | not in iCloud |
| **5b** restore 3 e2e tests | ✅ | 21 specs exist, 3 to revive + rest skip/delete |
| **5c** runbook | ✅ | inventory in this doc covers most |
| **5d** Sentry SLO | ⚠️ | edge function init missing (gap confirmed) |
