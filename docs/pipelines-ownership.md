# Pipeline Ownership & SLO

Single source of truth for every scheduled pipeline / workflow in the
`xqeacpakadqfxjxjcewc` Supabase project. Update when adding, removing,
or reassigning a pipeline. Audited 2026-04-20 against `cron.job`,
`pipeline_definitions`, and `workflow_definitions`.

Status legend:
- **live**: enabled and firing on schedule
- **manual**: enabled, no cron
- **blocked**: enabled but failing on an external dependency
- **paused**: `is_enabled=false` pending fix
- **template**: `is_template=true`, always disabled

## Ingestion pipelines (`pipeline_definitions`)

| Pipeline | Status | Cron | SLO | Upstream | Downstream |
|---|---|---|---|---|---|
| news-ingestion | live | `0 * * * *` via `wf-news-pipeline` | ≥ 95% success / 24h | `source-rss-news` + `news_sources` | `news_articles`, meilisearch `news` index |
| marketplace-ingestion | blocked | `0 4 * * *` via `wf-marketplace-ingestion` | daily run OK | AWIN / Shopify / Etsy APIs | `marketplace_products`, R2 image bucket, FX rates |
| personality-ingestion | manual | — | manual | CSV upload via admin UI | `personalities` |
| events-ingestion-bulletproof | manual | — | manual | Eventbrite / Ticketmaster / GayCities / web scrape | `events` |
| hotel-ingestion-pipeline | manual | — | manual | Spartacus / MisterB&B / Foursquare | `venues` (accommodation_type) |
| city-ingestion | paused | — (was `7 * * * *`) | — | GeoNames + CSV | `cities` |
| country-ingestion | paused | — (was `45 3 * * *`) | — | REST Countries | `countries` |
| venue-ingestion-unified | template | — | — | — | — |
| event-ingestion-unified | template | — | — | — | — |
| news-ingestion-pipeline | template | — | — | — | — |
| reference-data-pipeline | template | — | — | — | — |
| venue-import-pipeline | template | — | — | — | — |
| event-scrape-pipeline | template | — | — | — | — |
| csv-upload-pipeline | template | — | — | — | — |

Blocked reasons (see `description` column for canonical text):
- `marketplace-ingestion`: `AWIN_FEED_URL` edge-function secret missing.
- `city-ingestion`: `source-csv-upload` node errors `fileUrl is required` even when unused in DAG context.
- `country-ingestion`: Wolfram Alpha auth invalid.

## Workflows (`workflow_definitions`)

| Workflow | Status | Cron | Notes |
|---|---|---|---|
| pipeline-executor | live | — | DAG engine; consumed off `pipeline_steps` queue |
| workflow-dispatcher (edge fn) | live | `* * * * *` | Consumes every pgmq queue |
| news-pipeline | live | `0 * * * *` | Canonical news trigger (see CLAUDE.md) |
| marketplace-ingestion (wf) | live | `0 4 * * *` | Thin trigger for pipeline of same name |
| marketplace-fx-sync | live | `13 6 * * *` | Refreshes `fx_rates` |
| marketplace-link-checker | live | `7 3 * * 1` | Weekly link-rot sweep |
| geo-link-content | live | `30 * * * *` | Geo backfill; 1/1 success |
| import-ilga-data | live | `0 2 * * *` | ILGA legal DB sync |
| import-rest-countries-daily | live | `45 3 * * *` | Same cadence as country-ingestion pipeline |
| validate-links-recheck | live | `0 */6 * * *` | Re-probes low-confidence links |
| validate-links-weekly | live | `30 4 * * 0` | Full link audit |
| sync-content-links | live | `0 4 * * 0` | Weekly link sync |
| run-automated-reviews | live | `15 3 * * *` | Staggered off 03:00 |
| scrape-events-daily | live | `0 6 * * *` | Main daily event scrape |
| scrape-web-sources | live | `45 3 * * 0` | Staggered off 03:00 Sun |
| health-check | never-run | `0 8 * * *` | Verify edge function deployed |
| enrich_entity | manual | — | Generic param-driven enricher |
| automation-auto-tagger | paused-cron | manual only | Dispatcher auth issue; cron removed |
| automation-content-classifier | paused-cron | manual only | Dispatcher auth issue; cron removed |
| automation-content-validator | paused-cron | manual only | Dispatcher auth issue; cron removed |
| automation-data-normalizer | paused-cron | manual only | Dispatcher auth issue; cron removed |
| automation-dedup-checker | paused-cron | manual only | Dispatcher auth issue; cron removed |
| automation-event-validator | paused-cron | manual only | Dispatcher auth issue; cron removed |
| automation-geo-enricher | paused-cron | manual only | Dispatcher auth issue; cron removed |
| automation-link-sanitizer | paused-cron | manual only | Dispatcher auth issue; cron removed |
| enrich-wolfram-cities | deprecated | — | Use `enrich_entity` with content_type=city |
| enrich-wolfram-countries | deprecated | — | Use `enrich_entity` with content_type=country |
| enrich-wolfram-tags | deprecated | — | Use `enrich_entity` with content_type=tag |
| scrape-gaycities-events | deprecated | — | Use `bulk-scrape-events` with source=gaycities |
| fetch-news | disabled | — | Superseded by news-ingestion pipeline |
| ingestion-pipeline | disabled | — | Legacy stub |

## Observability

- `reap_stuck_pipeline_runs()` — cron `*/5 * * * *`. Fails runs exceeding `timeout_seconds`.
- `check_pipeline_health()` — cron `*/15 * * * *`. Writes to `pipeline_health_alerts`. Alerts on:
  - `dead_letter_backlog` when queue > 500.
  - `consecutive_failures` when a pipeline's last ≥2 runs (48h window) all non-completed.
  - Auto-resolves when the condition clears.
- `data-ops-alerts` — cron `*/30 * * * *`. Project-specific domain alerts.

## Open operational asks

These cannot be fixed from SQL. Track until cleared.

1. Set `AWIN_FEED_URL` edge-function secret → unblocks marketplace-ingestion.
2. Rotate Wolfram Alpha creds → unblocks country-ingestion + any manual `enrich_entity` Wolfram runs.
3. Fix `workflow-dispatcher` service-role auth → re-enables all automation-* crons.
4. Patch `source-csv-upload` node to no-op when `fileUrl` is absent → unblocks city-ingestion.
5. Verify `health-check` edge function is deployed and returns 200 → will produce runs daily at 08:00.
6. Re-add pg_cron triggers for city/country pipelines once 2 & 4 are resolved.
