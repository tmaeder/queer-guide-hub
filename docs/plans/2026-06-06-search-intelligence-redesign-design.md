# Search Intelligence Admin Redesign

**Date:** 2026-06-06
**Route:** `/admin/search-intelligence`
**Approach:** A — "Search Ops Console", phased

## Problem

The page is inverted: it manages data that doesn't exist and ignores data that does.

**3 of 5 tabs run on empty tables (~960 LOC of dead UI):**

| Tab | Backing table | Rows |
|-----|--------------|------|
| Topics | `topic_clusters` | 0 |
| Ingestion Quality | `search_visibility_scores` | 0 |
| Suggestions (493 LOC) | `ai_suggestions` | 0 |

**The two tables with real, fresh data have no admin UI:**

| Table | Rows | Notes |
|-------|------|-------|
| `search_queries` | 5,769 | fresh daily; logs query, n_results, took_ms, had_rewrite, clicked_entity_id, lang, filters |
| `search_synonyms` | 15,136 | all `status='approved', source='imported'`, bulk-loaded once, never curated; drives 88% of queries |

Last 30d: 4,622 searches, **p95 1,593ms** (slow), 88% rewritten, 139 distinct normalized queries (low organic volume → analytics is directional). CTR is **0.0%** because the frontend never writes `clicked_entity_id`.

Page also carries dead Meilisearch types (`IndexesResponse.meili`, `ConsistencyResult.meili_docs`/`orphans_in_meili`) from the decommission.

## Decision

Reorient the page around live data, phased so each phase ships independently.

**Status:** P1 ✅ shipped (PR #1475) · P2 ✅ shipped (PR #1477) · P3 deferred.

---

## P1 — Cleanup + Analytics  ✅ shipped

**Cleanup (zero behavior risk):**
- `src/hooks/useSearchIntelligence.ts`: drop `meili` from `IndexesResponse`, `meili_docs`/`orphans_in_meili` from `ConsistencyResult`
- `SetupTab.test.tsx`: remove `meilisearch-sync`/`meili_configured` legacy fixtures
- grep-sweep remaining dead Meili refs in the page tree

**Analytics tab (read-only, uses existing `search_queries` — no new pipeline):**
- 3 RPCs (`SECURITY DEFINER`, `GRANT EXECUTE ... authenticated`): `search_analytics_summary(p_since,p_until)`, `search_analytics_top_queries(p_since,limit)`, `search_analytics_zero_results(p_since,limit)`
- Exposed via existing `search-intelligence` edge function at `/analytics/*` (keeps routing pattern)
- Widgets:
  1. Time range: 24h / 7d / 30d
  2. KPI strip: searches · zero-result % · p95 latency · rewrite % · CTR (badged "click-logging not wired")
  3. Top queries table (query · count · avg results · avg ms · lang)
  4. Zero-result table — each row has **"Add synonym"** action deep-linking into P2 prefilled (closed loop)
  5. Slow-query view + language split

## P2 — Synonyms editor  ✅ shipped

**Discovery that reframed the phase:** the search-proxy worker only loads synonyms with `status='active'`. Of the 15,136 rows, **only 6 are active** (hand-picked: gay→queer/lgbt, bar→pub…); the other **15,130 sit dormant at `status='approved'`** and never reach live search. So the editor's headline lever is **Activate/Deactivate**, not just editing — that wasn't in the original design.

Shipped:
- RPCs: `admin_synonyms_list` (substring match across terms+replacements, status/locale filter, paginated, returns `{total, rows}`) + `admin_synonyms_counts` (status rollup). SECURITY DEFINER, granted to authenticated.
- `/synonyms` routes on the `search-intelligence` edge function: list / counts / create / update / archive, with `recordAudit` + rate-limit (`synonym.` prefix).
- UI: status-count chips (surfaces the 15,130 dormant) · search + status filter · pagination · Add/Edit dialog (terms, replacements, one-way, locale, indexes, notes, status) · **Activate/Deactivate** · soft Archive.
- P1 loop closed: Analytics zero-result rows → "Add synonym" opens the dialog prefilled.

Deferred (YAGNI):
- **Cache-bust** — activated changes apply within the worker's ~5 min KV TTL (`synonyms:active:v1`), surfaced in the UI. A cross-service bust endpoint was not worth the complexity.
- **Version snapshot/rollback** (`search_settings_versions`) — activation + editing deliver the value; revisit if churn warrants.

## P3 — Revive-or-retire (deferred)

Investigate whether Topics / Ingestion Quality / Suggestions pipelines should run (populate their tables) or be retired with their ~960 LOC. Don't block P1/P2.

## Cross-cutting

- All new RPCs `SECURITY DEFINER` + `GRANT EXECUTE ... authenticated` (RLS helper-grant gotcha)
- Read-only analytics + tiny synonym writes — safe under DB disk constraint
- No new auth surface (reuses edge-function admin gate)

## Out of scope / follow-ups

- Frontend click-logging to populate `clicked_entity_id` → unlocks real CTR (small separate PR)
- **Activate the dormant synonyms** — 15,130 staged `approved` rows are a product decision (bulk-activate vs curate-then-activate); the editor now makes this possible per-row
- Synonyms cache-bust endpoint + version snapshot/rollback (deferred from P2)
- P3 above
