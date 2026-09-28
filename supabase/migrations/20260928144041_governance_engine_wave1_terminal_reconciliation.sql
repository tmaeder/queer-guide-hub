-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260928144041 with no repo file — the signature of
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
-- Governance remediation wave 1:
-- * drain the two genuinely-open event media findings;
-- * decide every remaining venue category review with source evidence;
-- * distinguish the broken gaycities concert cohort from legitimate concerts;
-- * persist and remove terminal reverse-geocode negatives from the work queue;
-- * disposition single-signal liveness flags as ambiguous (not falsely alive/dead);
-- * reconcile every affected immutable-baseline item with evidence.

set lock_timeout = '15s';
set statement_timeout = '300s';

-- ---------------------------------------------------------------------------
-- Address queue: Photon already returned a definitive no-postal outcome. Keeping
-- these rows in a retry queue made completed work look parked forever.
-- ---------------------------------------------------------------------------
create table if not exists public.geo_address_terminal_outcomes (
  entity_type text not null,
  entity_id uuid not null,
  reason text not null,
  outcome text not null,
  latitude numeric,
  longitude numeric,
  attempts integer not null,
  source_error text,
  evidence jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null default now(),
  primary key(entity_type,entity_id,reason)
);

alter table public.geo_address_terminal_outcomes enable row level security;
revoke all on public.geo_address_terminal_outcomes from public,anon,authenticated;
grant all on public.geo_address_terminal_outcomes to service_role;

insert into public.geo_address_terminal_outcomes(
  entity_type,entity_id,reason,outcome,latitude,longitude,attempts,source_error,evidence
)
select entity_type,entity_id,reason,'source_reports_no_postal_code',
  latitude,longitude,attempts,last_error,
  jsonb_build_object(
    'source','photon_reverse_geocoder',
    'contract','no postal code exists for the supplied coordinates',
    'terminal',true
  )
from public.geo_address_queue
where attempts>=4 and last_error='no_postal_for_coordinates'
on conflict(entity_type,entity_id,reason) do update
set outcome=excluded.outcome,
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    attempts=greatest(public.geo_address_terminal_outcomes.attempts,excluded.attempts),
    source_error=excluded.source_error,
    evidence=excluded.evidence,
    decided_at=now();

with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state='terminal',
    resolution_type='source_unavailable',
    resolution_evidence=jsonb_build_object(
      'outcome','source_reports_no_postal_code',
      'source','photon_reverse_geocoder',
      'attempts',q.attempts,
      'last_error',q.last_error
    ),
    resolved_at=now()
from public.geo_address_queue q
where i.run_id=(select id from active)
  and i.engine='addresses'
  and i.finding_key='ADDRESS_QUEUE_PARKED'
  and i.entity_type=q.entity_type
  and i.entity_id=q.entity_id::text
  and q.attempts>=4
  and q.last_error='no_postal_for_coordinates';

delete from public.geo_address_queue
where attempts>=4 and last_error='no_postal_for_coordinates';

-- ---------------------------------------------------------------------------
-- Venue category review: all eight remaining rows were individually reviewed.
-- The first seven labels are direct identity signals; The Beast is a dedicated
-- performance venue, corroborated by its official event programme.
-- ---------------------------------------------------------------------------
select public.decide_venue_category(
  '36296608-1f74-49ed-a654-8ddaefc407f3'::uuid,true,'hotel',
  'Reviewed 2026-09-28: identity is explicitly Hotel Basel.'
);
select public.decide_venue_category(
  '14ef6fa3-ad46-4626-a38c-7d1c13f1ae3d'::uuid,true,'cafe',
  'Reviewed 2026-09-28: Café Flore is corroborated as a Basel café.'
);
select public.decide_venue_category(
  '2cf9bab7-6d2d-4aa1-851f-362967bf3f8f'::uuid,true,'cafe',
  'Reviewed 2026-09-28: Jêle Café is corroborated as a Basel café.'
);
select public.decide_venue_category(
  '4fb86ab4-4dd1-40d9-bdd5-a4a889d68d0e'::uuid,true,'club',
  'Reviewed 2026-09-28: explicit club identity.'
);
select public.decide_venue_category(
  '54cff5bb-d6f6-44c3-b11b-b07ca936901f'::uuid,true,'club',
  'Reviewed 2026-09-28: explicit club identity.'
);
select public.decide_venue_category(
  '61024efa-c978-4552-b593-7fa1753c65a5'::uuid,true,'club',
  'Reviewed 2026-09-28: current official programme identifies Club Dome as a nightclub.'
);
select public.decide_venue_category(
  '6da75695-b062-492d-8df7-d0d8d74ebafb'::uuid,true,'event-venue',
  'Reviewed 2026-09-28: official programme and Basel tourism identify a dedicated comedy performance venue.'
);
select public.decide_venue_category(
  'b9edf453-4d1c-436b-9352-3dba59e3a7ac'::uuid,true,'club',
  'Reviewed 2026-09-28: historical identity is explicitly Club Q; category and liveness are separate decisions.'
);

-- ---------------------------------------------------------------------------
-- Event categories: the known-bad label came only from gaycities. The remaining
-- unexamined concert rows come from unrelated sources and are not part of that
-- defect. Record that scope decision instead of calling legitimate concerts bad.
-- One scraper CTA is not an event and is archived reversibly.
-- ---------------------------------------------------------------------------
update public.events e
set enrichment_status=jsonb_set(
  coalesce(e.enrichment_status,'{}'::jsonb),
  '{event_type_backfill}',
  jsonb_build_object(
    'from',e.event_type,
    'to',e.event_type,
    'confidence',null,
    'status','not_applicable',
    'reason','source_not_affected_by_gaycities_mapper_defect',
    'decided_at',now()
  )
)
where e.duplicate_of_id is null
  and e.event_type='concert'
  and not (coalesce(e.enrichment_status,'{}'::jsonb)?'event_type_backfill')
  and not exists(
    select 1 from public.event_sources s
    where s.event_id=e.id and s.source_slug='gaycities'
  );

update public.events
set status='cancelled',
    review_status='archived',
    seo_indexable=false,
    needs_attention=false,
    enrichment_status=jsonb_set(
      coalesce(enrichment_status,'{}'::jsonb),
      '{event_type_backfill}',
      jsonb_build_object(
        'from','other','to',null,'confidence',1,
        'status','not_applicable','reason','source_call_to_action_not_an_event',
        'decided_at',now()
      )
    )
where id='33b1b363-2c2e-460e-b9f1-422a87a2f82f'::uuid
  and title='Fehlt dein Event?';

-- These two records had generic Wikimedia assets linked to 17/24 unrelated
-- events. Earlier array-only removal was undone by the asset-link synchronizer,
-- so remove both sources of truth and let the accepted IMAGE_MISSING decision
-- stand until an event-specific image exists.
delete from public.image_asset_links
where entity_type='event'
  and (entity_id,asset_id) in (
    ('2050bbdd-e3f6-4de0-9fc2-682ae186669c'::uuid,
     '5f67483c-1865-4da5-9f7e-63a3a6aa93dc'::uuid),
    ('56f62383-3a15-48c3-8a32-c3c86a21e497'::uuid,
     'aef99cc4-1120-4525-b68f-c0bcdec39cd6'::uuid)
  );

update public.events
set images=array_remove(
  images,
  case id
    when '2050bbdd-e3f6-4de0-9fc2-682ae186669c'::uuid
      then 'https://img.queer.guide/event-images/90c8c72258f5408faa38323d4bcad2c4d3b1d517de57c7466f33621cd3726717.jpg'
    else 'https://img.queer.guide/event-images/fe97f71972d07cf2dc3dfb71e1c4861ec5724ca40530a68df999405c2e9a58f4.jpg'
  end
)
where id in (
  '2050bbdd-e3f6-4de0-9fc2-682ae186669c'::uuid,
  '56f62383-3a15-48c3-8a32-c3c86a21e497'::uuid
);

update public.event_quality_issues
set status='resolved',
    resolution='Removed generic cross-event asset and its synchronizer link; no event-specific source image exists.',
    resolved_at=now(),
    reviewed_at=now()
where status='open'
  and issue_code='IMAGE_REUSED'
  and event_id in (
    '2050bbdd-e3f6-4de0-9fc2-682ae186669c'::uuid,
    '56f62383-3a15-48c3-8a32-c3c86a21e497'::uuid
  );

update public.event_quality_current
set open_issue_codes=array_remove(open_issue_codes,'IMAGE_REUSED'),
    assessed_at=now()
where event_id in (
  '2050bbdd-e3f6-4de0-9fc2-682ae186669c'::uuid,
  '56f62383-3a15-48c3-8a32-c3c86a21e497'::uuid
);

-- ---------------------------------------------------------------------------
-- Liveness: all 22 flags contain exactly one dead signal. That is insufficient
-- under the engine's own two-independent-signal archive contract. Supersede the
-- one-dimensional HTTP verdict with an explicit ambiguous review signal, close
-- the flag, and leave the entities published rather than fabricating life/death.
-- ---------------------------------------------------------------------------
insert into public.entity_existence_signals(
  entity_type,entity_id,signal_kind,verdict,weight,source,details,observed_at
)
select a.entity_type,a.entity_id,'http_status','ambiguous',0,
  'governance_remediation_review',
  jsonb_build_object(
    'audit_id',a.id,
    'decision','insufficient_evidence',
    'basis','one HTTP failure is not independent evidence that the entity ceased to exist',
    'reviewed_at',now()
  ),
  now()
from public.entity_existence_audit a
where a.action='flag' and a.reverted_at is null
  and coalesce((a.signals->>'strong_dead')::integer,0)=1;

with closed as (
  update public.entity_existence_audit
  set reverted_at=now(),
      reason='dismissed_insufficient_evidence_single_signal'
  where action='flag' and reverted_at is null
    and coalesce((signals->>'strong_dead')::integer,0)=1
  returning entity_type,entity_id,id
)
update public.governance_remediation_items i
set resolution_state='terminal',
    resolution_type='insufficient_evidence',
    resolution_evidence=jsonb_build_object(
      'audit_id',c.id,
      'decision','dismissed',
      'basis','single non-independent dead signal; entity retained'
    ),
    resolved_at=now()
from closed c
where i.engine='liveness'
  and i.entity_type=c.entity_type
  and i.entity_id=c.entity_id::text
  and i.source_key=c.id::text;

-- ---------------------------------------------------------------------------
-- Correct the category dashboard contract. Legitimate concerts are not the
-- broken gaycities cohort, and only unexamined affected-source rows are backlog.
-- ---------------------------------------------------------------------------
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
          where enrichment_status->'category_backfill'->>'status' in ('no_signal','rejected')),
        'nonvenue_candidates',count(*) filter(where enrichment_status?'nonvenue_candidate'),
        'unexamined',count(*) filter(
          where category='other' and not (coalesce(enrichment_status,'{}'::jsonb)?'category_backfill'))
      )
      from public.venues where duplicate_of_id is null
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
      from public.events where duplicate_of_id is null
    ),
    'last_runs',(
      select jsonb_object_agg(slug,jsonb_build_object(
        'last_run_at',last_run_at,'status',last_run_status,'enabled',enabled))
      from public.admin_automations
      where slug in ('venue_category_reclassify','event_type_reclassify','venue_nonvenue_flag')
    )
  );
$$;

-- Reconcile the event and category baseline after the source-of-truth repairs.
with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state='resolved',
    resolution_type='repaired',
    resolution_evidence=jsonb_build_object(
      'repair','generic shared image and asset link removed',
      'current_open_issue',false
    ),
    resolved_at=now()
where i.run_id=(select id from active)
  and i.engine='events'
  and i.finding_key='IMAGE_REUSED'
  and not exists(
    select 1 from public.event_quality_current q
    where q.event_id=i.entity_id::uuid and 'IMAGE_REUSED'=any(q.open_issue_codes)
  );

with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state=case when v.category<>'other' then 'resolved' else 'terminal' end,
    resolution_type=case when v.category<>'other' then 'classified' else 'evidence_exhausted' end,
    resolution_evidence=jsonb_build_object(
      'current_value',v.category,
      'status',v.enrichment_status->'category_backfill'->>'status',
      'decision','explicit classification outcome retained'
    ),
    resolved_at=now()
from active,public.venues v
where i.run_id=active.id
  and i.engine='categories'
  and i.entity_type='venue'
  and v.id=i.entity_id::uuid
  and (
    v.category<>'other'
    or v.enrichment_status->'category_backfill'->>'status' in ('no_signal','rejected')
  );

with active as (
  select id from public.governance_remediation_runs
  where label='governance-engine-full-remediation-2026-09-28'
  order by captured_at desc limit 1
)
update public.governance_remediation_items i
set resolution_state=case
      when e.status<>'cancelled'
        and e.enrichment_status->'event_type_backfill'->>'status'='applied'
        and e.event_type<>'other' then 'resolved'
      else 'terminal'
    end,
    resolution_type=case
      when e.status='cancelled' then 'not_applicable'
      when e.enrichment_status->'event_type_backfill'->>'status'='applied'
        and e.event_type<>'other' then 'classified'
      else 'evidence_exhausted'
    end,
    resolution_evidence=jsonb_build_object(
      'current_value',e.event_type,
      'status',e.enrichment_status->'event_type_backfill'->>'status',
      'decision','explicit classification outcome retained'
    ),
    resolved_at=now()
from active,public.events e
where i.run_id=active.id
  and i.engine='categories'
  and i.entity_type='event'
  and e.id=i.entity_id::uuid
  and (
    e.status='cancelled'
    or e.enrichment_status->'event_type_backfill'->>'status'
      in ('applied','kept','no_signal','not_applicable')
  );

update public.governance_remediation_runs r
set resolved_items=(
  select count(*) from public.governance_remediation_items i
  where i.run_id=r.id and i.resolution_state in ('resolved','terminal')
)
where r.label='governance-engine-full-remediation-2026-09-28'
  and r.status='active';

-- Deployment invariants: this wave is not complete if any source queue remains.
do $$
declare
  v_event_open integer;
  v_category_review integer;
  v_parked_transient integer;
begin
  select count(*) into v_event_open
  from public.event_quality_current
  where 'IMAGE_REUSED'=any(open_issue_codes);
  if v_event_open<>0 then
    raise exception 'wave 1 invariant: % IMAGE_REUSED event findings remain open',v_event_open;
  end if;

  select count(*) into v_category_review
  from public.venues
  where duplicate_of_id is null
    and enrichment_status->'category_backfill'->>'status'='review';
  if v_category_review<>0 then
    raise exception 'wave 1 invariant: % venue category reviews remain',v_category_review;
  end if;

  select count(*) into v_parked_transient
  from public.geo_address_queue where attempts>=4;
  if v_parked_transient<>0 then
    raise exception 'wave 1 invariant: % non-terminal parked address rows remain',v_parked_transient;
  end if;
end;
$$;

reset statement_timeout;
reset lock_timeout;
;
