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

---

## P1 — Cleanup + Analytics

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

## P2 — Synonyms editor

Job: browse/search/fix a 15k static set + add new ones from failed queries (not a moderation queue — nothing pending).

- RPCs via `search-intelligence` edge function `/synonyms/*`: paginated list/search (term ILIKE + locale + status), upsert, soft-archive, version-snapshot
- UI: search + locale filter · row `terms → replacements` (↔ vs one-way) · Add/Edit dialog · soft-archive · version bar (snapshot + diff + rollback via existing `search_settings_versions`, `channel='synonyms'`)
- Entry point from Analytics zero-result rows (prefilled add)
- Verify: search-proxy reads synonyms live from Postgres → edits apply without worker redeploy; confirm cache TTL during build

## P3 — Revive-or-retire (deferred)

Investigate whether Topics / Ingestion Quality / Suggestions pipelines should run (populate their tables) or be retired with their ~960 LOC. Don't block P1/P2.

## Cross-cutting

- All new RPCs `SECURITY DEFINER` + `GRANT EXECUTE ... authenticated` (RLS helper-grant gotcha)
- Read-only analytics + tiny synonym writes — safe under DB disk constraint
- No new auth surface (reuses edge-function admin gate)

## Out of scope / follow-ups

- Frontend click-logging to populate `clicked_entity_id` → unlocks real CTR (small separate PR)
- P3 above
