# SQL unused-object evidence pass — 2026-10-03

Follow-up to `2026-10-02-tech-debt-cleanup.md`, which skipped SQL/schema cleanup for lack of live evidence.
Outcome: **no migration written.** No candidate met "zero readers in every source" while staying clear of
safety_gated / dedup / ingest / cron territory.

## Method and window

- Prod `xqeacpakadqfxjxjcewc`. `pg_postmaster_start_time()` = 2026-09-05 14:28Z, `pg_stat_database.stats_reset` NULL,
  so every `idx_scan = 0` below means "not scanned in ~28 days", not "never". Monthly or rarer jobs may not have run.
- Sources: `get_advisors` (performance), `pg_stat_user_indexes` + `pg_class` sizes, `pg_constraint` (FK / constraint-backing),
  `pg_proc.prosrc`, `cron.job.command`, `admin_automations.action`, `pg_trigger`, and `git grep` over the whole repo
  (migrations and prior audit docs excluded when counting readers).
- Advisor reported 86 `unused_index` findings; 81 are non-PK, non-unique in `public`.

## Totals

| Group | Count | Size |
|---|---|---|
| Unused, non-PK/unique | 81 | 52 MB |
| of which lead a foreign key | 31 | ~6 MB |
| of which non-FK | 50 | 46 MB |
| non-FK, <=16 kB each | ~40 | ~600 kB |
| non-FK, >16 kB | 10 | ~45 MB (38 MB is one index) |

No index name appears anywhere outside `supabase/migrations/` and prior audit docs. That proves little: queries reference
columns, not index names, so function bodies were the real reader test.

## Ranked candidates and why each was not dropped

1. `search_documents_geog_gix` (38 MB, GiST on `geog`). Read by `search_hybrid`, `search_facets`, `events_in_window`,
   `get_recommendations` (pg_proc scan). Zero scans only means no geo-filtered query chose it in 28 days. Search + safety-gated
   path. **Keep.** Open question (not checked): whether `workers/search-proxy` ever sends lat/lng/radius.
2. `idx_events_quality_description_fingerprint` (5 MB), `idx_venue_quality_tier_history_venue_changed` (3 MB),
   `idx_event_quality_current_issues` (2 MB, GIN), `idx_venue_quality_snapshots_stale` (1 MB). Tables are read/written by
   `run_event_quality_scan`, `event_quality_snapshot`, `recompute_venue_quality_snapshot`, `venue_quality_dashboard`,
   `reconcile_venue_quality_queue` and others: quality pipelines. **Human sign-off needed**; ~11 MB total. I did not confirm which
   of these functions are cron-driven, only that they exist and reference the tables.
3. `marketplace_governance_resolutions_listing_idx` (1.8 MB). Created on purpose by `20260928150913_governance_resolution_fk_index`
   to cover an FK. Dropping re-raises `unindexed_foreign_keys` and slows listing deletes. **Keep.** (Table has no function/cron/trigger
   readers, but it is an ingest/governance table written by one migration and read via a JSON snapshot at `20260928145535:462`.)
4. `idx_crc_disagrees` (16 kB, partial `agrees IS FALSE`) on `country_rights_corroboration`. Table has 250 rows (7 disagree), so the
   planner will never prefer the index; functionally dead. But readers exist (`country_rights_disagreements` RPC,
   `.github/workflows/rights-corroboration.yml`, `20260924043359` line ~630) and the table is the criminalisation second-opinion
   feeding gate fields. Saves 16 kB. **Not worth a sign-off request.**
5. 31 FK-leading unused indexes: **keep**; each is what keeps `unindexed_foreign_keys` quiet and makes parent deletes cheap.
6. `idx_hotels_safety_gated`, `idx_milestones_safety_gated` (16 kB each): safety_gated territory, excluded.
7. ~40 other indexes <=16 kB on small tables (mailbox, trips, wishlists, scraper_*): total ~600 kB. Not worth the review cost.

## Conclusion

Reclaimable without touching restricted areas: effectively nothing (<1 MB). The only meaningful bytes are #1 (needs a search
usage check) and #2 (needs pipeline-owner sign-off, ~11 MB of a multi-GB DB). Tables and functions were not evaluated for drops.

## Not examined

Other advisor findings (`unindexed_foreign_keys`, `no_primary_key`, `multiple_permissive_policies`); unused tables/RPCs/edge functions.
