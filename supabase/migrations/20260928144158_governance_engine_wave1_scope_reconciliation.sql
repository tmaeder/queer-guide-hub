-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260928144158 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Follow-up to wave 1: archived non-venues are explicit not-applicable
-- dispositions, and the dashboard's "in scope" totals must not include archived,
-- closed, cancelled, or pending rows.

with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state='terminal',
    resolution_type='not_applicable',
    resolution_evidence=jsonb_build_object(
      'decision','archived_nonvenue',
      'review_status',v.review_status,
      'category_state',v.enrichment_status->'category_backfill'
    ),
    resolved_at=now()
from active,public.venues v
where i.run_id=active.id
  and i.engine='categories'
  and i.entity_type='venue'
  and i.resolution_state='open'
  and v.id=i.entity_id::uuid
  and v.review_status='archived';

create or replace function public.category_coverage_health()
returns jsonb
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
  select jsonb_build_object(
    'venues',(
      select jsonb_build_object(
        'total',count(*),
        'uncategorised',count(*) filter(where category='other'),
        'uncategorised_pct',round(100.0*count(*) filter(where category='other')/nullif(count(*),0),1),
        'auto_applied',count(*) filter(
          where enrichment_status->'category_backfill'->>'status' is null
            and enrichment_status->'category_backfill'->>'to' is not null),
        'awaiting_review',count(*) filter(
          where enrichment_status->'category_backfill'->>'status'='review'),
        'no_signal',count(*) filter(
          where category='other'
            and enrichment_status->'category_backfill'->>'status' in ('no_signal','rejected')),
        'nonvenue_candidates',count(*) filter(
          where enrichment_status->'nonvenue_candidate'->>'status'='review'),
        'unexamined',count(*) filter(
          where category='other' and not (coalesce(enrichment_status,'{}'::jsonb)?'category_backfill'))
      )
      from public.venues
      where duplicate_of_id is null
        and closed_at is null
        and coalesce(review_status,'')<>'archived'
    ),
    'events',(
      select jsonb_build_object(
        'total',count(*),
        'uncategorised',count(*) filter(where event_type='other'),
        'uncategorised_pct',round(100.0*count(*) filter(where event_type='other')/nullif(count(*),0),1),
        'concert_bucket_remaining',count(*) filter(
          where event_type='concert'
            and not (coalesce(enrichment_status,'{}'::jsonb)?'event_type_backfill')
            and exists(select 1 from public.event_sources s
              where s.event_id=events.id and s.source_slug='gaycities')),
        'reclassified',count(*) filter(
          where enrichment_status->'event_type_backfill'->>'status'='applied'),
        'terminal_other',count(*) filter(
          where event_type='other'
            and enrichment_status->'event_type_backfill'->>'status'
              in ('kept','no_signal','not_applicable')),
        'unexamined_concert',count(*) filter(
          where event_type='concert'
            and not (coalesce(enrichment_status,'{}'::jsonb)?'event_type_backfill')
            and exists(select 1 from public.event_sources s
              where s.event_id=events.id and s.source_slug='gaycities'))
      )
      from public.events
      where duplicate_of_id is null
        and status in ('active','completed')
        and review_status='approved'
    ),
    'last_runs',(
      select jsonb_object_agg(slug,jsonb_build_object(
        'last_run_at',last_run_at,'status',last_run_status,'enabled',enabled))
      from public.admin_automations
      where slug in ('venue_category_reclassify','event_type_reclassify','venue_nonvenue_flag')
    )
  );
$$;

update public.governance_remediation_runs r
set resolved_items=(
  select count(*) from public.governance_remediation_items i
  where i.run_id=r.id and i.resolution_state in ('resolved','terminal')
)
where r.label='governance-engine-full-remediation-2026-09-28'
  and r.status='active';

do $$
begin
  if exists(
    select 1 from public.governance_remediation_items i
    join public.governance_remediation_runs r on r.id=i.run_id
    where r.label='governance-engine-full-remediation-2026-09-28'
      and i.engine='categories' and i.resolution_state='open'
  ) then
    raise exception 'wave 1 scope reconciliation left open category baseline items';
  end if;
end;
$$;
;
