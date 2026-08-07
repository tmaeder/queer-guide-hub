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

## Phase outcome tracking

| Metric | Before | After (fill in) |
|---|---|---|
| 300-row entity batch UPDATE | 14.6 s | |
| news DAG failure rate (14d) | 49% | |
| ticketmaster rows staged/mo | 10,605 | |
| dedup_review_queue open | 649 | |
| staging pending_review | 505 | |
| active pg_cron jobs | 197 | |
| search_embeddings size | 1,449 MB | |
| workflow_runs size | 2,823 MB | |
