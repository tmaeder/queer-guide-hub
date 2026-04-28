# Risks, open questions, and roadmap

## What is shipped in this PR

- Phase 0 docs: analysis, unified model, migration plan, architecture, API.
- Migration `20260428120000_search_intelligence.sql` introducing `search_synonyms`, `search_settings_versions`, `search_audit_log`, `search_reindex_jobs`, `search_visibility_scores`, plus `record_search_audit` and a `compute_visibility_score` stub. RLS configured.
- Edge function `search-intelligence` with the routes from doc 05 implemented as a single router. Admin-gated via the existing `requireAdmin` helper.
- Frontend admin page `/admin/search-intelligence` (feature-flagged) with tabs: Overview, Indexes, Search Debugger, Synonyms, Settings, Reindex, Audit, Ingestion Quality. Functional: Overview, Synonyms, Search Debugger, Audit. Stubbed-with-clear-state: Settings, Reindex, Ingestion Quality.
- Tests: synonym validation, visibility score shape, page-render smoke test.

## What is intentionally deferred

| Deferred | Why | Where it slots in |
| --- | --- | --- |
| `topic_clusters` table + UI | Not on the critical path; design docs cover it | Phase 2 |
| `unified_tags.name_i18n` | Affects many ingestion paths; needs its own PR | Phase 2 |
| Production `compute_visibility_score` axes | Each axis (tags/geo/images/dates/text/synonyms/queries) has real per-entity logic; the stub returns 0.5 across the board so the contract is testable | Phase 1 follow-up |
| Image embeddings + perceptual hash | Storage + cost decisions outstanding | Phase 3 |
| RRULE / `event_occurrences` | Touches the events ingestion pipeline | Phase 2 |
| Settings drift auto-resolver | Today the UI shows drift; resolution is one-click, but a daily reconcile cron is not yet wired | Phase 1 follow-up |
| Rate limit on edge function writes | `search_audit_log` already records every write; in-function counter is one query away | Phase 1 follow-up |
| Backfill from `meilisearch/configure-indexes.sh` synonyms | Script exists in the plan; running it requires production access | Phase 1 follow-up |

## Risks

1. **Drift between this work and the existing shell-script-driven settings.** Mitigation: the first call to `GET /indexes/:name/settings?source=applied` snapshots Meili into `search_settings_versions`, anchoring history. The Settings tab makes drift visible; nothing is forced.
2. **Migration timestamps.** New table names (`search_*`) collide with no existing tables. Verified at write time. The migration is ordered after the most recent existing migration (the codebase's latest in `supabase/migrations/` is dated 2026-04-25; this one is 2026-04-28 12:00).
3. **`requireAdmin` token type.** The helper accepts service-role tokens for internal calls. The frontend never sees that token; cron jobs that hit `/reindex` will need to use the service role key, which is consistent with project convention.
4. **Tests against Meilisearch.** Unit tests use mocked `fetch` for the Meili admin URL; an integration test against a real Meili requires `MEILISEARCH_URL` + `MEILISEARCH_ADMIN_KEY` in CI, which is not yet provisioned. The tests included here exercise the parts that don't need a live Meili.
5. **Feature flag.** While the flag is off, the admin route renders a placeholder. The edge function is callable directly. This is intentional so admins can curl it for testing, but it means the function should be deployed only to environments where production search is the same one being managed.
6. **Performance of consistency check on large types.** `consistency-check` walks Meili in pages of 1000 IDs. For 50k+ docs the RTT can be 10s+. The endpoint should not be called from a sync UI; the frontend must show a spinner and accept up to 30s.

## Open questions

- Should `search_synonyms.locale` join to a future `locales` table, or stay as a free-form BCP-47 string? (Current: free-form with regex check.)
- Should the read path (`workers/search-proxy`) read synonyms from Postgres directly, or rely on the Meili settings.synonyms map? (Current: Meili map only; simpler, but adds latency to synonym changes.)
- Where to draw the line between "search admin" and "content admin" — e.g., does adding a synonym from a tag detail page route through this function or directly through `tag_aliases`? (Current: parallel; bridge to come in Phase 2.)
- Visibility score axis weights belong in code or in `search_settings_versions`? Doc 02 says configurable; current migration ships them as constants for reproducibility.

## Roadmap

**Phase 1 (next)**: production `compute_visibility_score` per axis; settings drift one-click resolver; Reindex tab live with progress; Ingestion Quality tab live for at least venues + events; rate-limit on writes.

**Phase 2**: `topic_clusters`; `unified_tags.name_i18n`; bridge `tag_aliases` ⇄ `search_synonyms`; `event_occurrences` + recurrence-aware indexing; geo polygons in PostGIS; route-based search.

**Phase 3**: image embeddings + perceptual hash; AI suggestion queue with per-entity diff view; A/B harness for ranking-rule changes; multilingual embedder migration (bge-m3 1024-dim) — depends on the existing follow-up note in `SEARCH_SYSTEM.md`.
