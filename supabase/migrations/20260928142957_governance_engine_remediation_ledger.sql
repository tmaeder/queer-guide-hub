-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260928142957 with no repo file — the signature of
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
-- Immutable baseline + reconciliation ledger for the full Governance Engine
-- remediation programme approved on 2026-09-28.

set lock_timeout = '15s';
set statement_timeout = '300s';

create table if not exists public.governance_remediation_runs (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  status text not null default 'active'
    check (status in ('active','completed','failed')),
  captured_at timestamptz not null default now(),
  completed_at timestamptz,
  initial_items bigint not null default 0,
  resolved_items bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.governance_remediation_items (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.governance_remediation_runs(id) on delete cascade,
  engine text not null,
  entity_type text not null,
  entity_id text not null,
  finding_key text not null,
  source_table text not null,
  source_key text not null,
  initial_state text not null default 'open',
  initial_evidence jsonb not null default '{}'::jsonb,
  resolution_state text not null default 'open'
    check (resolution_state in ('open','in_progress','resolved','terminal')),
  resolution_type text,
  resolution_evidence jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(run_id,engine,entity_type,entity_id,finding_key,source_table,source_key)
);

create index if not exists governance_remediation_items_open_idx
  on public.governance_remediation_items(run_id,engine,finding_key,id)
  where resolution_state in ('open','in_progress');
create index if not exists governance_remediation_items_entity_idx
  on public.governance_remediation_items(entity_type,entity_id);

alter table public.governance_remediation_runs enable row level security;
alter table public.governance_remediation_items enable row level security;

drop policy if exists governance_remediation_runs_admin_read
  on public.governance_remediation_runs;
create policy governance_remediation_runs_admin_read
  on public.governance_remediation_runs for select to authenticated
  using (public.has_role_jwt('admin'::public.app_role));
drop policy if exists governance_remediation_items_admin_read
  on public.governance_remediation_items;
create policy governance_remediation_items_admin_read
  on public.governance_remediation_items for select to authenticated
  using (public.has_role_jwt('admin'::public.app_role));

revoke all on public.governance_remediation_runs from public,anon,authenticated;
revoke all on public.governance_remediation_items from public,anon,authenticated;
grant select on public.governance_remediation_runs to authenticated;
grant select on public.governance_remediation_items to authenticated;
grant all on public.governance_remediation_runs to service_role;
grant all on public.governance_remediation_items to service_role;
grant usage,select on sequence public.governance_remediation_items_id_seq to service_role;

create or replace function public.capture_governance_remediation_baseline(
  p_label text default 'governance-engine-full-remediation-2026-09-28'
)
returns uuid
language plpgsql security definer
set search_path = public,pg_temp
as $$
declare
  v_run uuid;
  v_count bigint;
begin
  if current_user not in ('postgres','service_role')
     and not public.has_role_jwt('admin'::public.app_role) then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  insert into public.governance_remediation_runs(label)
  values (p_label) returning id into v_run;

  -- Country and city scorecards already expose stable per-row issue codes.
  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'countries','country',q.id::text,u.issue_code,'country_quality_profile',
    q.id::text||':'||u.issue_code,
    jsonb_build_object('name',q.name,'slug',q.slug,'blockers',q.blockers,'warnings',q.warnings)
  from public.country_quality_profile q
  cross join lateral unnest(q.issue_codes) as u(issue_code);

  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'cities','city',q.id::text,u.issue_code,'city_quality_profile',
    q.id::text||':'||u.issue_code,
    jsonb_build_object('name',q.name,'slug',q.slug,'blockers',q.blockers,'warnings',q.warnings)
  from public.city_quality_profile q
  cross join lateral unnest(q.issue_codes) as u(issue_code);

  -- Venue blockers plus each incomplete score dimension are separate findings.
  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'venues','venue',s.venue_id::text,u.issue_code,'venue_quality_snapshots',
    s.venue_id::text||':blocker:'||u.issue_code,
    jsonb_build_object('tier',s.quality_tier,'public_score',s.public_score,'details',s.details)
  from public.venue_quality_snapshots s
  cross join lateral unnest(s.blocker_codes) as u(issue_code);

  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'venues','venue',s.venue_id::text,'VENUE_'||upper(d.dimension)||'_INCOMPLETE',
    'venue_quality_snapshots',s.venue_id::text||':dimension:'||d.dimension,
    jsonb_build_object('dimension',d.dimension,'score',d.score,'tier',s.quality_tier)
  from public.venue_quality_snapshots s
  cross join lateral (values
    ('identity',s.identity_score),('location',s.location_score),
    ('taxonomy',s.taxonomy_score),('description',s.description_score),
    ('media',s.media_score),('contact',s.contact_score),
    ('freshness',s.freshness_score),('relationships',s.relationship_score)
  ) d(dimension,score)
  where d.score < 100;

  -- Coverage radar rows retain one item per missing field.
  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'villages','queer_village',g.village_id::text,
    'VILLAGE_'||upper(field)||'_MISSING','village_coverage_gaps',
    g.id::text||':'||field,
    jsonb_build_object('name',g.village_name,'gap_score',g.gap_score,
      'resolution',g.resolution,'shell_status',g.shell_status)
  from public.village_coverage_gaps g
  cross join lateral unnest(g.missing_fields) field
  where g.status in ('open','queued');

  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'personalities','personality',g.personality_id::text,
    'PERSONALITY_'||upper(field)||'_MISSING','personality_coverage_gaps',
    g.id::text||':'||field,
    jsonb_build_object('name',g.personality_name,'gap_score',g.gap_score,
      'resolution',g.resolution)
  from public.personality_coverage_gaps g
  cross join lateral unnest(g.missing_fields) field
  where g.status in ('open','queued');

  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'personalities','personality',q.personality_id::text,
    'PERSONALITY_FIELD_REVIEW_'||upper(replace(q.field,'.','_')),
    'personality_review_queue',q.id::text,
    jsonb_build_object('field',q.field,'confidence',q.confidence,'citations',q.citations)
  from public.personality_review_queue q where q.status='open';

  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'personalities','personality',q.personality_id::text,
    'PERSONALITY_TAG_REVIEW','personality_tag_review_queue',q.id::text,
    jsonb_build_object('raw_value',q.raw_value,'normalized_value',q.normalized_value,'source',q.source)
  from public.personality_tag_review_queue q where q.status='open';

  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'personalities','personality',p.id::text,'PERSONALITY_PENDING_WITHOUT_QUEUE',
    'personalities',p.id::text||':pending-without-queue',
    jsonb_build_object('name',p.name,'review_status',p.review_status,'visibility',p.visibility)
  from public.personalities p
  where p.duplicate_of_id is null and p.review_status='pending'
    and not exists(select 1 from public.personality_review_queue q
      where q.personality_id=p.id and q.status='open')
    and not exists(select 1 from public.personality_tag_review_queue q
      where q.personality_id=p.id and q.status='open');

  -- Current event issues are the actionable cohort. Historical accepted rows
  -- remain in their source audit but are not silently re-opened here.
  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'events','event',c.event_id::text,u.issue_code,'event_quality_current',
    c.event_id::text||':'||u.issue_code,
    jsonb_build_object('tier',c.quality_tier,'overall_score',c.overall_score,'details',c.details)
  from public.event_quality_current c
  cross join lateral unnest(c.open_issue_codes) as u(issue_code);

  -- Marketplace listing-level cohorts used by the dashboard snapshot.
  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'marketplace','marketplace_listing',l.id::text,d.code,
    'marketplace_listings',l.id::text||':'||d.code,
    jsonb_build_object('title',l.title,'source_type',l.source_type,'department',l.department,
      'subcategory_group',l.subcategory_group,'content_rating',l.content_rating)
  from public.marketplace_listings l
  cross join lateral (values
    ('MARKETPLACE_DEPARTMENT_OTHER',l.department='other'),
    ('MARKETPLACE_DESCRIPTION_MISSING',coalesce(btrim(l.description),'')=''),
    ('MARKETPLACE_DESCRIPTION_THIN',length(coalesce(btrim(l.description),'')) between 1 and 79),
    ('MARKETPLACE_IMAGE_MISSING',coalesce(array_length(l.images,1),0)=0),
    ('MARKETPLACE_LINK_NEVER_CHECKED',l.link_checked_at is null),
    ('MARKETPLACE_STALE',
      (l.link_checked_at is null or l.link_checked_at<now()-interval '30 days')
      and (l.last_seen_at is null or l.last_seen_at<now()-interval '30 days')),
    ('MARKETPLACE_SAFETY_CONFLICT',l.content_rating='sfw' and l.subcategory_group in
      ('dildos','vibrators','anal_toys','cock_rings','chastity','masturbators','sex_toys')),
    ('MARKETPLACE_SOURCE_PROVENANCE_MISSING',not exists(
      select 1 from public.marketplace_listing_sources s where s.listing_id=l.id))
  ) d(code,applies)
  where l.status='active' and l.duplicate_of_id is null and d.applies;

  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select distinct v_run,'marketplace','marketplace_listing',l.id::text,
    'MARKETPLACE_IMAGE_OPTIMIZATION_FAILED','image_assets',l.id::text||':image-opt-failed',
    jsonb_build_object('title',l.title)
  from public.marketplace_listings l
  join public.image_asset_links al on al.entity_type='marketplace_listing' and al.entity_id=l.id
  join public.image_assets a on a.id=al.asset_id
  where l.status='active' and l.duplicate_of_id is null and a.optimization_status='failed';

  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select distinct v_run,'marketplace','marketplace_listing',l.id::text,
    'MARKETPLACE_IMAGE_DIMENSIONS_MISSING','image_assets',l.id::text||':image-dimensions-missing',
    jsonb_build_object('title',l.title)
  from public.marketplace_listings l
  join public.image_asset_links al on al.entity_type='marketplace_listing' and al.entity_id=l.id
  join public.image_assets a on a.id=al.asset_id
  where l.status='active' and l.duplicate_of_id is null and (a.width is null or a.height is null);

  -- Business/brand findings already provide one durable row per dimension.
  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,
      initial_state,initial_evidence)
  select v_run,'business-brands',f.entity_type,f.entity_id::text,
    'BUSINESS_BRAND_'||upper(f.dimension)||'_'||upper(f.reason_code),
    'entity_quality_findings',f.id::text,f.state,
    f.evidence||jsonb_build_object('dimension',f.dimension,'reason_code',f.reason_code)
  from public.entity_quality_findings f
  where f.state in ('fail','pending') and f.waived_at is null;

  -- Address completeness and correctness are itemized by entity and field.
  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'addresses',x.entity_type,x.id::text,'ADDRESS_'||upper(x.field)||'_MISSING',
    x.source_table,x.id::text||':'||x.field,x.evidence
  from (
    select 'venue' entity_type,v.id,'venues' source_table,d.field,
      jsonb_build_object('name',v.name,'city_id',v.city_id,'country_id',v.country_id) evidence
    from public.venues v cross join lateral (values
      ('country',v.country_id is null),('state',nullif(btrim(v.state),'') is null),
      ('postal',nullif(btrim(v.postal_code),'') is null)) d(field,applies)
    where v.duplicate_of_id is null and d.applies
    union all
    select 'event',e.id,'events',d.field,
      jsonb_build_object('title',e.title,'city_id',e.city_id,'country_id',e.country_id)
    from public.events e cross join lateral (values
      ('country',e.country_id is null),('state',nullif(btrim(e.state),'') is null),
      ('postal',nullif(btrim(e.postal_code),'') is null)) d(field,applies)
    where e.duplicate_of_id is null and d.applies
    union all
    select 'hotel',h.id,'hotels',d.field,
      jsonb_build_object('name',h.name,'city_id',h.city_id,'country_id',h.country_id)
    from public.hotels h cross join lateral (values
      ('country',h.country_id is null),('state',nullif(btrim(h.state),'') is null),
      ('postal',nullif(btrim(h.postal_code),'') is null)) d(field,applies)
    where h.duplicate_of_id is null and d.applies
    union all
    select 'organization',o.id,'organizations',d.field,
      jsonb_build_object('name',o.name,'city_id',o.city_id,'country_id',o.country_id)
    from public.organizations o cross join lateral (values
      ('country',o.country_id is null),('state',nullif(btrim(o.state),'') is null),
      ('postal',nullif(btrim(o.postal_code),'') is null)) d(field,applies)
    where o.duplicate_of_id is null and d.applies
  ) x;

  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'addresses',f.entity_type,f.entity_id::text,
    'GEO_'||upper(f.violation_class),'geo_containment_findings',
    f.entity_type||':'||f.entity_id::text||':'||f.violation_class,
    jsonb_build_object('name',f.entity_name,'claimed_iso',f.claimed_iso,
      'actual_iso',f.actual_iso,'match_kind',f.match_kind,
      'latitude',f.latitude,'longitude',f.longitude)
  from public.geo_containment_findings f;

  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'addresses','city',f.city_id::text,
    'CITY_GEO_'||upper(f.violation_class),'geo_city_coord_findings',
    f.city_id::text||':'||f.violation_class,
    jsonb_build_object('name',f.name,'claimed_iso',f.claimed_iso,
      'actual_iso',f.actual_iso,'venues',f.venues,'events',f.events,
      'latitude',f.latitude,'longitude',f.longitude,'km_to_land',f.km_to_land)
  from public.geo_city_coord_findings f;

  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'addresses',q.entity_type,q.entity_id::text,'ADDRESS_QUEUE_PARKED',
    'geo_address_queue',q.entity_type||':'||q.entity_id::text,
    jsonb_build_object('reason',q.reason,'attempts',q.attempts,'last_error',q.last_error)
  from public.geo_address_queue q where q.attempts>=4;

  -- Category coverage includes genuine terminal no-signal outcomes; the ledger
  -- keeps them visible until they receive an explicit disposition.
  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'categories','venue',v.id::text,'VENUE_CATEGORY_OTHER','venues',
    v.id::text||':category-other',
    jsonb_build_object('name',v.name,'status',v.enrichment_status->'category_backfill'->>'status')
  from public.venues v
  where v.duplicate_of_id is null and v.category='other';

  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'categories','event',e.id::text,
    case when e.event_type='concert' then 'EVENT_CATEGORY_MISLABELLED_CONCERT'
      else 'EVENT_CATEGORY_OTHER' end,'events',e.id::text||':category:'||e.event_type,
    jsonb_build_object('title',e.title,'event_type',e.event_type,
      'status',e.enrichment_status->'event_type_backfill'->>'status')
  from public.events e
  where e.duplicate_of_id is null and e.event_type in ('other','concert');

  -- Human queues represented on the governance page.
  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'duplicates',q.entity_type,q.id::text,'DUPLICATE_REVIEW',
    'dedup_review_queue',q.id::text,
    jsonb_build_object('keep_id',q.keep_id,'drop_id',q.drop_id,
      'confidence',q.confidence,'reason',q.reason,'source',q.source)
  from public.dedup_review_queue q where q.status in ('open','pending');

  insert into public.governance_remediation_items
    (run_id,engine,entity_type,entity_id,finding_key,source_table,source_key,initial_evidence)
  select v_run,'liveness',a.entity_type,a.entity_id::text,'LIVENESS_ARCHIVE_REVIEW',
    'entity_existence_audit',a.id::text,
    jsonb_build_object('reason',a.reason,'signals',a.signals,'created_at',a.created_at)
  from public.entity_existence_audit a
  where a.action='flag' and a.reverted_at is null;

  select count(*) into v_count
  from public.governance_remediation_items where run_id=v_run;
  update public.governance_remediation_runs
  set initial_items=v_count,
      metadata=jsonb_build_object(
        'contract','evidence-backed repair or explicit terminal disposition',
        'captured_by',current_user,
        'dashboard','/admin/governance?mode=engines')
  where id=v_run;
  return v_run;
end;
$$;

revoke all on function public.capture_governance_remediation_baseline(text)
  from public,anon,authenticated;
grant execute on function public.capture_governance_remediation_baseline(text)
  to service_role;

create or replace function public.governance_remediation_summary(p_run uuid)
returns jsonb
language sql stable security definer
set search_path = public,pg_temp
as $$
  select case when current_user in ('postgres','service_role')
      or public.has_role_jwt('admin'::public.app_role)
    then jsonb_build_object(
      'run',(select to_jsonb(r) from public.governance_remediation_runs r where r.id=p_run),
      'by_engine',(select coalesce(jsonb_agg(to_jsonb(x) order by engine,resolution_state),'[]'::jsonb)
        from (select engine,resolution_state,count(*) items
          from public.governance_remediation_items where run_id=p_run
          group by engine,resolution_state) x),
      'open_by_finding',(select coalesce(jsonb_agg(to_jsonb(x) order by items desc,finding_key),'[]'::jsonb)
        from (select finding_key,count(*) items
          from public.governance_remediation_items
          where run_id=p_run and resolution_state in ('open','in_progress')
          group by finding_key) x)
    ) else null end;
$$;
revoke all on function public.governance_remediation_summary(uuid) from public,anon;
grant execute on function public.governance_remediation_summary(uuid)
  to authenticated,service_role;

-- Capture exactly one immutable baseline as part of deployment. Operational
-- repair migrations refer to this run rather than recounting a moving target.
select public.capture_governance_remediation_baseline();

reset statement_timeout;
reset lock_timeout;
;
