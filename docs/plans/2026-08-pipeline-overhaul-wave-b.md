# Pipeline Overhaul — Wave B playbook (GATED, do not apply blind)

Status: **waiting on soak evidence** (started 2026-08-08). Wave A (P1–P7) is live.
This file is the ready-to-execute plan for the two gated follow-ups. Neither is
a migration in `supabase/migrations/` on purpose — each is gated on live
evidence that needs ~1–2 weeks to accumulate.

## Gate dashboard (check before executing anything below)

```sql
-- 1. Starved-path sentinel: must be ≈ baseline or lower for 7 consecutive days
select pipeline_hygiene_stats()->'stale_pending_by_entity';
-- baseline at introduction: news ~1.9k (pre-existing), marketplace ~0.9k, events ~34, venues ~6

-- 2. Fill-source volume vs DAG-fetch volume (per family, 7 days)
select source_name, count(*), min(created_at)::date, max(created_at)::date
from ingestion_staging where created_at > now() - interval '7 days'
group by 1 order by 2 desc;

-- 3. Search drain health (A2 gate): failed must be 0-ish for 14 days
select * from search_reindex_drain_stats;
```

## B1 — DAG-start schedule retirement (per family, only after its fill cron proves volume)

Order: marketplace → events → venues → news (news LAST — it is the only
family whose DAG is currently the sole processor; converting it needs the
`nw-drain-*` ladder below in the same migration).

Per family, one migration (pattern `20260813100000`: registry-disable FIRST,
then guarded unschedule):
1. Add the family's fill cron(s) if not yet present:
   - `mp-fill-awin` / `mp-fill-etsy` / `mp-fill-shopify` daily (mirror the DAG
     source-node configs captured in `pipeline_definitions` marketplace v9)
   - `ev-fill-eventbrite` / `ev-fill-ticketmaster` 6-hourly (prefilter is
     default-ON in source-ticketmaster since P3a)
   - `news-fill-rss` hourly → `source-rss-news` `{max_feeds_per_run: 15}`
2. 7 days later (fill volume ≥ prior DAG-fetch volume, sentinel flat):
   disable + unschedule the DAG-start cron (`wf-marketplace-ingestion`,
   `pipeline-event-ingestion`, `pipeline-venue-ingestion`, `wf-news-pipeline`),
   set `pipeline_definitions.schedule = NULL` for that family (Builder then
   shows "manual"), and null the matching `workflow_definitions.schedule`.
3. News additionally needs the drain ladder BEFORE its DAG retires
   (`nw-drain-extract/sanitize/validate/dedup/enrich/quality-enhance/quality/
   review` staggered + SQL commit cron calling `news_commit_staging_batch`
   per job — mirror the reordered v10 stage list; batch sizes from the DAG
   node configs). The 546-failure isolation win only materializes here.
4. Wave-2 families (hotel/personality/city/country/tags/villages/restrooms):
   retire their weekly/daily DAG schedules only after the first four prove out.
   `social-media-ingestion` stays a scheduled DAG PERMANENTLY (documented
   exception: media-process/safety-relevance ordering + force_review only
   exist there).
5. After each retirement: `scripts/check-pipeline-health.mjs` `dailyExpected`
   list must be trimmed in the same PR (else the daily job warns forever).

## B2 — Search drain A2 (upsert-only, kills the residual HNSW churn)

Gate: **14 days of `search_reindex_drain_stats.total_failed` ≈ 0 only.**
The SET-list precondition is DONE: migration `20260818110000` normalized all
14 indexers' ON CONFLICT SET lists to full INSERT coverage (audit found real
drift, e.g. groups' mutable `slug` missing; harmless today because the A1
drain deletes-then-inserts so the SET arm never fires — which is also why
normalizing early was zero-risk). Its self-audit hard-fails on residual
drift; validated against prod in a rolled-back txn (residual_drift=0).

Then one migration: `CREATE OR REPLACE search_reindex_drain` — drop the
per-entity doc DELETE; call the indexer (they are INSERT … ON CONFLICT DO
UPDATE); afterwards delete docs whose `updated_at < transaction_timestamp()`
for the processed (entity_type, entity_id) pairs (an indexer that skipped the
row — no longer qualifies — leaves the old timestamp, so the sweep removes
it). Effect: no doc delete → no `search_embeddings` FK cascade → no HNSW
delete/insert unless the embedding actually changed. Rollback: re-create the
A1 body (delete-then-index) — one statement.

## B3 — leftover small items (ALL DONE 2026-08-08)

- ~~`marketplace-relevance` → adopt `llm_budget_consume`~~ — done: probe with
  n=0 tightens the legacy budget, actual `llm_used` recorded post-run;
  fail-open to the ingestion_events count.
- ~~Legacy `workflow_definitions` rows~~ — liveness measured live: 16 of 19
  rows run within 30d or are cron-referenced. `marketplace-reingest` deleted
  (disabled, zero runs ever); `news-quality-backfill` + `send-bulk-email`
  disabled (zero runs ever, zero repo/cron refs) — delete after 30-day soak.
- ~~`"marketplace-drain"` quoted-name duplicate~~ — deleted by id (0 runs).
- 6 orphan deployed `import-*` edge fns deleted from Supabase
  (`supabase functions delete`); repo was already clean.
