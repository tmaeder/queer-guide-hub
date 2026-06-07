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

**Status:** P1 ✅ shipped (#1475) · P2 ✅ shipped (#1477) · P3 ✅ shipped (#1481).

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

## P3 — Revive-or-retire  ✅ shipped

Investigation corrected one Explore claim: `compute_visibility_score` is **not** a stub — it's a real weighted scorer (tags/geo/images/dates/text/synonyms/clusters). None of the three tabs were broken; all were working-but-unused. Per-tab decisions:

- **Ingestion Quality → revived.** The scorer worked but only ran on-demand. Added `run_visibility_score_batch()` (incremental) + nightly cron `visibility_score_batch` (04:20 UTC) + `search_visibility_worst()` leaderboard RPC + `/visibility/{worst,batch}` routes. IngestionQualityTab gained a worst-scored leaderboard (click→inspect) + "Score next 2,000". Seeded ~9,300 scores (venues avg 0.36, news 0.62).
  - **Bug fixed en route:** `compute_visibility_score` referenced `m.latitude`/`m.longitude` on `marketplace_listings` (no geo columns) — it errored for that type and would have crashed the batch. Marketplace geo is now not-applicable (1.0).
- **Topics → retired.** 0 rows, no automation, no storefront consumer. Deleted TopicsTab + ClusterTagPicker (406 LOC) + tests + `/clusters` CRUD. `topic_clusters` tables kept (scorer's query axis reads them).
- **Suggestions → left dormant.** Full review/apply machinery (493 LOC) kept; revisit when enabling the image-vision producer (separate cost/scope decision).

Follow-up: batch only covers ~9.3k of ~72k entities so far; nightly cron fills the rest. Re-scoring of stale rows not yet implemented (unscored-first only).

## Cross-cutting

- All new RPCs `SECURITY DEFINER` + `GRANT EXECUTE ... authenticated` (RLS helper-grant gotcha)
- Read-only analytics + tiny synonym writes — safe under DB disk constraint
- No new auth surface (reuses edge-function admin gate)

## Follow-ups

**Done (#1486):**
- ✅ **Click-logging → CTR.** `log_search_click()` RPC + search-proxy `/track` click handler back-fill `clicked_entity_id` on the most recent same-session search; Analytics shows real CTR. No frontend change (clicks already hit `/track`). Verified e2e on prod.
- ✅ **Synonym expansion cap (40 terms)** in `expandWithPgSynonyms()` — bounds over-expansion so activating the staged set is safe.
- ✅ **Visibility batch self-maintaining** — stale-rescore (>30d) after unscored exhausted + per-entity fault isolation.

**Resolved — do NOT bulk-activate the 15,130 dormant synonyms.**
Investigated the dormant set directly (not just deferred it). Evidence:
- `notes` = `"auto-bridged from tag_aliases on 2026-04-29"` — they're auto-generated cross-language tag-alias translations, not curated search synonyms.
- Sampling shows mostly off-domain / generic vocabulary: `kohl→cabbage`, `krokiet→croquettes`, `lunettes correctrices→glasses`, `conductor de televisión→host`, `ethanolvergiftung→alcohol poisoning`. A minority are LGBTQ-relevant (`panromantisch→omniromantic`).
- Each row has exactly **1 replacement** (avg 1.0, max 1); 98.7% have terms ≥4 chars (193 short-term rows are the substring-overmatch hazard).
- They were left at `status='approved'` (never `active`) on purpose — activating would inject translation noise into the vector leg of safety-sensitive search.
Conclusion: the dormant set is an auto-bridged tag-alias dump, not a curated synonym layer. Search did **not** regress by ignoring them. Synonyms should be added deliberately via the editor (e.g. from Analytics zero-result queries); if a multilingual layer is wanted later, re-scope the import to LGBTQ/travel-relevant aliases. The 6 hand-curated active rows stay.

**Still open (deliberate):**
- Synonyms cache-bust endpoint + version snapshot/rollback (deferred from P2).
- Visibility coverage: ~13.9k/72k scored; nightly cron fills the rest (self-maintaining).
- Suggestions tab: revive only if the image-vision producer is enabled.
