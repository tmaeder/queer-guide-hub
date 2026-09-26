# Automation logic audit — 2026-09-26

## Outcome

The production scheduler now has 341 registry rows: 312 enabled and 29 paused.
Every live `cron.job` has a matching registry row, every enabled cron-backed row
has a live job with the same schedule, no retired/completed row is scheduled,
and no automation remains auto-paused.

The audit evaluated registry state, live pg_cron state, seven-day run evidence,
HTTP response bodies, function selection predicates, remaining backlog, retry
behaviour, and scheduler concurrency. A zero `items_changed` counter was not
treated as proof of idleness when the job's own response showed work.

## Logic changes

### Consolidated

- Five weekly milestone quality stages are now one
  `milestone_quality_maintenance` schedule. The supervisor retains bounded
  stage calls, catches errors per stage, continues remaining stages, and returns
  a named result for geography, categories, editorial review, topics, and
  duplicate detection.
- `push_dm` and `push_next_item` are now one `push_realtime` five-minute poll.
  The Edge Function runs both handlers concurrently and isolates failures.
  This removes the every-minute DM poll while preserving acceptable notification
  latency. The daily document-expiry job remains separate because its cadence
  and workload are different.

### Repaired

- `profession_facets_refresh` now refreshes
  `api_cache.personality_profession_facets`; `public` is only its façade view.
- `tag_usage_summary_refresh` now refreshes
  `api_cache.tag_usage_summary`; `public` is only its façade view.
- `sync_supabase_advisors_hourly` was manually verified healthy, re-armed, and
  reduced to daily because advisor inventory does not require hourly polling.
- `event_image_quality` is now associated with its real
  `event_image_quality_audit` cron command.
- `event_quality_cluster_refresh` and `wf-milestone-source-health` now have
  registry records, eliminating orphan scheduler state.
- Six enabled rows with cleared failure counters but stale `auto_paused` labels
  were normalized. The status label can no longer create false incidents.

### Completed or retired

The following bounded/backfill jobs were disabled and unscheduled only after
their completion condition or explicit retirement was verified:

- `marketplace_affiliate_backfill`
- `marketplace_gallery_asset_backfill`
- `news_story_backfill`
- `news_verdict_geo_backfill`
- `venue_geocode_repair`
- `ev_fill_eventbrite`
- `event_dedup_sweep`
- `expand_event_recurrences`
- `hotel_reenrich_stale`
- `marketplace_catalog_prune`
- `tag_image_provenance_sync`
- `city_cost_of_living_backfill` (506 final eligible rows filled; zero remain)

## Jobs deliberately retained

- `marketplace_image_phash_backfill`: sampled counters looked idle, but the
  measured backlog was 342,976 rows.
- Marketplace taxonomy v3: 70,763 rows remained.
- `news_fulltext_backfill`: registry counters were zero while the HTTP response
  showed two rows processed; response evidence wins.
- `geo_address_drain`: response bodies showed active processing despite zero
  sampled change counters.
- GitHub polling, workflow dispatch, run projection/reaping, publishing, and
  similar low-latency control-plane jobs remain independent because combining
  them would enlarge failure domains or harm latency.

## Scheduling and capacity

Independent schedules were spread across minute offsets while preserving known
pipeline order and supervisor-owned schedules. The observed hour-14 peak fell
from 59 starts to a projected 20, below `cron.max_running_jobs = 32` and leaving
headroom for delayed and manual executions. Post-change observed minute groups
started 9, 9, and 12 jobs with no failures.

## Admin interface

The registry UI now defaults to operational rows and adds:

- Active, Attention, Paused, and All views;
- search across name, slug, description, and inferred domain;
- domain and owner filters;
- active, attention, paused, auto-paused, and total counts;
- retired/completed/consolidated rows hidden from Active but preserved in
  Paused and All.

The existing row actions, recent-run filtering, and detail drawer remain.

## Follow-up policy

- New scheduled work must create or update the registry row and pg_cron job in
  the same migration.
- One-shot backfills should start paused or self-retire after a measurable
  completion predicate reaches zero.
- Supervisors should expose named per-stage results and retain bounded batches.
- Cadence reductions should be driven by queue age and user-visible latency,
  not `items_changed = 0` alone.
