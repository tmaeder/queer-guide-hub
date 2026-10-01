-- Event data-quality programme: versioned assessments, evidence-backed issues,
-- shadow-mode gates and dry-run-first deterministic remediation.
--
-- events.quality_score remains the legacy completeness score. Nothing in this
-- migration changes public ranking or visibility.

begin;
-- ---------------------------------------------------------------------------
-- 1. Current assessment, issue lifecycle and rollout state
-- ---------------------------------------------------------------------------

create table if not exists public.event_quality_current (
  event_id uuid primary key references public.events(id) on delete cascade,
  rubric_version integer not null check (rubric_version > 0),
  event_scope text not null check (event_scope in ('current','historical')),
  completeness_score smallint not null check (completeness_score between 0 and 100),
  validity_score smallint not null check (validity_score between 0 and 100),
  linkage_score smallint not null check (linkage_score between 0 and 100),
  provenance_score smallint not null check (provenance_score between 0 and 100),
  media_score smallint not null check (media_score between 0 and 100),
  freshness_score smallint not null check (freshness_score between 0 and 100),
  overall_score smallint not null check (overall_score between 0 and 100),
  quality_tier text not null check (quality_tier in ('pass','warn','fail')),
  issue_codes text[] not null default '{}',
  open_issue_codes text[] not null default '{}',
  blocker_codes text[] not null default '{}',
  assessed_at timestamptz not null default now(),
  input_updated_at timestamptz not null,
  details jsonb not null default '{}'::jsonb
);
create index if not exists idx_event_quality_current_tier_score
  on public.event_quality_current(quality_tier, overall_score, event_id);
create index if not exists idx_event_quality_current_stale
  on public.event_quality_current(rubric_version, assessed_at, input_updated_at);
create index if not exists idx_event_quality_current_issues
  on public.event_quality_current using gin(issue_codes);
create table if not exists public.event_quality_issues (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  dimension text not null check (dimension in
    ('completeness','validity','linkage','provenance','media','freshness','deduplication')),
  issue_code text not null,
  detector text not null default 'event-quality-scan',
  severity text not null check (severity in ('critical','high','medium','low')),
  status text not null default 'open' check (status in ('open','resolved','accepted')),
  evidence jsonb not null default '{}'::jsonb,
  evidence_hash text not null,
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);
create unique index if not exists event_quality_issues_one_open_code
  on public.event_quality_issues(event_id, issue_code) where status='open';
create index if not exists idx_event_quality_issues_queue
  on public.event_quality_issues(status, severity, detected_at, event_id);
create index if not exists idx_event_quality_issues_event
  on public.event_quality_issues(event_id, status, issue_code);
create index if not exists idx_event_quality_issues_reviewer
  on public.event_quality_issues(reviewed_by) where reviewed_by is not null;
create table if not exists public.event_quality_description_clusters (
  fingerprint text primary key,
  event_count integer not null check (event_count > 1),
  sample text,
  refreshed_at timestamptz not null default now()
);
create table if not exists public.event_quality_image_clusters (
  image_url text primary key,
  event_count integer not null check (event_count > 1),
  refreshed_at timestamptz not null default now()
);
create table if not exists public.event_image_quality_observations (
  event_id uuid not null references public.events(id) on delete cascade,
  image_url text not null,
  url_hash text not null,
  content_hash text,
  http_status integer,
  mime_type text,
  byte_size bigint,
  width integer,
  height integer,
  probe_status text not null check (probe_status in ('pass','fail','unknown')),
  failure_reason text,
  checked_at timestamptz not null default now(),
  primary key(event_id,image_url)
);
create index if not exists idx_event_image_quality_due
  on public.event_image_quality_observations(checked_at,event_id);
create index if not exists idx_event_image_quality_content_hash
  on public.event_image_quality_observations(content_hash,event_id)
  where content_hash is not null;
create table if not exists public.event_quality_rollout (
  singleton boolean primary key default true check (singleton),
  enforcement_enabled boolean not null default false,
  scoring_enabled boolean not null default true,
  rubric_version integer not null default 1 check (rubric_version > 0),
  enabled_at timestamptz,
  enabled_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create index if not exists idx_event_quality_rollout_enabled_by
  on public.event_quality_rollout(enabled_by) where enabled_by is not null;
insert into public.event_quality_rollout(singleton) values(true) on conflict(singleton) do nothing;
create table if not exists public.event_quality_worker_leases (
  worker text primary key,
  lease_token uuid not null,
  lease_until timestamptz not null,
  claimed_at timestamptz not null default now()
);
create table if not exists public.event_source_quality_budgets (
  source_slug text primary key,
  minimum_assessment_rate numeric(5,4) not null default 1.0 check (minimum_assessment_rate between 0 and 1),
  maximum_defect_rate numeric(5,4) not null default 0.25 check (maximum_defect_rate between 0 and 1),
  maximum_critical_rate numeric(5,4) not null default 0 check (maximum_critical_rate between 0 and 1),
  maximum_missing_source_id_rate numeric(5,4) not null default 0.10 check (maximum_missing_source_id_rate between 0 and 1),
  updated_at timestamptz not null default now()
);
insert into public.event_source_quality_budgets(source_slug) values('*')
on conflict(source_slug) do nothing;
create table if not exists public.event_source_quality_daily (
  snapshot_date date not null,
  source_slug text not null,
  total_events integer not null,
  assessed_events integer not null,
  affected_events integer not null,
  critical_events integer not null,
  missing_source_id_events integer not null,
  assessment_rate numeric(7,6) not null,
  defect_rate numeric(7,6) not null,
  critical_rate numeric(7,6) not null,
  missing_source_id_rate numeric(7,6) not null,
  captured_at timestamptz not null default now(),
  primary key(snapshot_date,source_slug)
);
alter table public.event_quality_current enable row level security;
alter table public.event_quality_issues enable row level security;
alter table public.event_quality_description_clusters enable row level security;
alter table public.event_quality_image_clusters enable row level security;
alter table public.event_image_quality_observations enable row level security;
alter table public.event_quality_rollout enable row level security;
alter table public.event_source_quality_budgets enable row level security;
alter table public.event_source_quality_daily enable row level security;
alter table public.event_quality_worker_leases enable row level security;
drop policy if exists event_quality_current_admin_read on public.event_quality_current;
create policy event_quality_current_admin_read on public.event_quality_current
  for select to authenticated
  using ((select public.has_any_role_jwt(array['admin'::public.app_role,'moderator'::public.app_role])));
drop policy if exists event_quality_issues_admin_read on public.event_quality_issues;
create policy event_quality_issues_admin_read on public.event_quality_issues
  for select to authenticated
  using ((select public.has_any_role_jwt(array['admin'::public.app_role,'moderator'::public.app_role])));
drop policy if exists event_quality_rollout_admin_read on public.event_quality_rollout;
create policy event_quality_rollout_admin_read on public.event_quality_rollout
  for select to authenticated
  using ((select public.has_any_role_jwt(array['admin'::public.app_role,'moderator'::public.app_role])));
drop policy if exists event_image_quality_observations_admin_read on public.event_image_quality_observations;
create policy event_image_quality_observations_admin_read on public.event_image_quality_observations
  for select to authenticated
  using ((select public.has_any_role_jwt(array['admin'::public.app_role,'moderator'::public.app_role])));
drop policy if exists event_source_quality_admin_read on public.event_source_quality_daily;
create policy event_source_quality_admin_read on public.event_source_quality_daily
  for select to authenticated
  using ((select public.has_any_role_jwt(array['admin'::public.app_role,'moderator'::public.app_role])));
drop policy if exists event_source_quality_budgets_admin_read on public.event_source_quality_budgets;
create policy event_source_quality_budgets_admin_read on public.event_source_quality_budgets
  for select to authenticated
  using ((select public.has_any_role_jwt(array['admin'::public.app_role,'moderator'::public.app_role])));
revoke all on public.event_quality_current, public.event_quality_issues,
  public.event_quality_description_clusters, public.event_quality_image_clusters,
  public.event_image_quality_observations, public.event_quality_rollout,
  public.event_source_quality_budgets, public.event_source_quality_daily,
  public.event_quality_worker_leases from public, anon, authenticated;
grant select on public.event_quality_current, public.event_quality_issues,
  public.event_image_quality_observations, public.event_quality_rollout to authenticated;
grant select on public.event_source_quality_budgets, public.event_source_quality_daily to authenticated;
grant all on public.event_quality_current, public.event_quality_issues,
  public.event_quality_description_clusters, public.event_quality_image_clusters,
  public.event_image_quality_observations, public.event_quality_rollout,
  public.event_source_quality_budgets, public.event_source_quality_daily,
  public.event_quality_worker_leases to service_role;
-- ---------------------------------------------------------------------------
-- 2. Reusable detectors. Findings are evidence, never field mutations.
-- ---------------------------------------------------------------------------

create or replace function public.event_quality_description_fingerprint(p_description text)
returns text language sql immutable set search_path to 'public','pg_temp'
as $$
  select case when length(v) >= 20 then md5(v) else null end
  from (select lower(regexp_replace(
    btrim(regexp_replace(coalesce(p_description,''), '<[^>]*>', ' ', 'g')),
    '\s+', ' ', 'g')) v) s
$$;
create or replace function public.event_quality_url_is_safe(p_url text)
returns boolean language sql immutable set search_path to 'public','pg_temp'
as $$
  with parsed as (
    select lower(btrim(p_url)) raw,
      lower(split_part(split_part(split_part(
        regexp_replace(btrim(p_url),'^https?://','','i'),'/',1),'?',1),'#',1)) authority
    where p_url is not null
  ), host_parts as (
    select raw,authority,
      case when authority like '[%'
        then substring(authority from '^\[([^]]+)\](:[0-9]{1,5})?$')
        else split_part(authority,':',1)
      end host
    from parsed
  )
  select coalesce(
    raw ~* '^https?://[^[:space:]/?#]+([/?#].*)?$'
    and authority<>'' and authority!~'@'
    and ((authority like '[%' and authority ~ '^\[[0-9a-f:.]+\](:[0-9]{1,5})?$')
      or (authority not like '[%' and authority ~ '^[a-z0-9.-]+(:[0-9]{1,5})?$'))
    and host is not null and host<>''
    and (host like '%.%' or host like '%:%')
    and host not in ('localhost','::','::1')
    and host not like '%.localhost' and host not like '%.local' and host not like '%.internal'
    and host !~ '^(127\.|10\.|0\.|169\.254\.|192\.168\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.|172\.(1[6-9]|2[0-9]|3[01])\.)'
    and host !~ '^(fc|fd)[0-9a-f]{2}:' and host !~ '^fe80:' and host !~ '^::ffff:',
    false)
  from host_parts
$$;
create index if not exists idx_events_quality_description_fingerprint
  on public.events(public.event_quality_description_fingerprint(description))
  where duplicate_of_id is null and length(btrim(coalesce(description,''))) >= 20;
create or replace function public.run_event_quality_cluster_refresh()
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_desc int; v_img int;
begin
  if not pg_try_advisory_xact_lock(hashtext('event_quality_cluster_refresh')) then
    return jsonb_build_object('skipped','already_running');
  end if;
  truncate public.event_quality_description_clusters;
  insert into public.event_quality_description_clusters(fingerprint,event_count,sample,refreshed_at)
  select public.event_quality_description_fingerprint(description), count(*)::int,
         left(min(regexp_replace(btrim(description),'\s+',' ','g')),240), now()
  from public.events
  where duplicate_of_id is null
    and public.event_quality_description_fingerprint(description) is not null
  group by public.event_quality_description_fingerprint(description)
  having count(*) > 1;
  get diagnostics v_desc = row_count;

  truncate public.event_quality_image_clusters;
  insert into public.event_quality_image_clusters(image_url,event_count,refreshed_at)
  select u.url, count(distinct e.id)::int, now()
  from public.events e cross join lateral unnest(coalesce(e.images,'{}'::text[])) u(url)
  where e.duplicate_of_id is null and nullif(btrim(u.url),'') is not null
  group by u.url having count(distinct e.id) > 1;
  get diagnostics v_img = row_count;
  return jsonb_build_object('description_clusters',v_desc,'image_clusters',v_img);
end;
$$;
create or replace function public.event_quality_findings(p_event_id uuid)
returns table(dimension text, issue_code text, severity text, evidence jsonb)
language sql stable security definer set search_path to 'public','extensions','pg_temp'
as $$
  with e as (
    select ev.*,
      case when coalesce(ev.end_date,ev.start_date) >= now() then 'current' else 'historical' end as event_scope,
      c.country_id as linked_city_country_id,
      v.city_id as linked_venue_city_id,
      v.latitude as linked_venue_latitude,
      v.longitude as linked_venue_longitude,
      dc.event_count as description_reuse_count
    from public.events ev
    left join public.cities c on c.id=ev.city_id
    left join public.venues v on v.id=ev.venue_id
    left join public.event_quality_description_clusters dc
      on dc.fingerprint=public.event_quality_description_fingerprint(ev.description)
    where ev.id=p_event_id
  ), findings(dimension,issue_code,severity,evidence) as (
    select 'validity','GEO_NULL_ISLAND','critical',jsonb_build_object('latitude',latitude,'longitude',longitude)
      from e where latitude=0 and longitude=0
    union all
    select 'validity','GEO_PARTIAL','critical',jsonb_build_object('latitude',latitude,'longitude',longitude)
      from e where (latitude is null) <> (longitude is null)
    union all
    select 'validity','DATE_ORDER_INVALID','critical',jsonb_build_object('start_date',start_date,'end_date',end_date)
      from e where end_date is not null and end_date < start_date
    union all
    select 'linkage','CITY_COUNTRY_CONFLICT','critical',jsonb_build_object('event_country_id',country_id,'city_country_id',linked_city_country_id)
      from e where city_id is not null and country_id is not null and linked_city_country_id is not null
        and country_id<>linked_city_country_id
    union all
    select 'linkage','VENUE_CITY_CONFLICT','critical',jsonb_build_object('event_city_id',city_id,'venue_city_id',linked_venue_city_id,'venue_id',venue_id)
      from e where venue_id is not null and city_id is not null and linked_venue_city_id is not null
        and city_id<>linked_venue_city_id
    union all
    select 'linkage','VENUE_GEO_CONFLICT','high',jsonb_build_object('venue_id',venue_id,
      'distance_m',round(public.haversine_m(latitude,longitude,linked_venue_latitude,linked_venue_longitude)))
      from e where venue_id is not null and geo_linked_at is null
        and latitude is not null and longitude is not null
        and linked_venue_latitude is not null and linked_venue_longitude is not null
        and public.haversine_m(latitude,longitude,linked_venue_latitude,linked_venue_longitude)>5000
    union all
    select 'validity','WEBSITE_INVALID','critical',jsonb_build_object('value',website)
      from e where nullif(btrim(website),'') is not null and not public.event_quality_url_is_safe(website)
    union all
    select 'validity','TICKET_URL_INVALID','critical',jsonb_build_object('value',ticket_url)
      from e where nullif(btrim(ticket_url),'') is not null and not public.event_quality_url_is_safe(ticket_url)
    union all
    select 'provenance','SOURCE_MISSING','high','{}'::jsonb
      from e where nullif(btrim(data_source),'') is null
    union all
    select 'provenance','SOURCE_ID_MISSING','medium',jsonb_build_object('data_source',data_source)
      from e where nullif(btrim(data_source),'') is not null and nullif(btrim(external_id),'') is null
        and not exists(select 1 from public.event_sources es where es.event_id=e.id)
    union all
    select 'completeness','DESCRIPTION_MISSING','high','{}'::jsonb
      from e where length(btrim(coalesce(description,'')))<20
    union all
    select 'completeness','DESCRIPTION_THIN','medium',jsonb_build_object('length',length(btrim(description)))
      from e where length(btrim(coalesce(description,''))) between 20 and 79
    union all
    select 'validity','DESCRIPTION_HTML','medium','{}'::jsonb
      from e where coalesce(description,'') ~* '<[a-z][^>]*>'
    union all
    select 'validity','DESCRIPTION_BOILERPLATE','high',jsonb_build_object('sample',left(description,240))
      from e where lower(coalesce(description,'')) ~
        '(accept cookies|cookie policy|sign in to read|subscribe to continue|all rights reserved|privacy policy|erfasse deinen event schnell)'
    union all
    select 'validity','DESCRIPTION_REUSED','medium',jsonb_build_object('cluster_size',description_reuse_count,
      'fingerprint',public.event_quality_description_fingerprint(description))
      from e where coalesce(description_reuse_count,0)>=10 and coalesce(is_recurring,false)=false and series_key is null
    union all
    select 'media','IMAGE_MISSING','medium','{}'::jsonb
      from e where cardinality(coalesce(images,'{}'::text[]))=0 and nullif(btrim(logo_url),'') is null
    union all
    select 'media','IMAGE_PLACEHOLDER','critical',jsonb_build_object('urls',
      (select jsonb_agg(u) from unnest(coalesce(images,'{}'::text[])) u
       where lower(u) ~ '(default[_-]?event|placeholder|no[_-]?image|missing[_-]?image)'))
      from e where exists(select 1 from unnest(coalesce(images,'{}'::text[])) u
        where lower(u) ~ '(default[_-]?event|placeholder|no[_-]?image|missing[_-]?image)')
    union all
    select 'media','IMAGE_URL_INVALID','critical',jsonb_build_object('urls',
      (select jsonb_agg(u) from unnest(coalesce(images,'{}'::text[])) u
       where not public.event_quality_url_is_safe(u)))
      from e where exists(select 1 from unnest(coalesce(images,'{}'::text[])) u
        where not public.event_quality_url_is_safe(u))
    union all
    select 'media','IMAGE_REUSED','medium',jsonb_build_object('images',
      (select jsonb_agg(jsonb_build_object('url',u,'cluster_size',ic.event_count))
       from unnest(coalesce(images,'{}'::text[])) u
       join public.event_quality_image_clusters ic on ic.image_url=u where ic.event_count>=10))
      from e where coalesce(is_recurring,false)=false and series_key is null and exists(
        select 1 from unnest(coalesce(images,'{}'::text[])) u
        join public.event_quality_image_clusters ic on ic.image_url=u where ic.event_count>=10)
    union all
    select 'validity','CATEGORY_UNRESOLVED','medium',jsonb_build_object(
      'event_type',event_type,'classifier_version',1,
      'inference',public.infer_event_type(title,description))
      from e where event_type='other'
    union all
    select 'validity','STALE_CATEGORY_TAG','medium',jsonb_build_object('event_type',event_type,'tag','concert')
      from e where event_type<>'concert' and 'concert'=any(coalesce(tags,'{}'::text[]))
    union all
    select 'linkage','NAMED_VENUE_UNLINKED','medium',jsonb_build_object('venue_name',venue_name,'city_id',city_id)
      from e where nullif(btrim(venue_name),'') is not null and venue_id is null
    union all
    select 'deduplication','DEDUP_CANDIDATE',
      case when min(q.created_at)<now()-interval '14 days' then 'high' else 'medium' end,
      jsonb_build_object('candidate_count',count(*),'oldest_created_at',min(q.created_at),
        'pairs',jsonb_agg(jsonb_build_object('review_id',q.id,'keep_id',q.keep_id,
          'drop_id',q.drop_id,'confidence',q.confidence,'reason',q.reason)
          order by q.created_at) filter(where q.id is not null))
      from e join public.dedup_review_queue q on q.entity_type='event' and q.status='open'
        and e.id in (q.keep_id,q.drop_id)
      group by e.id
    union all
    select 'freshness','CURRENT_URL_MISSING','high',jsonb_build_object('scope',event_scope)
      from e where event_scope='current' and website is null and ticket_url is null
    union all
    select 'freshness','LIVENESS_STALE','high',jsonb_build_object('last_verified_at',last_verified_at,'liveness_status',liveness_status)
      from e where event_scope='current' and coalesce(status,'active')='active'
        and (website is not null or ticket_url is not null)
        and (last_verified_at is null or last_verified_at<now()-interval '7 days' or liveness_status='unknown')
    union all
    select 'freshness','HISTORICAL_UNCORROBORATED','medium',jsonb_build_object('last_verified_at',last_verified_at)
      from e where event_scope='historical' and last_verified_at is null
        and not exists(select 1 from public.event_sources es where es.event_id=e.id and es.source_url is not null)
  )
  select dimension::text,issue_code::text,severity::text,evidence from findings
$$;
revoke all on function public.event_quality_description_fingerprint(text) from public;
revoke all on function public.event_quality_url_is_safe(text) from public;
revoke all on function public.run_event_quality_cluster_refresh() from public,anon,authenticated;
revoke all on function public.event_quality_findings(uuid) from public,anon,authenticated;
grant execute on function public.run_event_quality_cluster_refresh() to service_role;
grant execute on function public.event_quality_findings(uuid) to service_role;
create or replace function public.claim_event_image_quality_candidates(
  p_claim_token uuid, p_limit integer default 25)
returns table(event_id uuid,image_url text)
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_token uuid;
begin
  insert into public.event_quality_worker_leases(worker,lease_token,lease_until,claimed_at)
  values('event-image-quality',p_claim_token,now()+interval '10 minutes',now())
  on conflict(worker) do update set lease_token=excluded.lease_token,
    lease_until=excluded.lease_until,claimed_at=excluded.claimed_at
  where public.event_quality_worker_leases.lease_until<now()
  returning lease_token into v_token;
  if v_token is distinct from p_claim_token then return; end if;

  return query
  select e.id,e.images[1]
  from public.events e
  left join public.event_image_quality_observations o
    on o.event_id=e.id and o.image_url=e.images[1]
  where e.duplicate_of_id is null and cardinality(coalesce(e.images,'{}'::text[]))>0
    and public.event_quality_url_is_safe(e.images[1])
    and (o.event_id is null or o.checked_at<greatest(e.updated_at,now()-interval '30 days'))
  order by (o.event_id is null) desc,o.checked_at nulls first,e.updated_at desc,e.id
  limit greatest(0,least(p_limit,100));
end;
$$;
create or replace function public.release_event_quality_worker_lease(p_worker text,p_claim_token uuid)
returns void language sql security definer set search_path to 'public','pg_temp'
as $$ delete from public.event_quality_worker_leases
  where worker=p_worker and lease_token=p_claim_token $$;
revoke all on function public.claim_event_image_quality_candidates(uuid,integer) from public,anon,authenticated;
revoke all on function public.release_event_quality_worker_lease(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_event_image_quality_candidates(uuid,integer) to service_role;
grant execute on function public.release_event_quality_worker_lease(text,uuid) to service_role;
-- ---------------------------------------------------------------------------
-- 3. Versioned scoring and idempotent scanner
-- ---------------------------------------------------------------------------

create or replace function public.compute_event_quality(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $$
declare
  e public.events%rowtype;
  v_scope text; v_completeness int:=0; v_validity int:=100; v_linkage int:=100;
  v_provenance int:=0; v_media int:=0; v_freshness int:=0; v_overall int;
  v_codes text[]:='{}'; v_blockers text[]:='{}'; v_high int:=0; v_tier text;
  f record; v_source_url boolean:=false; v_source_row boolean:=false; v_version int:=1;
begin
  select * into e from public.events where id=p_event_id;
  if not found or e.duplicate_of_id is not null then return null; end if;
  select rubric_version into v_version from public.event_quality_rollout where singleton;
  v_scope:=case when coalesce(e.end_date,e.start_date)>=now() then 'current' else 'historical' end;

  v_completeness :=
    (case when length(btrim(e.title))>=3 then 20 else 0 end)+
    (case when length(btrim(coalesce(e.description,'')))>=80 then 20
          when length(btrim(coalesce(e.description,'')))>=20 then 10 else 0 end)+
    (case when e.city_id is not null and e.country_id is not null then 20
          when e.city_id is not null or e.country_id is not null then 10 else 0 end)+
    (case when nullif(btrim(coalesce(e.data_source,'')),'') is not null then 15 else 0 end)+
    (case when e.website is not null or e.ticket_url is not null or v_scope='historical' then 10 else 0 end)+
    (case when cardinality(coalesce(e.images,'{}'::text[]))>0 or e.logo_url is not null then 10 else 0 end)+
    (case when e.event_type<>'other' then 5 else 0 end);

  select exists(select 1 from public.event_sources s where s.event_id=e.id),
         exists(select 1 from public.event_sources s where s.event_id=e.id and s.source_url is not null)
    into v_source_row,v_source_url;
  v_provenance :=
    (case when nullif(btrim(coalesce(e.data_source,'')),'') is not null then 30 else 0 end)+
    (case when nullif(btrim(coalesce(e.external_id,'')),'') is not null or v_source_row then 30 else 0 end)+
    (case when v_source_url then 25 else 0 end)+
    (case when coalesce(e.field_provenance,'{}'::jsonb)<>'{}'::jsonb then 15 else 0 end);

  v_media := case when cardinality(coalesce(e.images,'{}'::text[]))>0 or e.logo_url is not null then 100 else 0 end;
  if v_scope='current' then
    v_freshness := (case when e.liveness_status<>'unknown' then 50 else 0 end)+
      (case when e.last_verified_at>=now()-interval '7 days' then 50 else 0 end);
  else
    v_freshness := (case when v_source_row then 60 else 0 end)+
      (case when e.last_verified_at is not null then 20 else 0 end)+
      (case when e.status='completed' then 20 else 0 end);
  end if;

  for f in select * from public.event_quality_findings(e.id) loop
    v_codes:=array_append(v_codes,f.issue_code);
    if f.severity='critical' then v_blockers:=array_append(v_blockers,f.issue_code); end if;
    if f.severity='high' then v_high:=v_high+1; end if;
    if f.dimension='validity' then v_validity:=v_validity-case f.severity when 'critical' then 50 when 'high' then 20 when 'medium' then 10 else 5 end; end if;
    if f.dimension='linkage' then v_linkage:=v_linkage-case f.severity when 'critical' then 60 when 'high' then 30 when 'medium' then 15 else 5 end; end if;
    if f.dimension='media' then v_media:=v_media-case f.severity when 'critical' then 70 when 'high' then 30 when 'medium' then 20 else 5 end; end if;
    if f.dimension='freshness' then v_freshness:=v_freshness-case f.severity when 'critical' then 70 when 'high' then 35 when 'medium' then 15 else 5 end; end if;
  end loop;
  for f in select issue_code,severity,dimension from public.event_quality_issues
    where event_id=e.id and status='open' and detector<>'event-quality-scan'
  loop
    if not(f.issue_code=any(v_codes)) then v_codes:=array_append(v_codes,f.issue_code); end if;
    if f.severity='critical' then v_blockers:=array_append(v_blockers,f.issue_code); end if;
    if f.severity='high' then v_high:=v_high+1; end if;
    if f.dimension='media' then v_media:=v_media-case f.severity
      when 'critical' then 70 when 'high' then 30 when 'medium' then 20 else 5 end;
    end if;
  end loop;
  v_validity:=greatest(0,v_validity); v_linkage:=greatest(0,v_linkage);
  v_media:=greatest(0,v_media); v_freshness:=greatest(0,v_freshness);
  v_overall:=round(v_completeness*.20+v_validity*.25+v_linkage*.20+
    v_provenance*.15+v_media*.10+v_freshness*.10);
  v_tier:=case when cardinality(v_blockers)>0 or v_overall<70 then 'fail'
    when v_high>0 or v_overall<85 then 'warn' else 'pass' end;
  return jsonb_build_object('rubric_version',v_version,'event_scope',v_scope,
    'completeness_score',v_completeness,'validity_score',v_validity,
    'linkage_score',v_linkage,'provenance_score',v_provenance,'media_score',v_media,
    'freshness_score',v_freshness,'overall_score',v_overall,'quality_tier',v_tier,
    'issue_codes',to_jsonb(v_codes),'blocker_codes',to_jsonb(v_blockers));
end;
$$;
create or replace function public.run_event_quality_scan(
  p_batch integer default 500, p_scope text default 'all', p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare r record; f record; q jsonb; v_assessed int:=0; v_opened int:=0; v_resolved int:=0;
  v_just_resolved int:=0;
  v_codes text[]; v_open text[]; v_hash text; v_now timestamptz:=now();
begin
  perform public.assert_admin_or_internal();
  if not pg_try_advisory_xact_lock(hashtext('event_quality_scan')) then
    return jsonb_build_object('scope',p_scope,'dry_run',p_dry_run,'skipped','already_running');
  end if;
  if p_scope not in ('all','current','historical') then raise exception 'invalid event quality scope: %',p_scope; end if;
  for r in
    select e.* from public.events e left join public.event_quality_current qc on qc.event_id=e.id
    where e.duplicate_of_id is null
      and (p_scope='all' or (p_scope='current' and coalesce(e.end_date,e.start_date)>=now())
        or (p_scope='historical' and coalesce(e.end_date,e.start_date)<now()))
      and (qc.event_id is null or qc.input_updated_at<e.updated_at
        or exists(select 1 from public.event_quality_issues qi where qi.event_id=e.id
          and qi.detector<>'event-quality-scan'
          and greatest(qi.last_seen_at,coalesce(qi.resolved_at,'epoch'::timestamptz),
            coalesce(qi.reviewed_at,'epoch'::timestamptz))>qc.assessed_at)
        or exists(select 1 from public.dedup_review_queue dq where dq.entity_type='event'
          and dq.status='open' and e.id in (dq.keep_id,dq.drop_id)
          and dq.created_at>qc.assessed_at)
        or (exists(select 1 from public.event_quality_issues qi where qi.event_id=e.id
              and qi.status='open' and qi.issue_code='DEDUP_CANDIDATE')
          and not exists(select 1 from public.dedup_review_queue dq where dq.entity_type='event'
              and dq.status='open' and e.id in (dq.keep_id,dq.drop_id)))
        or (coalesce(e.end_date,e.start_date)>=now() and qc.assessed_at<now()-interval '24 hours')
        or (coalesce(e.end_date,e.start_date)<now() and qc.assessed_at<now()-interval '30 days')
        or qc.assessed_at<greatest(
          coalesce((select max(refreshed_at) from public.event_quality_description_clusters),'epoch'::timestamptz),
          coalesce((select max(refreshed_at) from public.event_quality_image_clusters),'epoch'::timestamptz)))
    order by (qc.event_id is null) desc,e.updated_at desc,e.id limit greatest(0,least(p_batch,5000))
  loop
    q:=public.compute_event_quality(r.id); v_assessed:=v_assessed+1;
    if p_dry_run then continue; end if;
    v_codes:=array(select jsonb_array_elements_text(q->'issue_codes'));
    insert into public.event_quality_current(event_id,rubric_version,event_scope,
      completeness_score,validity_score,linkage_score,provenance_score,media_score,
      freshness_score,overall_score,quality_tier,issue_codes,open_issue_codes,
      blocker_codes,assessed_at,input_updated_at,details)
    values(r.id,(q->>'rubric_version')::int,q->>'event_scope',
      (q->>'completeness_score')::int,(q->>'validity_score')::int,
      (q->>'linkage_score')::int,(q->>'provenance_score')::int,
      (q->>'media_score')::int,(q->>'freshness_score')::int,(q->>'overall_score')::int,
      q->>'quality_tier',v_codes,'{}',array(select jsonb_array_elements_text(q->'blocker_codes')),
      v_now,r.updated_at,jsonb_build_object('legacy_quality_score',r.quality_score))
    on conflict(event_id) do update set rubric_version=excluded.rubric_version,
      event_scope=excluded.event_scope,completeness_score=excluded.completeness_score,
      validity_score=excluded.validity_score,linkage_score=excluded.linkage_score,
      provenance_score=excluded.provenance_score,media_score=excluded.media_score,
      freshness_score=excluded.freshness_score,overall_score=excluded.overall_score,
      quality_tier=excluded.quality_tier,issue_codes=excluded.issue_codes,
      blocker_codes=excluded.blocker_codes,assessed_at=excluded.assessed_at,
      input_updated_at=excluded.input_updated_at,details=excluded.details;

    for f in select * from public.event_quality_findings(r.id) loop
      v_hash:=md5(f.evidence::text);
      if not exists(select 1 from public.event_quality_issues i where i.event_id=r.id
        and i.issue_code=f.issue_code and i.status='accepted' and i.evidence_hash=v_hash) then
        insert into public.event_quality_issues(event_id,dimension,issue_code,severity,evidence,evidence_hash,detected_at,last_seen_at)
        values(r.id,f.dimension,f.issue_code,f.severity,f.evidence,v_hash,
          case when f.issue_code='DEDUP_CANDIDATE' and f.evidence?'oldest_created_at'
            then least(v_now,(f.evidence->>'oldest_created_at')::timestamptz) else v_now end,v_now)
        on conflict(event_id,issue_code) where status='open' do update
          set dimension=excluded.dimension,severity=excluded.severity,evidence=excluded.evidence,
              evidence_hash=excluded.evidence_hash,last_seen_at=excluded.last_seen_at;
        if found then v_opened:=v_opened+1; end if;
      end if;
    end loop;
    update public.event_quality_issues set status='resolved',resolved_at=v_now,
      resolution='cleared_by_scan',reviewed_at=v_now
    where event_id=r.id and status='open' and detector='event-quality-scan'
      and not(issue_code=any(v_codes));
    get diagnostics v_just_resolved = row_count;
    v_resolved:=v_resolved+v_just_resolved;
    select coalesce(array_agg(issue_code order by issue_code),'{}') into v_open
      from public.event_quality_issues where event_id=r.id and status='open';
    update public.event_quality_current set open_issue_codes=v_open,
      issue_codes=(select coalesce(array_agg(distinct c order by c),'{}')
        from unnest(v_codes||v_open) c)
    where event_id=r.id;
  end loop;
  return jsonb_build_object('scope',p_scope,'dry_run',p_dry_run,'assessed',v_assessed,
    'issues_seen',v_opened,'issues_resolved',v_resolved);
end;
$$;
revoke all on function public.compute_event_quality(uuid) from public,anon,authenticated;
revoke all on function public.run_event_quality_scan(integer,text,boolean) from public,anon,authenticated;
grant execute on function public.compute_event_quality(uuid) to service_role;
grant execute on function public.run_event_quality_scan(integer,text,boolean) to authenticated,service_role;
create or replace function public.refresh_event_source_quality_snapshot(p_date date default current_date)
returns integer language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_rows integer;
begin
  perform public.assert_admin_or_internal();
  if not pg_try_advisory_xact_lock(hashtext('event_source_quality_snapshot')) then return 0; end if;
  insert into public.event_source_quality_daily(snapshot_date,source_slug,total_events,
    assessed_events,affected_events,critical_events,missing_source_id_events,
    assessment_rate,defect_rate,critical_rate,missing_source_id_rate,captured_at)
  select p_date,source_slug,count(*)::int,count(*) filter(where assessed)::int,
    count(*) filter(where affected)::int,count(*) filter(where critical)::int,
    count(*) filter(where missing_source_id)::int,
    count(*) filter(where assessed)::numeric/nullif(count(*),0),
    count(*) filter(where affected)::numeric/nullif(count(*),0),
    count(*) filter(where critical)::numeric/nullif(count(*),0),
    count(*) filter(where missing_source_id)::numeric/nullif(count(*),0),now()
  from (
    select e.id,coalesce(nullif(btrim(e.data_source),''),'(unknown)') source_slug,
      q.event_id is not null assessed,
      exists(select 1 from public.event_quality_issues i where i.event_id=e.id and i.status='open') affected,
      exists(select 1 from public.event_quality_issues i where i.event_id=e.id and i.status='open' and i.severity='critical') critical,
      nullif(btrim(e.external_id),'') is null
        and not exists(select 1 from public.event_sources es where es.event_id=e.id) missing_source_id
    from public.events e left join public.event_quality_current q on q.event_id=e.id
    where e.duplicate_of_id is null
  ) x group by source_slug
  on conflict(snapshot_date,source_slug) do update set
    total_events=excluded.total_events,assessed_events=excluded.assessed_events,
    affected_events=excluded.affected_events,critical_events=excluded.critical_events,
    missing_source_id_events=excluded.missing_source_id_events,
    assessment_rate=excluded.assessment_rate,defect_rate=excluded.defect_rate,
    critical_rate=excluded.critical_rate,missing_source_id_rate=excluded.missing_source_id_rate,
    captured_at=excluded.captured_at;
  get diagnostics v_rows=row_count;
  return v_rows;
end;
$$;
revoke all on function public.refresh_event_source_quality_snapshot(date) from public,anon,authenticated;
grant execute on function public.refresh_event_source_quality_snapshot(date) to service_role;
-- ---------------------------------------------------------------------------
-- 4. Review workflow, dashboard and rollout-aware gates
-- ---------------------------------------------------------------------------

create or replace function public.decide_event_quality_issue(p_issue_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_event_id uuid;
  v_severity text;
begin
  perform public.assert_admin_or_internal();
  if p_decision not in ('resolved','accepted') then raise exception 'decision must be resolved or accepted'; end if;
  if p_decision='accepted' and nullif(btrim(coalesce(p_note,'')),'') is null then
    raise exception 'accepted dispositions require a note';
  end if;
  select severity into v_severity from public.event_quality_issues where id=p_issue_id and status='open';
  if p_decision='accepted' and v_severity='critical' then
    raise exception 'critical event quality issues cannot be accepted; repair the invariant';
  end if;
  update public.event_quality_issues set status=p_decision,resolution=nullif(btrim(p_note),''),
    resolved_at=case when p_decision='resolved' then now() else null end,
    reviewed_at=now(),reviewed_by=auth.uid()
  where id=p_issue_id and status='open' returning event_id into v_event_id;
  if v_event_id is null then raise exception 'open event quality issue % not found',p_issue_id; end if;
  update public.event_quality_current set open_issue_codes=coalesce((select array_agg(issue_code order by issue_code)
    from public.event_quality_issues where event_id=v_event_id and status='open'),'{}') where event_id=v_event_id;
end;
$$;
create or replace function public.event_quality_snapshot()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $$
declare v jsonb;
begin
  if not public.has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]) then return null; end if;
  select jsonb_build_object(
    'rollout',(select to_jsonb(r) from public.event_quality_rollout r where singleton),
    'totals',jsonb_build_object(
      'canonical',(select count(*) from public.events where duplicate_of_id is null),
      'assessed',(select count(*) from public.event_quality_current),
      'current',(select count(*) from public.event_quality_current where event_scope='current'),
      'historical',(select count(*) from public.event_quality_current where event_scope='historical'),
      'open_issues',(select count(*) from public.event_quality_issues where status='open'),
      'accepted_dispositions',(select count(*) from public.event_quality_issues where status='accepted'),
      'oldest_high',(select min(detected_at) from public.event_quality_issues where status='open' and severity in ('critical','high'))),
    'tiers',(select coalesce(jsonb_object_agg(quality_tier,n),'{}') from
      (select quality_tier,count(*) n from public.event_quality_current group by quality_tier) x),
    'scopes',(select coalesce(jsonb_object_agg(event_scope,jsonb_build_object('total',n,'average',avg_score)),'{}') from
      (select event_scope,count(*) n,round(avg(overall_score),1) avg_score from public.event_quality_current group by event_scope) x),
    'dimensions',(select jsonb_build_object(
      'completeness',round(avg(completeness_score),1),'validity',round(avg(validity_score),1),
      'linkage',round(avg(linkage_score),1),'provenance',round(avg(provenance_score),1),
      'media',round(avg(media_score),1),'freshness',round(avg(freshness_score),1),
      'overall',round(avg(overall_score),1)) from public.event_quality_current),
    'issues',(select coalesce(jsonb_agg(jsonb_build_object('code',issue_code,'severity',severity,'count',n)
      order by case severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,n desc),'[]')
      from (select issue_code,severity,count(*) n from public.event_quality_issues where status='open'
        group by issue_code,severity) x),
    'sources',(select coalesce(jsonb_agg(jsonb_build_object('source',source,'total',total,'open_issues',open_issues,
      'affected_events',affected_events,'defect_rate',round(100.0*affected_events/nullif(total,0),1)) order by open_issues desc,total desc),'[]')
      from (select coalesce(e.data_source,'(unknown)') source,count(distinct e.id) total,
        count(distinct i.id) filter(where i.status='open') open_issues,
        count(distinct e.id) filter(where i.status='open') affected_events
        from public.events e left join public.event_quality_issues i on i.event_id=e.id
        where e.duplicate_of_id is null group by coalesce(e.data_source,'(unknown)')
        having count(distinct e.id)>=5) s)
  ) into v;
  return v;
end;
$$;
create or replace function public.event_quality_gate_checks()
returns table(gate text,severity text,failures bigint,detail jsonb)
language sql stable security definer set search_path to 'public','pg_temp'
as $$
  with rollout as (select enforcement_enabled from public.event_quality_rollout where singleton),
  g as (
    select 'geo_null_island' gate,'critical' desired,(select count(*) from public.events where duplicate_of_id is null and latitude=0 and longitude=0) failures
    union all select 'geo_partial','critical',(select count(*) from public.events where duplicate_of_id is null and (latitude is null)<>(longitude is null))
    union all select 'date_order','critical',(select count(*) from public.events where duplicate_of_id is null and end_date is not null and end_date<start_date)
    union all select 'city_country_conflict','critical',(select count(*) from public.events e join public.cities c on c.id=e.city_id where e.duplicate_of_id is null and e.country_id is not null and c.country_id is not null and e.country_id<>c.country_id)
    union all select 'venue_city_conflict','critical',(select count(*) from public.events e join public.venues v on v.id=e.venue_id where e.duplicate_of_id is null and e.city_id is not null and v.city_id is not null and e.city_id<>v.city_id)
    union all select 'invalid_urls','critical',(select count(*) from public.events where duplicate_of_id is null and ((website is not null and not public.event_quality_url_is_safe(website)) or (ticket_url is not null and not public.event_quality_url_is_safe(ticket_url))))
    union all select 'placeholder_images','critical',(select count(*) from public.events e where duplicate_of_id is null and exists(select 1 from unnest(coalesce(images,'{}'::text[])) u where lower(u)~'(default[_-]?event|placeholder|no[_-]?image|missing[_-]?image)'))
    union all select 'invalid_image_urls','critical',(select count(*) from public.events e where duplicate_of_id is null and exists(select 1 from unnest(coalesce(images,'{}'::text[])) u where not public.event_quality_url_is_safe(u)))
    union all select 'broken_merge_pointer','critical',(select count(*) from public.events e left join public.events p on p.id=e.duplicate_of_id where e.duplicate_of_id is not null and (p.id is null or p.duplicate_of_id is not null))
    union all select 'assessment_stale','critical',(select count(*) from public.events e left join public.event_quality_current q on q.event_id=e.id where e.duplicate_of_id is null and (q.event_id is null or q.input_updated_at<e.updated_at or (coalesce(e.end_date,e.start_date)>=now() and q.assessed_at<now()-interval '24 hours') or (coalesce(e.end_date,e.start_date)<now() and q.assessed_at<now()-interval '30 days')))
    union all select 'unresolved_quality_gaps','critical',(select count(*)
      from public.event_quality_issues where status='open' and issue_code in
        ('NAMED_VENUE_UNLINKED','CATEGORY_UNRESOLVED','DESCRIPTION_REUSED','IMAGE_MISSING'))
    union all select 'stale_dedup_reviews','critical',(select count(*) from public.dedup_review_queue
      where entity_type='event' and status='open' and created_at<now()-interval '14 days')
    union all select 'old_high_issues','critical',(select count(*) from public.event_quality_issues where status='open' and severity in ('critical','high') and detected_at<now()-interval '14 days')
    union all select 'source_quality_budgets','high',(select count(*)
      from public.event_source_quality_daily d
      join lateral (select b.* from public.event_source_quality_budgets b
        where b.source_slug in (d.source_slug,'*')
        order by (b.source_slug=d.source_slug) desc limit 1) b on true
      where d.snapshot_date=current_date and (d.assessment_rate<b.minimum_assessment_rate
        or d.defect_rate>b.maximum_defect_rate or d.critical_rate>b.maximum_critical_rate
        or d.missing_source_id_rate>b.maximum_missing_source_id_rate))
    union all select 'upcoming_liveness_slo','critical',(select case when count(*)=0 then 0 when 100.0*count(*) filter(where e.liveness_status<>'unknown' and e.last_verified_at>=now()-interval '7 days')/count(*)>=95 then 0 else count(*) filter(where e.liveness_status='unknown' or e.last_verified_at<now()-interval '7 days') end from public.events e where e.duplicate_of_id is null and coalesce(e.status,'active')='active' and coalesce(e.end_date,e.start_date)>=now() and (e.website is not null or e.ticket_url is not null))
  )
  select gate,case when desired='critical' and not rollout.enforcement_enabled then 'advisory' else desired end,
    failures,'{}'::jsonb from g cross join rollout
$$;
revoke all on function public.decide_event_quality_issue(uuid,text,text) from public,anon,authenticated;
revoke all on function public.event_quality_snapshot() from public,anon,authenticated;
revoke all on function public.event_quality_gate_checks() from public,anon,authenticated;
grant execute on function public.decide_event_quality_issue(uuid,text,text) to authenticated,service_role;
grant execute on function public.event_quality_snapshot() to authenticated,service_role;
grant execute on function public.event_quality_gate_checks() to service_role;
-- ---------------------------------------------------------------------------
-- 5. Dry-run-first deterministic repair runner. Never scheduled while shadowed.
-- ---------------------------------------------------------------------------

create or replace function public.run_event_quality_repairs(p_batch integer default 100,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare r record; v_candidates int:=0; v_changed int:=0; v_update jsonb;
begin
  perform public.assert_admin_or_internal();
  if not pg_try_advisory_xact_lock(hashtext('event_quality_repairs')) then
    return jsonb_build_object('dry_run',p_dry_run,'skipped','already_running');
  end if;
  for r in select distinct e.* from public.events e join public.event_quality_issues i on i.event_id=e.id
    where i.status='open' and i.issue_code in ('GEO_NULL_ISLAND','WEBSITE_INVALID','TICKET_URL_INVALID','IMAGE_PLACEHOLDER','IMAGE_URL_INVALID','VENUE_CITY_CONFLICT')
    order by e.updated_at,e.id limit greatest(0,least(p_batch,500))
  loop
    v_candidates:=v_candidates+1; v_update:='{}'::jsonb;
    if r.latitude=0 and r.longitude=0 then v_update:=v_update||jsonb_build_object('latitude',null,'longitude',null); end if;
    if r.website is not null and not public.event_quality_url_is_safe(r.website) then v_update:=v_update||jsonb_build_object('website',null); end if;
    if r.ticket_url is not null and not public.event_quality_url_is_safe(r.ticket_url) then v_update:=v_update||jsonb_build_object('ticket_url',null); end if;
    if exists(select 1 from public.venues v where v.id=r.venue_id and r.city_id is not null and v.city_id is not null and r.city_id<>v.city_id) then v_update:=v_update||jsonb_build_object('venue_id',null); end if;
    if exists(select 1 from unnest(coalesce(r.images,'{}'::text[])) u where lower(u)~'(default[_-]?event|placeholder|no[_-]?image|missing[_-]?image)' or not public.event_quality_url_is_safe(u)) then
      v_update:=v_update||jsonb_build_object('images',to_jsonb(array(select u from unnest(coalesce(r.images,'{}'::text[])) u where lower(u)!~'(default[_-]?event|placeholder|no[_-]?image|missing[_-]?image)' and public.event_quality_url_is_safe(u))));
    end if;
    if v_update<>'{}'::jsonb and not p_dry_run then
      update public.events set latitude=case when v_update?'latitude' then null else latitude end,
        longitude=case when v_update?'longitude' then null else longitude end,
        website=case when v_update?'website' then null else website end,
        ticket_url=case when v_update?'ticket_url' then null else ticket_url end,
        venue_id=case when v_update?'venue_id' then null else venue_id end,
        images=case when v_update?'images' then array(select jsonb_array_elements_text(v_update->'images')) else images end,
        field_provenance=jsonb_set(coalesce(field_provenance,'{}'::jsonb),'{quality_repairs}',
          jsonb_build_object('at',now(),'changes',v_update,'previous',jsonb_build_object(
            'latitude',r.latitude,'longitude',r.longitude,'website',r.website,'ticket_url',r.ticket_url,
            'venue_id',r.venue_id,'images',r.images)),true)
      where id=r.id;
      v_changed:=v_changed+1;
    end if;
  end loop;
  return jsonb_build_object('dry_run',p_dry_run,'candidates',v_candidates,'changed',v_changed);
end;
$$;
revoke all on function public.run_event_quality_repairs(integer,boolean) from public,anon,authenticated;
grant execute on function public.run_event_quality_repairs(integer,boolean) to authenticated,service_role;
-- Shadow scanner is safe to schedule: it writes only assessment/issue tables.
do $$ begin
  perform cron.unschedule('event_quality_scan') where exists(select 1 from cron.job where jobname='event_quality_scan');
  perform cron.unschedule('event_quality_cluster_refresh') where exists(select 1 from cron.job where jobname='event_quality_cluster_refresh');
  perform cron.unschedule('event_source_quality_snapshot') where exists(select 1 from cron.job where jobname='event_source_quality_snapshot');
exception when others then null; end $$;
select cron.schedule('event_quality_scan','*/5 * * * *',
  $$set statement_timeout='240s'; select public.run_event_quality_scan(1000,'all',false)$$);
select cron.schedule('event_quality_cluster_refresh','25 2 * * *',
  $$set statement_timeout='240s'; select public.run_event_quality_cluster_refresh()$$);
select cron.schedule('event_source_quality_snapshot','45 2 * * *',
  $$set statement_timeout='240s'; select public.refresh_event_source_quality_snapshot(current_date)$$);
-- Network media evidence is collected separately from the pure SQL scanner.
-- The endpoint is webhook/admin gated and remains assessment-only in shadow mode.
do $$ begin
  perform cron.unschedule('event_image_quality_audit')
    where exists(select 1 from cron.job where jobname='event_image_quality_audit');
exception when others then null; end $$;
select cron.schedule('event_image_quality_audit','*/5 * * * *',$cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/event-image-quality',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Webhook-Secret',(select decrypted_secret from vault.decrypted_secrets
        where name='event_quality_webhook_secret')),
    body := '{"batch_size":25,"dry_run":false}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id
$cron$);
insert into public.admin_automations(slug,name,description,managed_by,enabled,"trigger",schedule,action)
values('event_quality_scan','Assess event data quality',
  'Shadow-mode, versioned assessment of canonical events. Writes evidence and issues but never public event fields.',
  'system',true,jsonb_build_object('type','schedule'),'*/5 * * * *',jsonb_build_object('type','rpc','fn','run_event_quality_scan'))
on conflict(slug) do update set name=excluded.name,description=excluded.description,
  enabled=excluded.enabled,schedule=excluded.schedule,action=excluded.action;
insert into public.admin_automations(slug,name,description,managed_by,enabled,"trigger",schedule,action)
values('event_source_quality_snapshot','Measure event source quality',
  'Persists daily assessment, defect, critical-defect and missing-source-ID rates against configurable source budgets.',
  'system',true,jsonb_build_object('type','schedule'),'45 2 * * *',
  jsonb_build_object('type','rpc','fn','refresh_event_source_quality_snapshot'))
on conflict(slug) do update set name=excluded.name,description=excluded.description,
  enabled=excluded.enabled,schedule=excluded.schedule,action=excluded.action;
insert into public.admin_automations(slug,name,description,managed_by,enabled,"trigger",schedule,action)
values('event_image_quality','Audit event images',
  'Checks event images for safe URLs, reachability, MIME type, dimensions, byte size and exact content reuse; stores evidence only.',
  'system',true,jsonb_build_object('type','schedule'),'*/5 * * * *',
  jsonb_build_object('type','edge-function','fn','event-image-quality','batch_size',25))
on conflict(slug) do update set name=excluded.name,description=excluded.description,
  enabled=excluded.enabled,schedule=excluded.schedule,action=excluded.action;
insert into public.admin_automations(slug,name,description,managed_by,enabled,"trigger",schedule,action)
values('event_quality_repairs','Repair deterministic event defects',
  'Dry-run-first repairs for null-island coordinates, invalid URLs, placeholder images and contradictory venue links. Deliberately paused during shadow rollout.',
  'system',false,jsonb_build_object('type','manual'),null,jsonb_build_object('type','rpc','fn','run_event_quality_repairs','dry_run',true))
on conflict(slug) do update set name=excluded.name,description=excluded.description,
  enabled=false,action=excluded.action;
-- Fold the new review lifecycle into the shared cockpit/Quality Hub count.
-- This restates the latest function because PostgreSQL cannot append one key to
-- a returned jsonb object without owning the function body.
create or replace function public.get_admin_counts()
returns jsonb language plpgsql security definer set search_path to 'public'
as $admin_counts$
declare
  result jsonb; estimates jsonb; v_sla jsonb := '{}'::jsonb;
  v_cnt bigint; v_overdue bigint; r record;
  sla_feedback_h constant int := 48;
  sla_event_quality_h constant int := 336;
begin
  if not has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]) then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  select jsonb_object_agg(relname,reltuples::bigint) into estimates
  from pg_class where relnamespace='public'::regnamespace and relname=any(array[
    'venues','events','news_articles','personalities','cities','countries','hotels',
    'queer_villages','marketplace_listings','community_groups','unified_tags',
    'cms_pages','email_ingestions','workflow_runs','scrape_sources','content_links',
    'community_submissions','redirects']);
  result := coalesce(estimates,'{}'::jsonb);
  for r in select queue_key,view_name,count_key,count_prefix,sla_hours
           from triage_sources where active order by queue_key loop
    execute format(
      'select count(*),count(*) filter(where created_at < now() - %L::interval) from public.%I',
      r.sla_hours || ' hours',r.view_name) into v_cnt,v_overdue;
    result := result || jsonb_build_object(r.count_prefix||r.count_key,v_cnt)
      || jsonb_build_object(r.count_prefix||r.count_key||'_overdue',v_overdue);
    v_sla := v_sla || jsonb_build_object(r.count_key,r.sla_hours);
  end loop;
  result := result || jsonb_build_object(
    'review_feedback',(select count(*) from community_submissions
      where content_type='feedback' and feedback_status in ('new','under_review')),
    'review_feedback_overdue',(select count(*) from community_submissions
      where content_type='feedback' and feedback_status in ('new','under_review')
        and submitted_at < now()-(sla_feedback_h||' hours')::interval),
    'review_group_requests',(select count(*) from group_join_requests where status='pending'),
    'quality_existence',(select count(*) from entity_existence_audit
      where action='flag' and reverted_at is null),
    'quality_glossary',coalesce((select total_count from public.tag_editorial_queue(1,0,null) limit 1),0),
    'quality_personality',(select count(*) from public.personalities p
      where p.duplicate_of_id is null and coalesce(p.review_status,'') not in ('archived','rejected')
        and (p.needs_attention or exists(select 1 from public.personality_review_queue q
          where q.personality_id=p.id and q.status='open'))),
    'quality_event',(select count(*) from public.event_quality_issues where status='open'),
    'quality_event_overdue',(select count(*) from public.event_quality_issues
      where status='open' and severity in ('critical','high')
        and detected_at<now()-(sla_event_quality_h||' hours')::interval),
    'sla_hours',v_sla||jsonb_build_object('feedback',sla_feedback_h,
      'quality_event',sla_event_quality_h)
  );
  return result;
end;
$admin_counts$;
revoke all on function public.get_admin_counts() from public;
grant execute on function public.get_admin_counts() to authenticated,service_role;
commit;
