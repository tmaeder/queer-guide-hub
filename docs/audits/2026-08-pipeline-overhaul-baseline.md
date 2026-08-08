# Pipeline Overhaul — Live Baseline (captured 2026-08-07)

Read-only snapshot of prod (`xqeacpakadqfxjxjcewc`) before the pipeline overhaul phases land.
Plan: `.claude/plans` (session) — phases P1..P8. Update the "after" column as phases deploy.

## Orchestration inventory

- pg_cron: **197 active jobs**. Every-minute: `workflow-dispatcher-1min`, `push-dm`, `cms-scheduled-publish`. News satellites: ~10 crons.
- `pipeline_definitions`: 20 DAGs (news v9, marketplace v8, venue v9, events v7 + 5 marketplace onboarding variants, incl. a stray literal `"marketplace-drain"` name with embedded quotes).
- `admin_automations`: 220 enabled / 5 disabled. `dedup_truth_sweep` mode = `queue_only`.
- pgmq queues live: `pipeline_steps`, `dead_letter`, `enrichment_queue` (legacy three already dropped).
- `pipeline_node_types`: generic slugs (`normalizer`, `validator`, `deduplicator`, `quality-scorer`, `review-gate`, `committer`, `embedding-generator`→populate-embeddings) **ARE registered live** (outside migrations). `geo-linker`/`ai-tagger`/`ai-enhancer`/`web-scraper` are NOT registered (silent no-op if referenced).

## Health / failure baselines (14 days to 2026-08-07)

| Pipeline (`pipeline_runs`) | completed | failed |
|---|---|---|
| news-ingestion (hourly) | 170 | **166 (49%)** — source-rss-news HTTP 546 ×102, enrich 504 ×36, reaped ×17, staging JSON ×11 |
| social-media-ingestion (*/30) | 637 | 34 |
| events-ingestion-bulletproof (6-hourly) | 62 | 2 |
| marketplace-ingestion (daily) | 16 | 2 |
| venue-ingestion-unified (daily) | 16 | 3 |
| hotel / personality (daily) | 13 each | 1 each |

## Staging throughput (30 days)

| target_table | committed/inserted | rejected | pending |
|---|---|---|---|
| events | 14 | **11,275** (10,605 = ticketmaster, approved+unique, killed by LLM relevance at review-gate) | 32 |
| news_articles | 7,801 | 3,861 | 1,985 |
| marketplace_listings | 12,772 | 3,797 | 1,067 |
| venues | 0 | 0 | 6 (fill side dead) |

All-time `ingestion_staging`: ~330k rows / 1.7 GB (events 96% rejected, news 74% rejected).

## Search sync (the write brake)

- One `search_documents_sync()` trigger fn (13-type CASE: venue, event, city, country, news, marketplace, personality, tag, queer_village, group, organization, milestone, guide; `landmark` arg passed by geo_places triggers has **no CASE branch** → delete-only, reindex happens via `search_documents_sync_landmark_profile()` on the profile table).
- Separate inline fns kept out of P1 scope: `search_documents_sync_embedding` (content_embeddings), `search_documents_sync_landmark_profile` (geo_landmark_profiles).
- Churn: `search_documents` 1.88M ins / 1.75M del on 103k live docs; `search_embeddings` 1.12M ins / 1.14M del on 100k rows (1,449 MB). Doc DELETE cascades into `search_embeddings` (FK) and `trg_sd_pull_embedding` re-inserts → HNSW delete+insert per entity write.
- Measured: 300-row events UPDATE = 14.6 s, 13.8 s inside the trigger.

## Disk (top ops tables)

content_embeddings 3,375 MB · workflow_runs 2,823 MB (84k rows) · ingestion_staging 1,688 MB · search_embeddings 1,449 MB · ingestion_events 454 MB (473k rows) · tag_change_log 410 MB · search_documents 405 MB · ai_suggestions 150 MB · enrichment_log 126 MB.

## Review queues

staging pending_review 505 · dedup_review_queue open 649 (marketplace 397, venue 200, personality 46 — personalities stay queued BY DESIGN, namesake/outing risk) · city/venue/editorial/org-link ≈ 0. `run_staging_auto_reject_stale` live (30d, 5000/run).

## LLM volumes (approx/day)

marketplace-relevance ~800 (capped, saturated) · city-agentic ~111 (70B) · event-agentic ~37 (70B) · enrich-news ≤25/hour · **marketplace-description-enhance: 70B default on `*/5` cron, uncapped** · news enriched-then-rejected ≈ 61 rows/day × 2 calls.

## Phase outcome tracking (after = 2026-08-08, ~14h post-deploy)

| Metric | Before | After |
|---|---|---|
| 300-row entity batch UPDATE | 14.6 s | **0.96 s** (15×; queue+drain, 12,547 reindexes / 0 failures first night) |
| news DAG failure rate | 49% (14d) | **8%** (1/12 last 12h; the 1 = transient validate timeout, not the reorder) |
| ticketmaster staged | 10,605/mo junk, 13 committed | prefiltered at source: ~214/12h ALL genuinely queer-relevant; **now actually commit** (the event_missing_title shape bug they exposed is fixed) |
| dedup_review_queue open | 649 | **249** (venue 200 @0.75–0.85 + personality 46 by-design + city 3 — only genuine ambiguity remains) |
| staging pending_review | 505 | 599 (prefiltered TM events now reach review; trust-tier gate live) |
| active pg_cron jobs | 197 | 222 — count UP this wave (drains/fills/sentinels added); the REDUCTION lands with Wave B DAG-start retirement. Scheduled *processing* per family already 1× (mp-drain-commit retired, relevance 8→3/hr, marketplace no longer triple-scheduled) |
| search_embeddings size | 1,449 MB | unchanged until A2 (gated: 14d zero-fail + indexer SET-list audit) |
| workflow_runs size | 2,823 MB | retention live (completed 7d, failed 30d, jsonb stripped >48h) — shrinks via autovacuum over days |

Post-deploy discoveries (validated + fixed same-day, migration `20260818100000`):
1. **Event commit shape bug** — the REAL killer of adapter events all along: commit RPC read `title`/`start_date`/`ticket_url` while the source-adapter contract emits `name`/`dates.{start,end}`/`urls[0]`, plus full-text country ("United States Of America") violating `events_country_iso2_check`. Every adapter event died at commit; the P3a prefilter surfaced it by staging 214 real queer events that then got rejected. Patched by string surgery on the live body; probe committed a real event in a rolled-back txn.
2. **`merge_entities` dispatcher was anon-executable** with a fail-open null-actor guard (pre-existing; the 20260806130000 core lockdown missed the dispatcher) — an anon PostgREST call could have merged two PERSONALITIES. Revoked from PUBLIC/anon; authenticated stays (in-function admin check), cron/service paths unchanged.
3. **`staging_rejected_purge` first run timed out** — FK-nullify on unindexed `scraper_dedupe_decisions.staging_id` (60k-row seq scan per delete). Indexed + per-run bound lowered.
