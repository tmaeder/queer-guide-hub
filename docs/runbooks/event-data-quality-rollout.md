# Event Data Quality Rollout

This programme deploys in shadow mode. It does not replace `events.quality_score`,
change public ranking, or run deterministic repairs until an operator explicitly
enables those steps.

## Preconditions

1. Reconcile local and remote migration history before pushing. The project must
   have no remote-only migration versions.
2. Confirm `event_quality_webhook_secret` exists in Vault and matches the deployed
   `EVENT_QUALITY_WEBHOOK_SECRET` Edge Function secret.
3. Deploy `event-image-quality` before applying the migration that schedules it.
4. Run database security and performance advisors after applying the migration.

## Deploy in shadow mode

Apply the migration, then confirm the rollout remains non-enforcing:

```sql
select * from public.event_quality_rollout where singleton;
```

Expected: `enforcement_enabled = false`, `scoring_enabled = true`.

Run the initial cluster refresh and bounded assessment drain:

```sql
select public.run_event_quality_cluster_refresh();
select public.run_event_quality_scan(5000, 'all', true);  -- read-only preview
select public.run_event_quality_scan(5000, 'all', false); -- assessment tables only
```

Repeat the non-dry scan until `assessed` is zero, then capture source metrics:

```sql
select public.refresh_event_source_quality_snapshot(current_date);
select public.event_quality_snapshot();
select * from public.event_quality_gate_checks();
```

The five-minute scanner will continue draining new and stale records. The image
auditor uses a ten-minute lease, processes five images concurrently, and writes
only observations and quality issues.

## Validate before repairs

Review each deterministic issue cohort separately:

```sql
select issue_code, severity, count(*)
from public.event_quality_issues
where status = 'open'
group by issue_code, severity
order by severity, count(*) desc;

select event_id, issue_code, evidence
from public.event_quality_issues
where status = 'open'
  and issue_code in (
    'GEO_NULL_ISLAND', 'WEBSITE_INVALID', 'TICKET_URL_INVALID',
    'IMAGE_PLACEHOLDER', 'IMAGE_URL_INVALID', 'VENUE_CITY_CONFLICT'
  )
order by issue_code, detected_at
limit 250;
```

Preview the repair batch without changing events:

```sql
select public.run_event_quality_repairs(500, true);
```

For every repair rule, manually compare a source-stratified sample with its
source page and stored provenance. Only then run a bounded write batch:

```sql
select public.run_event_quality_repairs(100, false);
select public.run_event_quality_scan(5000, 'all', false);
```

Repeat in resumable batches. Do not fill absent descriptions, categories,
venues, coordinates, or images without attributable evidence.

## Source and queue validation

- Inspect `event_source_quality_daily` against `event_source_quality_budgets`.
- Fix adapters whose contract errors reject staging rows before doing generic
  backfills.
- Review `DEDUP_CANDIDATE` issues in the existing dedup queue. Never merge solely
  because title and calendar date match.
- Review named venue ambiguity in the existing venue-link queue; only unique,
  same-city exact matches are eligible for automatic linking.
- Accepted dispositions require an audit note. Critical issues cannot be accepted.

## Enable gates

Keep the programme in shadow mode until the baseline is drained and every
zero-tolerance gate reports zero. Then enable enforcement explicitly:

```sql
update public.event_quality_rollout
set enforcement_enabled = true,
    enabled_at = now(),
    enabled_by = auth.uid(),
    updated_at = now()
where singleton;
```

After enforcement, critical gate failures block the data-quality CI command.
Continue running the new scores alongside legacy ranking for two weeks. Migrate
ranking only after reviewing source, current/historical, tier, and dimension
distributions and documenting regressions.

## Rollback

Disable enforcement without deleting evidence:

```sql
update public.event_quality_rollout
set enforcement_enabled = false, enabled_at = null, updated_at = now()
where singleton;
```

Pause the image audit and scanner through the automation controls if necessary.
Do not drop assessment, observation, or issue tables during incident response;
they are the audit trail needed to understand and reverse repairs.

## Production deployment record — 2026-09-24

- Applied programme migration `99991790271091` and repair-rescan correction
  `99991790272380`.
- Deployed the event source-contract functions and `event-image-quality`; its
  write-mode HTTP probe returned 200 and persisted image observations.
- Assessed all 46,346 canonical events. The final baseline distribution was
  42,157 pass, 3,914 warn, and 275 fail before ongoing media observations.
- Applied 156 deterministic, provenance-preserving repairs. The zero-tolerance
  coordinate, date, FK, merge-pointer, URL, and placeholder-image gates then
  reported zero failures.
- Kept `enforcement_enabled = false`. Open enrichment and review cohorts remain
  visible in the admin queue; they must not be mass-accepted or filled without
  evidence.
- Verified the production Events list, event detail, provenance display, Event
  Quality issue queue, filters, admin RLS boundary, cron jobs, and database SQL
  integration test.
