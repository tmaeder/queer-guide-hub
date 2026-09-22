-- Milestone data-quality programme. Adds evidence-aware scoring, source-health
-- tracking, lifecycle-aware remediation queues and conservative publication
-- gates without changing the public milestone RPC shape.

begin;

-- ---------------------------------------------------------------------------
-- 1. Taxonomy, quality state and applicability decisions
-- ---------------------------------------------------------------------------
alter table public.milestones drop constraint if exists milestones_category_check;
alter table public.milestones add constraint milestones_category_check check (
  category is null or category in (
    'uprising-movement','law-equality','law-decriminalization',
    'law-criminalization','depathologization','persecution-destruction',
    'culture-media','politics-representation','health-aids',
    'community-institution','other'
  )
);

alter table public.milestones
  add column if not exists quality_tier text generated always as (
    case when significance = 5 or is_featured then 'A'
         when significance = 4 then 'B' else 'C' end
  ) stored,
  add column if not exists quality_dimensions jsonb not null default '{}'::jsonb,
  add column if not exists quality_status text not null default 'needs_review',
  add column if not exists quality_score_version smallint not null default 2,
  add column if not exists image_waiver_reason text,
  add column if not exists link_requirement text not null default 'unknown',
  add column if not exists geography_exemption_reason text;

alter table public.milestones drop constraint if exists milestones_quality_status_check;
alter table public.milestones add constraint milestones_quality_status_check
  check (quality_status in ('ready','needs_review','blocked'));
alter table public.milestones drop constraint if exists milestones_link_requirement_check;
alter table public.milestones add constraint milestones_link_requirement_check
  check (link_requirement in ('unknown','required','not_applicable'));
alter table public.milestones drop constraint if exists milestones_image_waiver_nonblank;
alter table public.milestones add constraint milestones_image_waiver_nonblank
  check (image_waiver_reason is null or length(trim(image_waiver_reason)) >= 10);
alter table public.milestones drop constraint if exists milestones_geography_exemption_nonblank;
alter table public.milestones add constraint milestones_geography_exemption_nonblank
  check (geography_exemption_reason is null or length(trim(geography_exemption_reason)) >= 10);

create index if not exists idx_milestones_quality_work
  on public.milestones(quality_tier, quality_status, status, trust_score);

comment on column public.milestones.quality_tier is
  'A = significance 5 or featured; B = significance 4; C = significance 1-3.';
comment on column public.milestones.link_requirement is
  'Editorial applicability decision. Unknown is reviewable; links are only scored when required.';

-- ---------------------------------------------------------------------------
-- 2. Source registry. A URL can occur in more than one milestone because the
--    evidence claim is milestone-specific even when the network health is not.
-- ---------------------------------------------------------------------------
create table if not exists public.milestone_source_health (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones(id) on delete cascade,
  source_url text not null,
  canonical_url text not null,
  domain text not null,
  source_class text not null default 'unknown' check (source_class in (
    'primary_legal','institutional','reputable_secondary','encyclopedia',
    'community_timeline','weak_self_published','unknown'
  )),
  health_state text not null default 'unknown' check (health_state in (
    'unknown','healthy','redirected','blocked','rate_limited','missing','error','unsafe'
  )),
  http_status smallint,
  redirect_url text,
  archive_url text,
  supports text[] not null default '{}',
  last_checked_at timestamptz,
  next_check_at timestamptz not null default now(),
  check_attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (milestone_id, canonical_url)
);
create index if not exists idx_milestone_source_health_due
  on public.milestone_source_health(next_check_at, domain);
create index if not exists idx_milestone_source_health_mid
  on public.milestone_source_health(milestone_id, health_state);

alter table public.milestone_source_health enable row level security;
revoke all on public.milestone_source_health from anon, authenticated;
grant select, insert, update, delete on public.milestone_source_health to service_role;
grant select on public.milestone_source_health to authenticated;

drop policy if exists milestone_source_health_admin_read on public.milestone_source_health;
create policy milestone_source_health_admin_read on public.milestone_source_health
  for select to authenticated
  using (public.has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]));

create or replace function public.milestone_sources_valid(p_sources jsonb)
returns boolean language sql immutable parallel safe
set search_path to 'public','pg_temp'
as $$
  select coalesce(jsonb_typeof(p_sources)='array'
    and jsonb_array_length(p_sources)>0
    and not exists (
      select 1 from jsonb_array_elements(p_sources) e
      where nullif(trim(e->>'label'),'') is null
         or coalesce(e->>'url','') !~ '^https?://[^[:space:]]+$'
    ),false);
$$;

alter table public.milestones drop constraint if exists milestones_sources_valid;
alter table public.milestones add constraint milestones_sources_valid
  check (status<>'published' or public.milestone_sources_valid(sources)) not valid;

-- Canonicalization deliberately strips fragments and common tracking params,
-- but does not invent redirects or collapse distinct paths.
create or replace function public.canonical_milestone_source_url(p_url text)
returns text language sql immutable parallel safe
set search_path to 'public', 'pg_temp'
as $$
  select regexp_replace(
    regexp_replace(trim(p_url), '#.*$', ''),
    '([?&])(utm_[^=&]+|fbclid|gclid)=[^&]*(&|$)', '\1', 'gi'
  );
$$;

create or replace function public.classify_milestone_source(p_url text)
returns text language sql immutable parallel safe
set search_path to 'public', 'pg_temp'
as $$
  select case
    when lower(p_url) ~ '\.(gov|gov\.[a-z]{2}|parliament|europa\.eu|un\.org)(/|$)' then 'primary_legal'
    when lower(p_url) ~ '(archives|museum|university|\.edu|who\.int|amnesty\.org|hrw\.org)' then 'institutional'
    when lower(p_url) ~ '(reuters|apnews|bbc\.|nytimes|guardian|washingtonpost|lemonde|dw\.com)' then 'reputable_secondary'
    when lower(p_url) ~ '(wikipedia\.org|britannica\.com)' then 'encyclopedia'
    when lower(p_url) ~ '(timeline|historyproject|lgbtq.*archive|queer.*archive)' then 'community_timeline'
    when lower(p_url) ~ '(blogspot|wordpress\.com|medium\.com|substack\.com)' then 'weak_self_published'
    else 'unknown'
  end;
$$;

create or replace function public.sync_milestone_source_health(p_milestone_id uuid default null)
returns integer language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_count integer;
begin
  insert into public.milestone_source_health
    (milestone_id, source_url, canonical_url, domain, source_class)
  select m.id, s.url, public.canonical_milestone_source_url(s.url),
         lower(split_part(regexp_replace(s.url, '^https?://', '', 'i'), '/', 1)),
         public.classify_milestone_source(s.url)
  from public.milestones m
  cross join lateral (
    select trim(e->>'url') as url from jsonb_array_elements(coalesce(m.sources,'[]'::jsonb)) e
    where nullif(trim(e->>'url'),'') is not null
  ) s
  where (p_milestone_id is null or m.id = p_milestone_id)
  on conflict (milestone_id, canonical_url) do update
    set source_url=excluded.source_url, domain=excluded.domain,
        source_class=case when public.milestone_source_health.source_class='unknown'
                          then excluded.source_class else public.milestone_source_health.source_class end,
        updated_at=now();
  get diagnostics v_count = row_count;

  delete from public.milestone_source_health h
  where (p_milestone_id is null or h.milestone_id=p_milestone_id)
    and not exists (
      select 1 from public.milestones m
      cross join lateral jsonb_array_elements(coalesce(m.sources,'[]'::jsonb)) e
      where m.id=h.milestone_id
        and public.canonical_milestone_source_url(e->>'url')=h.canonical_url
    );
  return v_count;
end;
$$;

-- Claiming advances next_check_at before returning rows, preventing parallel
-- workers from hammering the same domain. The worker still processes rows
-- sequentially per domain.
create or replace function public.claim_milestone_source_health(p_limit integer default 50)
returns table(id uuid, milestone_id uuid, source_url text, domain text, check_attempts integer,
  milestone_date date, date_precision text)
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  return query
  with picked as (
    select h.id from public.milestone_source_health h
    where h.next_check_at <= now()
    order by h.next_check_at, h.domain
    for update skip locked
    limit greatest(1, least(p_limit, 200))
  ), upd as (
    update public.milestone_source_health h
    set next_check_at=now()+interval '20 minutes', updated_at=now()
    from picked where h.id=picked.id
    returning h.id,h.milestone_id,h.source_url,h.domain,h.check_attempts
  ) select u.*,m.date,m.date_precision from upd u join public.milestones m on m.id=u.milestone_id;
end;
$$;

create or replace function public.release_milestone_source_health_claims(p_ids uuid[])
returns integer language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_count integer;
begin
  update public.milestone_source_health set next_check_at=now(),updated_at=now()
  where id=any(coalesce(p_ids,'{}'::uuid[]));
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function public.mark_milestone_sources_for_rescore(p_ids uuid[])
returns integer language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_count integer;
begin
  update public.milestones set last_verified_at=null
  where id=any(coalesce(p_ids,'{}'::uuid[]));
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

-- Seed the registry without asserting that an unchecked URL is healthy.
select public.sync_milestone_source_health(null);

-- ---------------------------------------------------------------------------
-- 3. Controlled relationship semantics
-- ---------------------------------------------------------------------------
alter table public.milestone_links add column if not exists role_kind text;
alter table public.milestone_links drop constraint if exists milestone_links_role_kind_check;
alter table public.milestone_links add constraint milestone_links_role_kind_check check (
  role_kind is null or role_kind in (
    'subject','participant','organizer','decision-maker','affected-person','location','coverage'
  )
);
alter table public.milestone_link_proposals add column if not exists proposed_role_kind text;
alter table public.milestone_link_proposals drop constraint if exists milestone_link_proposals_role_kind_check;
alter table public.milestone_link_proposals add constraint milestone_link_proposals_role_kind_check check (
  proposed_role_kind is null or proposed_role_kind in (
    'subject','participant','organizer','decision-maker','affected-person','location','coverage'
  )
);

-- Duplicate candidates have their own review queue because milestones are not
-- cms_content rows. The candidate key is ordered to make reruns idempotent.
create table if not exists public.milestone_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  milestone_id_1 uuid not null references public.milestones(id) on delete cascade,
  milestone_id_2 uuid not null references public.milestones(id) on delete cascade,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  signals jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','confirmed','dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  reviewer_note text,
  created_at timestamptz not null default now(),
  check (milestone_id_1 < milestone_id_2),
  unique(milestone_id_1,milestone_id_2)
);
create index if not exists idx_milestone_duplicates_review
  on public.milestone_duplicate_candidates(status,confidence desc);
alter table public.milestone_duplicate_candidates enable row level security;
revoke all on public.milestone_duplicate_candidates from anon,authenticated;
grant select,insert,update,delete on public.milestone_duplicate_candidates to service_role;
grant select on public.milestone_duplicate_candidates to authenticated;
drop policy if exists milestone_duplicate_candidates_admin_read on public.milestone_duplicate_candidates;
create policy milestone_duplicate_candidates_admin_read on public.milestone_duplicate_candidates
  for select to authenticated using (public.has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]));

-- Existing free-text roles are notes, not controlled semantics. Queue them for
-- review instead of guessing a role from entity type.
alter table public.milestone_review_queue drop constraint if exists milestone_review_queue_field_check;
alter table public.milestone_review_queue add constraint milestone_review_queue_field_check
  check (field in ('category','link_role','description','duplicate'));
drop index if exists public.uq_milestone_review_queue_open;
create unique index uq_milestone_review_queue_open
  on public.milestone_review_queue(milestone_id,field,coalesce(proposed_value->>'link_id',''))
  where status='open';
insert into public.milestone_review_queue(milestone_id,field,proposed_value,citations,confidence,model)
select l.milestone_id,'link_role',
  jsonb_build_object('link_id',l.id,'entity_type',l.entity_type,'suggested_role',
    case l.entity_type when 'news' then 'coverage' when 'venue' then 'location'
         when 'organization' then 'organizer' else 'subject' end),
  '[]'::jsonb,.70,'mechanical:link-role-v1'
from public.milestone_links l where l.role_kind is null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. Evidence-aware dimension calculator. Completeness measures whether a
--    record is usable. Trust measures evidence, not how many fields are filled.
-- ---------------------------------------------------------------------------
alter table public.milestone_quality_signals drop constraint if exists milestone_quality_signals_signal_type_check;
alter table public.milestone_quality_signals add constraint milestone_quality_signals_signal_type_check
  check (signal_type in (
    'completeness','corroboration','linkage','category_fit','admin_feedback',
    'source_health','editorial_quality','taxonomy_fit','geography','media',
    'duplicate_risk','date_evidence','publication_gate'
  ));
update public.milestone_quality_signals set source='' where source is null;
delete from public.milestone_quality_signals a using public.milestone_quality_signals b
where a.milestone_id=b.milestone_id and a.signal_type=b.signal_type
  and a.source=b.source and (a.created_at,a.id)<(b.created_at,b.id);
alter table public.milestone_quality_signals alter column source set default '';
alter table public.milestone_quality_signals alter column source set not null;
create unique index if not exists uq_milestone_quality_signal_current
  on public.milestone_quality_signals(milestone_id, signal_type, source);

create or replace function public.milestone_editorial_issues(p_description text)
returns text[] language sql immutable parallel safe
set search_path to 'public','pg_temp'
as $$
  select array_remove(array[
    case when coalesce(p_description,'') ~* '\m(allegedly|reportedly|possibly|perhaps|may have|believed to|it is unclear|uncertain)\M'
      then 'uncertainty_language' end,
    case when coalesce(p_description,'') ~* '\m(first ever|most important|unprecedented|undeniably|without doubt|groundbreaking|iconic)\M'
      then 'editorialized_language' end
  ],null);
$$;

create or replace function public.compute_milestone_quality_dimensions(p_id uuid)
returns jsonb language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
with x as (
  select m.*,
    jsonb_array_length(coalesce(m.sources,'[]'::jsonb)) as source_count,
    (select count(distinct nullif(h.domain,'')) from public.milestone_source_health h
      where h.milestone_id=m.id and h.health_state in ('healthy','redirected')) as independent_domains,
    (select count(*) from public.milestone_source_health h where h.milestone_id=m.id
      and h.source_class in ('primary_legal','institutional')
      and h.health_state in ('healthy','redirected')) as authoritative_sources,
    (select count(*) from public.milestone_source_health h where h.milestone_id=m.id
      and h.health_state in ('healthy','redirected') and 'date'=any(h.supports)) as date_sources,
    (select count(*) from public.milestone_source_health h where h.milestone_id=m.id
      and h.health_state in ('healthy','redirected') and 'date'=any(h.supports)
      and h.source_class in ('primary_legal','institutional')) as authoritative_date_sources,
    (select count(*) from public.milestone_source_health h where h.milestone_id=m.id
      and h.health_state in ('healthy','redirected')) as healthy_sources,
    (select count(*) from public.milestone_source_health h where h.milestone_id=m.id
      and h.health_state='missing') as missing_sources,
    (select count(*) from public.milestone_source_health h where h.milestone_id=m.id
      and h.health_state in ('unknown','blocked','rate_limited','error')) as unverified_sources,
    exists(select 1 from public.milestone_links l where l.milestone_id=m.id and l.role_kind is not null) as has_typed_link,
    exists(select 1 from public.milestone_review_queue q where q.milestone_id=m.id and q.status='open') as open_review,
    exists(select 1 from public.milestone_link_proposals q where q.milestone_id=m.id and q.status='pending') as open_link_review,
    exists(select 1 from public.milestone_duplicate_candidates d
      where d.status in ('pending','confirmed') and d.confidence >= 0.9
      and (d.milestone_id_1=m.id or d.milestone_id_2=m.id)) as high_duplicate_risk
  from public.milestones m where m.id=p_id
), d as (
  select x.*,
    (description is not null and length(trim(description)) >= 40) as description_ok,
    (source_count > 0) as source_present,
    (category is not null and category <> 'other') as taxonomy_ok,
    (country_id is not null or city_id is not null or geography_exemption_reason is not null
      or (country_name is null and city_name is null)) as geography_ok,
    (image_url is null or (
      nullif(trim(image_metadata->>'alt'),'') is not null and
      nullif(trim(image_metadata->>'source'),'') is not null and
      nullif(trim(image_metadata->>'license'),'') is not null
    )) as displayed_media_ok,
    (case when quality_tier='A' then image_url is not null or image_waiver_reason is not null else true end) as tier_media_ok,
    (case when link_requirement='required' then has_typed_link
          when link_requirement='not_applicable' then true else quality_tier='C' end) as linkage_ok,
    (case when quality_tier='A' then independent_domains >= 2 and authoritative_sources >= 1
          when quality_tier='B' then authoritative_sources >= 1 or independent_domains >= 2
          else source_count >= 1 end) as corroboration_ok,
    (missing_sources=0 and healthy_sources>0) as source_health_ok,
    cardinality(public.milestone_editorial_issues(description))=0 as editorial_ok
  from x
)
select jsonb_build_object(
  'tier',quality_tier,
  'date_evidence',jsonb_build_object('pass',date_sources>0 and (quality_tier<>'A' or authoritative_date_sources>0),
    'precision',date_precision,'supporting_sources',date_sources,'authoritative_sources',authoritative_date_sources),
  'description',jsonb_build_object('pass',description_ok),
  'sources',jsonb_build_object('pass',source_present,'count',source_count),
  'source_health',jsonb_build_object('pass',source_health_ok,'healthy',healthy_sources,'missing',missing_sources,'unverified',unverified_sources),
  'corroboration',jsonb_build_object('pass',corroboration_ok,'independent_domains',independent_domains,'authoritative',authoritative_sources),
  'editorial_quality',jsonb_build_object('pass',editorial_ok,'issues',to_jsonb(public.milestone_editorial_issues(description))),
  'taxonomy_fit',jsonb_build_object('pass',taxonomy_ok),
  'geography',jsonb_build_object('pass',geography_ok,'exempt',geography_exemption_reason is not null),
  'linkage',jsonb_build_object('pass',linkage_ok,'applicability',link_requirement,'typed_link',has_typed_link),
  'media',jsonb_build_object('pass',displayed_media_ok and tier_media_ok,'displayed_metadata',displayed_media_ok,'waived',image_waiver_reason is not null),
  'duplicate_risk',jsonb_build_object('pass',not high_duplicate_risk),
  'review_state',jsonb_build_object('pass',not open_review and not open_link_review),
  'completeness_score',(
    (case when description_ok then 20 else 0 end) +
    (case when source_present then 25 else 0 end) +
    (case when taxonomy_ok then 15 else 0 end) +
    (case when geography_ok then 15 else 0 end) +
    (case when displayed_media_ok and tier_media_ok then 10 else 0 end) +
    (case when linkage_ok then 10 else 0 end) +
    (case when review_status='approved' then 5 else 0 end)
  ),
  'trust_score',(
    (case when source_health_ok then 25 else 0 end) +
    (case when corroboration_ok then 20 else 0 end) +
    (case when date_sources>0 and (quality_tier<>'A' or authoritative_date_sources>0) then 15 else 0 end) +
    (case when editorial_ok then 10 else 0 end) +
    (case when taxonomy_ok then 10 else 0 end) +
    (case when geography_ok then 5 else 0 end) +
    (case when not high_duplicate_risk then 10 else 0 end) +
    (case when review_status='approved' and not open_review then 5 else 0 end)
  ),
  'failed_dimensions', to_jsonb(array_remove(array[
    case when not description_ok then 'description' end,
    case when not source_present then 'sources' end,
    case when not (date_sources>0 and (quality_tier<>'A' or authoritative_date_sources>0)) then 'date_evidence' end,
    case when not source_health_ok then 'source_health' end,
    case when not corroboration_ok then 'corroboration' end,
    case when not editorial_ok then 'editorial_quality' end,
    case when not taxonomy_ok then 'taxonomy_fit' end,
    case when not geography_ok then 'geography' end,
    case when not linkage_ok then 'linkage' end,
    case when not (displayed_media_ok and tier_media_ok) then 'media' end,
    case when high_duplicate_risk then 'duplicate_risk' end,
    case when open_review or open_link_review then 'review_state' end
  ],null))
)
from d;
$$;

create or replace function public.compute_milestone_completeness(p_id uuid)
returns smallint language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$ select coalesce((public.compute_milestone_quality_dimensions(p_id)->>'completeness_score')::smallint,0) $$;

create or replace function public.run_milestone_trust_recompute(p_limit int default 3500, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_changed integer:=0; v_automation_id uuid; v_run_id bigint;
begin
  perform public.sync_milestone_source_health(null);
  select id into v_automation_id from public.admin_automations where slug='milestone_trust_recompute';
  insert into public.admin_automation_runs(automation_id,automation_slug,started_at,status)
    values(v_automation_id,'milestone_trust_recompute',now(),'success') returning id into v_run_id;
  with scope as (
    select id from public.milestones where duplicate_of_id is null and (
      p_force or last_verified_at is null or updated_at>last_verified_at
      or last_verified_at<now()-interval '30 days')
    order by quality_tier,last_verified_at nulls first limit greatest(1,least(p_limit,4000))
  ), calc as (
    select s.id, public.compute_milestone_quality_dimensions(s.id) d from scope s
  ), upd as (
    update public.milestones m set
      quality_dimensions=calc.d,
      completeness_score=(calc.d->>'completeness_score')::smallint,
      trust_score=(calc.d->>'trust_score')::smallint,
      needs_attention=jsonb_array_length(calc.d->'failed_dimensions')>0,
      quality_status=case
        when calc.d->'duplicate_risk'->>'pass'='false' or calc.d->'sources'->>'pass'='false' then 'blocked'
        when jsonb_array_length(calc.d->'failed_dimensions')>0 then 'needs_review' else 'ready' end,
      quality_score_version=2,last_verified_at=now()
    from calc where m.id=calc.id returning m.id,m.quality_dimensions
  ) select count(*) into v_changed from upd;

  insert into public.milestone_quality_signals(milestone_id,signal_type,value,source,details)
  select m.id, k.key,
    case when coalesce((k.value->>'pass')::boolean,false) then 1 else 0 end,
    'milestone_quality_v2',k.value
  from public.milestones m
  cross join lateral jsonb_each(m.quality_dimensions) k
  where m.last_verified_at>now()-interval '5 minutes'
    and k.key in ('source_health','corroboration','date_evidence','editorial_quality','taxonomy_fit','geography','linkage','media','duplicate_risk')
  on conflict (milestone_id,signal_type,source) do update
    set value=excluded.value,details=excluded.details,created_at=now();

  update public.admin_automation_runs set finished_at=now(),items_examined=v_changed,
    items_changed=v_changed,summary=jsonb_build_object('rescored',v_changed,'score_version',2)
    where id=v_run_id;
  update public.admin_automations set last_run_at=now(),last_run_status='success' where id=v_automation_id;
  return jsonb_build_object('rescored',v_changed,'score_version',2);
exception when others then
  if v_run_id is not null then update public.admin_automation_runs set finished_at=now(),status='failed',error_message=sqlerrm where id=v_run_id; end if;
  raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Lifecycle-aware coverage radar and category proposal producer
-- ---------------------------------------------------------------------------
alter table public.milestone_coverage_gaps drop constraint if exists milestone_coverage_gaps_resolution_check;
alter table public.milestone_coverage_gaps add constraint milestone_coverage_gaps_resolution_check
  check (resolution in ('enrich','link','categorize','review','source','media','duplicate'));

create or replace function public.run_milestone_coverage_radar(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_upserted integer:=0; v_removed integer:=0; v_automation_id uuid; v_run_id bigint;
begin
  select id into v_automation_id from public.admin_automations where slug='milestone_coverage_radar';
  insert into public.admin_automation_runs(automation_id,automation_slug,started_at,status)
    values(v_automation_id,'milestone_coverage_radar',now(),'success') returning id into v_run_id;
  delete from public.milestone_coverage_gaps g where not exists(
    select 1 from public.milestones m where m.id=g.milestone_id and m.duplicate_of_id is null);
  get diagnostics v_removed=row_count;
  with cand as (
    select m.id,m.title,(100-m.completeness_score)::smallint gap_score,
      array(select jsonb_array_elements_text(coalesce(m.quality_dimensions->'failed_dimensions','[]'::jsonb))) missing
    from public.milestones m where m.duplicate_of_id is null
  ), ups as (
    insert into public.milestone_coverage_gaps(milestone_id,milestone_title,gap_score,missing_fields,resolution,status,last_checked_at)
    select id,title,gap_score,missing,
      case when 'duplicate_risk'=any(missing) then 'duplicate'
           when 'sources'=any(missing) or 'source_health'=any(missing) or 'corroboration'=any(missing) then 'source'
           when 'taxonomy_fit'=any(missing) then 'categorize'
           when 'linkage'=any(missing) or 'geography'=any(missing) then 'link'
           when 'media'=any(missing) then 'media' else 'review' end,
      case when cardinality(missing)=0 then 'resolved' else 'open' end,now()
    from cand
    on conflict(milestone_id) do update set milestone_title=excluded.milestone_title,
      gap_score=excluded.gap_score,missing_fields=excluded.missing_fields,resolution=excluded.resolution,
      status=case when cardinality(excluded.missing_fields)=0 then 'resolved'
                  when milestone_coverage_gaps.status='ignored' then 'ignored' else 'open' end,
      last_checked_at=now() returning 1
  ) select count(*) into v_upserted from ups;
  update public.admin_automation_runs set finished_at=now(),items_examined=v_upserted,
    items_changed=v_upserted+v_removed,summary=jsonb_build_object('upserted',v_upserted,'stale_removed',v_removed)
    where id=v_run_id;
  update public.admin_automations set last_run_at=now(),last_run_status='success' where id=v_automation_id;
  return jsonb_build_object('upserted',v_upserted,'stale_removed',v_removed);
end;
$$;

create or replace function public.suggest_milestone_category(p_title text,p_description text)
returns table(category text,confidence numeric,reason text)
language sql immutable parallel safe set search_path to 'public','pg_temp'
as $$
  with s as (select lower(coalesce(p_title,'')||' '||coalesce(p_description,'')) t)
  select case
    when t ~ '(hiv|aids|health|medical|clinic|hospital|disease|epidemic)' then 'health-aids'
    when t ~ '(film|book|novel|television|tv |music|album|theatre|theater|art|media|newspaper)' then 'culture-media'
    when t ~ '(elected|parliament|minister|mayor|senator|politician|representation|office)' then 'politics-representation'
    when t ~ '(center|centre|organization|organisation|institute|archive|community|founded|opened)' then 'community-institution'
    when t ~ '(decriminal|repeal.*criminal|legalis|legaliz)' then 'law-decriminalization'
    when t ~ '(marriage|equality|adoption|civil union|anti-discrimination)' then 'law-equality'
    when t ~ '(criminalis|criminaliz|ban |prohibit)' then 'law-criminalization'
    when t ~ '(riot|uprising|protest|march|movement|demonstrat|act up)' then 'uprising-movement'
    when t ~ '(patholog|diagnos|dsm|icd)' then 'depathologization'
    when t ~ '(persecut|destroy|raid|murder|massacre|holocaust|paragraph 175)' then 'persecution-destruction'
    else null end,
    case when t ~ '(hiv|aids|decriminal|marriage|elected|parliament|riot|uprising|patholog|persecut|massacre)' then .96 else .86 end,
    'deterministic keyword rule v1' from s;
$$;

create or replace function public.run_milestone_category_proposals(p_limit integer default 500,p_force boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_count integer;
begin
  with proposals as (
    select m.id,m.sources,s.category,s.confidence,s.reason
    from public.milestones m cross join lateral public.suggest_milestone_category(m.title,m.description) s
    where m.duplicate_of_id is null and m.category='other' and s.category is not null
      and (p_force or not exists(select 1 from public.milestone_review_queue q where q.milestone_id=m.id and q.field='category' and q.status='open'))
    order by m.quality_tier,m.significance desc,m.date limit greatest(1,least(p_limit,2000))
  ), ins as (
    insert into public.milestone_review_queue(milestone_id,field,proposed_value,citations,confidence,model)
    select id,'category',jsonb_build_object('value',category,'reason',reason),sources,confidence,'deterministic:milestone-category-v1'
    from proposals on conflict do nothing returning milestone_id
  ) select count(*) into v_count from ins;
  update public.milestones set needs_attention=true where id in (
    select milestone_id from public.milestone_review_queue where status='open');
  return jsonb_build_object('proposals_created',v_count);
end;
$$;

create or replace function public.run_milestone_editorial_review(p_limit integer default 500,p_force boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_created integer:=0; v_resolved integer:=0;
begin
  update public.milestone_review_queue q set status='approved',reviewed_at=now(),
    reviewer_note='auto-resolved: description no longer contains flagged language'
  from public.milestones m
  where q.milestone_id=m.id and q.field='description' and q.status='open'
    and cardinality(public.milestone_editorial_issues(m.description))=0;
  get diagnostics v_resolved=row_count;

  with candidates as (
    select m.id,m.description,m.sources,public.milestone_editorial_issues(m.description) issues
    from public.milestones m
    where m.duplicate_of_id is null
      and cardinality(public.milestone_editorial_issues(m.description))>0
      and (p_force or not exists(select 1 from public.milestone_review_queue q
        where q.milestone_id=m.id and q.field='description' and q.status='open'))
    order by m.quality_tier,m.significance desc,m.date
    limit greatest(1,least(p_limit,2000))
  ), ins as (
    insert into public.milestone_review_queue(milestone_id,field,proposed_value,citations,confidence,model)
    select id,'description',jsonb_build_object('issues',issues,'current',description),sources,1,
      'deterministic:milestone-editorial-v1' from candidates
    on conflict do nothing returning milestone_id
  ) select count(*) into v_created from ins;
  update public.milestones set needs_attention=true,last_verified_at=null
  where id in (select milestone_id from public.milestone_review_queue where field='description' and status='open');
  return jsonb_build_object('created',v_created,'auto_resolved',v_resolved);
end;
$$;

-- Date/jurisdiction/entity-aware duplicate candidates. Country-blind title
-- similarity is intentionally excluded because legal milestones recur across
-- jurisdictions. No candidate is merged automatically.
create or replace function public.run_milestone_duplicate_detection(p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path to 'public','extensions','pg_temp'
as $$
declare v_count integer;
begin
  with pairs as (
    select least(a.id,b.id) id1,greatest(a.id,b.id) id2,
      similarity(lower(a.title),lower(b.title)) title_similarity,
      (a.date between b.date-interval '366 days' and coalesce(b.date_end,b.date)+interval '366 days'
       or b.date between a.date-interval '366 days' and coalesce(a.date_end,a.date)+interval '366 days') date_near,
      (a.country_id is not null and a.country_id=b.country_id) same_country,
      exists(select 1 from public.milestone_links la join public.milestone_links lb
        on la.entity_type=lb.entity_type and la.entity_id=lb.entity_id
        where la.milestone_id=a.id and lb.milestone_id=b.id) shared_entity
    from public.milestones a join public.milestones b on a.id<b.id
    where a.duplicate_of_id is null and b.duplicate_of_id is null
      and a.status<>'archived' and b.status<>'archived'
      and (a.country_id is not null and a.country_id=b.country_id
           or exists(select 1 from public.milestone_links la join public.milestone_links lb
             on la.entity_type=lb.entity_type and la.entity_id=lb.entity_id
             where la.milestone_id=a.id and lb.milestone_id=b.id))
      and similarity(lower(a.title),lower(b.title))>=.55
      and (a.date between b.date-interval '366 days' and coalesce(b.date_end,b.date)+interval '366 days'
           or b.date between a.date-interval '366 days' and coalesce(a.date_end,a.date)+interval '366 days')
  ), ranked as (
    select *,least(.99,title_similarity + case when same_country then .08 else 0 end
      + case when shared_entity then .12 else 0 end)::numeric(4,3) confidence
    from pairs order by confidence desc limit greatest(1,least(p_limit,2000))
  ), ins as (
    insert into public.milestone_duplicate_candidates(milestone_id_1,milestone_id_2,confidence,signals)
    select id1,id2,confidence,jsonb_build_object('title_similarity',title_similarity,
      'date_near',date_near,'same_country',same_country,'shared_entity',shared_entity)
    from ranked where confidence>=.70
    on conflict(milestone_id_1,milestone_id_2) do update
      set confidence=excluded.confidence,signals=excluded.signals
      where public.milestone_duplicate_candidates.status='pending'
    returning 1
  ) select count(*) into v_count from ins;
  return jsonb_build_object('candidates_upserted',v_count);
end;
$$;

create or replace function public.run_milestone_geography_resolution(p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_countries integer:=0; v_cities integer:=0;
begin
  with candidates as (
    select m.id,(array_agg(c.id))[1] country_id
    from public.milestones m join public.countries c
      on lower(trim(m.country_name)) in (lower(c.name),lower(c.code),lower(coalesce(c.name_normalized,c.name)))
    where m.country_id is null and m.country_name is not null
      and m.geography_exemption_reason is null and c.duplicate_of_id is null
    group by m.id having count(*)=1 limit greatest(1,least(p_limit,2000))
  ) update public.milestones m set country_id=x.country_id
    from candidates x where m.id=x.id;
  get diagnostics v_countries=row_count;

  with names as (
    select c.id,c.country_id,public.city_canonical_key(c.name) alias_key from public.cities c
    where c.duplicate_of_id is null
    union
    select a.city_id,c.country_id,a.alias_key from public.city_aliases a
    join public.cities c on c.id=a.city_id where c.duplicate_of_id is null
  ), candidates as (
    select m.id,(array_agg(n.id))[1] city_id,(array_agg(n.country_id))[1] country_id
    from public.milestones m join names n on n.alias_key=public.city_canonical_key(m.city_name)
      and (m.country_id is null or m.country_id=n.country_id)
    where m.city_id is null and m.city_name is not null and m.geography_exemption_reason is null
    group by m.id having count(distinct n.id)=1 limit greatest(1,least(p_limit,2000))
  ) update public.milestones m set city_id=x.city_id,country_id=coalesce(m.country_id,x.country_id)
    from candidates x where m.id=x.id;
  get diagnostics v_cities=row_count;
  return jsonb_build_object('countries_resolved',v_countries,'cities_resolved',v_cities);
end;
$$;

create or replace function public.list_milestone_reviews(p_status text default 'open',p_limit integer default 300)
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select case when public.has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]) then
    coalesce(jsonb_agg(jsonb_build_object('id',q.id,'milestone_id',q.milestone_id,
      'milestone_title',m.title,'milestone_slug',m.slug,'tier',m.quality_tier,
      'field',q.field,'proposed_value',q.proposed_value,'confidence',q.confidence,
      'model',q.model,'status',q.status,'created_at',q.created_at) order by m.quality_tier,q.created_at),'[]'::jsonb)
    else '[]'::jsonb end
  from public.milestone_review_queue q join public.milestones m on m.id=q.milestone_id
  where p_status is null or q.status=p_status
  limit greatest(1,least(p_limit,1000));
$$;

create or replace function public.list_milestone_duplicate_candidates(
  p_status text default 'pending',p_limit integer default 200
)
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select case when public.has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]) then
    coalesce(jsonb_agg(row order by (row->>'confidence')::numeric desc),'[]'::jsonb)
    else '[]'::jsonb end
  from (
    select jsonb_build_object('id',d.id,'confidence',d.confidence,'signals',d.signals,
      'status',d.status,'created_at',d.created_at,
      'left',jsonb_build_object('id',a.id,'title',a.title,'slug',a.slug,'date',a.date,'country',a.country_name),
      'right',jsonb_build_object('id',b.id,'title',b.title,'slug',b.slug,'date',b.date,'country',b.country_name)) row
    from public.milestone_duplicate_candidates d
    join public.milestones a on a.id=d.milestone_id_1
    join public.milestones b on b.id=d.milestone_id_2
    where p_status is null or d.status=p_status
    order by d.confidence desc,d.created_at
    limit greatest(1,least(p_limit,1000))
  ) ranked;
$$;

create or replace function public.decide_milestone_duplicate_candidate(
  p_id uuid,p_decision text,p_note text default null
)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare r public.milestone_duplicate_candidates%rowtype;
begin
  if not public.has_any_role_jwt(array['admin'::app_role]) then raise exception 'unauthorized' using errcode='42501'; end if;
  if p_decision not in ('confirmed','dismissed') then raise exception 'decision must be confirmed or dismissed' using errcode='22023'; end if;
  select * into r from public.milestone_duplicate_candidates where id=p_id and status='pending' for update;
  if not found then raise exception 'duplicate candidate not found or not pending'; end if;
  update public.milestone_duplicate_candidates set status=p_decision,reviewed_by=auth.uid(),
    reviewed_at=now(),reviewer_note=p_note where id=p_id;
  update public.milestones set last_verified_at=null,
    needs_attention=case when p_decision='confirmed' then true else needs_attention end
  where id in (r.milestone_id_1,r.milestone_id_2);
  return jsonb_build_object('id',p_id,'decision',p_decision,
    'milestone_id_1',r.milestone_id_1,'milestone_id_2',r.milestone_id_2);
end;
$$;

create or replace function public.approve_milestone_review(p_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare r public.milestone_review_queue%rowtype;
begin
  if not public.has_any_role_jwt(array['admin'::app_role]) then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into r from public.milestone_review_queue where id=p_id and status='open' for update;
  if not found then raise exception 'review item not found or not open'; end if;
  if r.field='category' then
    update public.milestones set category=r.proposed_value->>'value',
      field_provenance=jsonb_set(coalesce(field_provenance,'{}'::jsonb),'{category}',
        jsonb_build_object('source',r.model,'confidence',r.confidence,'approved_at',now()),true)
      where id=r.milestone_id;
    execute 'select public.backfill_milestone_topic_tags($1,$2,$3)' using 1,false,r.milestone_id;
  elsif r.field='link_role' then
    update public.milestone_links set role_kind=r.proposed_value->>'suggested_role'
    where id=(r.proposed_value->>'link_id')::uuid and milestone_id=r.milestone_id;
  elsif r.field='description' then
    if nullif(trim(r.proposed_value->>'replacement'),'') is null then
      raise exception 'Description review requires an editor-provided replacement' using errcode='22023';
    end if;
    update public.milestones set description=r.proposed_value->>'replacement' where id=r.milestone_id;
  end if;
  update public.milestone_review_queue set status='approved',reviewer_id=auth.uid(),
    reviewed_at=now(),reviewer_note=p_note where id=p_id;
  update public.milestones set last_verified_at=null where id=r.milestone_id;
  return jsonb_build_object('approved',true,'field',r.field,'milestone_id',r.milestone_id);
end;
$$;

create or replace function public.reject_milestone_review(p_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare r public.milestone_review_queue%rowtype;
begin
  if not public.has_any_role_jwt(array['admin'::app_role]) then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into r from public.milestone_review_queue where id=p_id and status='open' for update;
  if not found then raise exception 'review item not found or not open'; end if;
  update public.milestone_review_queue set status='rejected',reviewer_id=auth.uid(),
    reviewed_at=now(),reviewer_note=p_note where id=p_id;
  -- A rejection closes this proposal but must not erase unrelated failed dimensions.
  update public.milestones set last_verified_at=null where id=r.milestone_id;
  return jsonb_build_object('rejected',true,'field',r.field,'milestone_id',r.milestone_id);
end;
$$;

-- Backfill controlled topics only where the record had none. This is recurring
-- because category approvals and new imports must receive the same vocabulary.
create or replace function public.backfill_milestone_topic_tags(
  p_limit integer default 1000,p_force boolean default false,p_milestone_id uuid default null
)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare v_changed integer;
begin
  with proposed as (
  select m.id, array_remove(array[
    case when m.category='uprising-movement' then 'activism' end,
    case when m.category in ('law-equality','law-decriminalization','law-criminalization') then
      case when m.category='law-decriminalization' then 'decriminalization' else 'human-rights' end end,
    case when m.category='health-aids' or lower(m.title||' '||coalesce(m.description,'')) ~ '(hiv|aids)' then 'aids' end,
    case when m.category='culture-media' then 'arts-culture' end,
    case when m.category='politics-representation' then 'politics' end,
    case when m.category='community-institution' then 'community' end,
    case when m.category in ('depathologization','persecution-destruction') then 'human-rights' end
  ],null) tags from public.milestones m
  where (p_milestone_id is null or m.id=p_milestone_id)
    and (p_force or coalesce(cardinality(m.tags),0)=0)
  order by m.quality_tier,m.significance desc limit greatest(1,least(p_limit,4000))
), valid as (
  select p.id,array_agg(t.slug order by t.slug) tags from proposed p
  cross join unnest(p.tags) s(slug) join public.unified_tags t on t.slug=s.slug and t.status='active'
  group by p.id
)
  update public.milestones m set tags=v.tags,updated_at=now() from valid v
  where m.id=v.id and m.tags is distinct from v.tags;
  get diagnostics v_changed=row_count;
  return jsonb_build_object('tagged',v_changed);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Tier-prioritized imagery queue and publication guard. The existing image
--    worker stores approved Commons assets in project storage and writes the
--    required attribution metadata; explicit waivers never enter its queue.
--    for the existing corpus. Async health/corroboration remains an admin gate.
-- ---------------------------------------------------------------------------
create or replace function public.milestones_due_for_quality_image(p_limit integer default 40)
returns table(id uuid,name text,country_name text,capital text,current_image_url text,wiki_url text)
language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select m.id,m.title,coalesce(ci.name,m.city_name,co.name,m.country_name),
    extract(year from m.date)::int::text,m.image_url,
    (select src.url from jsonb_to_recordset(m.sources) src(label text,url text)
      where src.url ~ 'wikipedia\.org/wiki/' and src.url !~ 'Timeline|List_of' limit 1)
  from public.milestones m left join public.countries co on co.id=m.country_id
  left join public.cities ci on ci.id=m.city_id
  where m.status='published' and m.duplicate_of_id is null
    and (m.image_url is null or m.image_url like '%/og/%')
    and m.image_waiver_reason is null
    and coalesce(m.image_metadata->>'curated','')<>'rejected'
    and coalesce(m.category,'')<>'persecution-destruction' and m.impact<>'negative'
    and not exists(select 1 from public.enrichment_log el where el.step='queer_image_backfill'
      and el.entity_type='milestone' and el.entity_id=m.id)
  order by m.quality_tier,m.significance desc,m.date
  limit greatest(1,least(p_limit,200));
$$;

create or replace function public.milestone_publication_quality_guard()
returns trigger language plpgsql set search_path to 'public','pg_temp'
as $$
declare v_meta_ok boolean; v_healthy integer; v_domains integer; v_authoritative integer;
  v_date integer; v_authoritative_date integer;
begin
  if new.status='published' and (tg_op='INSERT' or old.status is distinct from 'published') then
    if nullif(trim(new.description),'') is null or not public.milestone_sources_valid(new.sources) then
      raise exception 'Published milestones require a description and structurally valid sources' using errcode='23514';
    end if;
    if (new.significance>=4 or new.is_featured) and (new.category is null or new.category='other') then
      raise exception 'Tier A/B milestones require a reviewed category before publication' using errcode='23514';
    end if;
    if new.review_status<>'approved' then
      raise exception 'Milestones must be approved before publication' using errcode='23514';
    end if;
    select count(*),count(distinct domain),
      count(*) filter(where source_class in ('primary_legal','institutional')),
      count(*) filter(where 'date'=any(supports)),
      count(*) filter(where 'date'=any(supports) and source_class in ('primary_legal','institutional'))
    into v_healthy,v_domains,v_authoritative,v_date,v_authoritative_date
    from public.milestone_source_health
    where milestone_id=new.id and health_state in ('healthy','redirected');
    if v_date=0 then
      raise exception 'Publication requires a healthy citation supporting the stored date precision' using errcode='23514';
    end if;
    if (new.significance=5 or new.is_featured)
      and (v_domains<2 or v_authoritative<1 or v_authoritative_date<1) then
      raise exception 'Tier A publication requires two independent healthy sources and authoritative date evidence' using errcode='23514';
    elsif new.significance=4 and not (v_authoritative>=1 or v_domains>=2) then
      raise exception 'Tier B publication requires one authoritative or two independent healthy sources' using errcode='23514';
    elsif new.significance<=3 and v_healthy<1 then
      raise exception 'Tier C publication requires one healthy source' using errcode='23514';
    end if;
    if (new.significance=5 or new.is_featured)
      and new.image_url is null and new.image_waiver_reason is null then
      raise exception 'Tier A publication requires licensed imagery or an explicit waiver' using errcode='23514';
    end if;
    if exists(select 1 from public.milestone_duplicate_candidates d where d.status in ('pending','confirmed')
      and d.confidence>=.9 and (d.milestone_id_1=new.id or d.milestone_id_2=new.id)) then
      raise exception 'Resolve the high-confidence duplicate candidate before publication' using errcode='23514';
    end if;
  end if;
  if new.image_url is not null then
    v_meta_ok := nullif(trim(new.image_metadata->>'alt'),'') is not null
      and nullif(trim(new.image_metadata->>'source'),'') is not null
      and nullif(trim(new.image_metadata->>'license'),'') is not null;
    if not v_meta_ok then raise exception 'Displayed milestone images require alt, source and license metadata' using errcode='23514'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_milestone_publication_quality_guard on public.milestones;
create trigger trg_milestone_publication_quality_guard before insert or update of status,image_url,image_metadata
  on public.milestones for each row execute function public.milestone_publication_quality_guard();

-- ---------------------------------------------------------------------------
-- 7. Admin scorecard and CI gates
-- ---------------------------------------------------------------------------
create or replace function public.milestone_quality_dashboard()
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select case when public.has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]) then jsonb_build_object(
    'totals',jsonb_build_object(
      'live',count(*) filter(where duplicate_of_id is null),
      'published',count(*) filter(where duplicate_of_id is null and status='published'),
      'needs_attention',count(*) filter(where duplicate_of_id is null and needs_attention),
      'other',count(*) filter(where duplicate_of_id is null and category='other')),
    'tiers',jsonb_build_object(
      'A',jsonb_build_object('total',count(*) filter(where quality_tier='A' and duplicate_of_id is null),'ready',count(*) filter(where quality_tier='A' and quality_status='ready' and duplicate_of_id is null)),
      'B',jsonb_build_object('total',count(*) filter(where quality_tier='B' and duplicate_of_id is null),'ready',count(*) filter(where quality_tier='B' and quality_status='ready' and duplicate_of_id is null)),
      'C',jsonb_build_object('total',count(*) filter(where quality_tier='C' and duplicate_of_id is null),'ready',count(*) filter(where quality_tier='C' and quality_status='ready' and duplicate_of_id is null))),
    'backlog',jsonb_build_object(
      'coverage_open',(select count(*) from public.milestone_coverage_gaps where status='open'),
      'category_open',(select count(*) from public.milestone_review_queue where status='open'),
      'links_pending',(select count(*) from public.milestone_link_proposals where status='pending'),
      'duplicates_pending',(select count(*) from public.milestone_duplicate_candidates where status='pending'),
      'duplicates_confirmed',(select count(*) from public.milestone_duplicate_candidates where status='confirmed'),
      'oldest',(select min(created_at) from public.milestone_coverage_gaps where status='open')),
    'acceptance',jsonb_build_object(
      'category',coalesce((select round(100.0*count(*) filter(where status='approved')/nullif(count(*) filter(where status in ('approved','rejected')),0),1) from public.milestone_review_queue),0),
      'links',coalesce((select round(100.0*count(*) filter(where status='approved')/nullif(count(*) filter(where status in ('approved','rejected')),0),1) from public.milestone_link_proposals),0)),
    'coverage',jsonb_build_object(
      'tier_a_media',coalesce(round(100.0*count(*) filter(where quality_tier='A' and (image_url is not null or image_waiver_reason is not null))/nullif(count(*) filter(where quality_tier='A'),0),1),100),
      'tier_b_imagery',coalesce(round(100.0*count(*) filter(where quality_tier='B' and image_url is not null)/nullif(count(*) filter(where quality_tier='B'),0),1),100)),
    'averages',jsonb_build_object('completeness',round(avg(completeness_score),1),'trust',round(avg(trust_score),1))
  ) else null end from public.milestones;
$$;

create or replace function public.milestone_quality_gate_checks()
returns table(gate text,severity text,failures bigint,detail jsonb)
language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select * from (values
    ('published_missing_core','critical',(select count(*) from public.milestones where status='published' and duplicate_of_id is null and (nullif(trim(description),'') is null or not public.milestone_sources_valid(sources))), '{}'::jsonb),
    ('dead_sole_source','critical',(select count(*) from public.milestones m where m.status='published' and m.duplicate_of_id is null and jsonb_array_length(m.sources)=1 and exists(select 1 from public.milestone_source_health h where h.milestone_id=m.id and h.health_state='missing')), '{}'::jsonb),
    ('displayed_image_metadata','critical',(select count(*) from public.milestones where status='published' and image_url is not null and (nullif(trim(image_metadata->>'alt'),'') is null or nullif(trim(image_metadata->>'source'),'') is null or nullif(trim(image_metadata->>'license'),'') is null)), '{}'::jsonb),
    ('high_confidence_duplicates','critical',(select count(*) from public.milestone_duplicate_candidates where status in ('pending','confirmed') and confidence>=.9), '{}'::jsonb),
    ('tier_a_ready','high',(select count(*) from public.milestones where duplicate_of_id is null and quality_tier='A' and quality_status<>'ready'), '{}'::jsonb),
    ('tier_b_ready','high',(select count(*) from public.milestones where duplicate_of_id is null and quality_tier='B' and quality_status<>'ready'), '{}'::jsonb),
    ('published_without_topics','high',(select count(*) from public.milestones where status='published' and duplicate_of_id is null and cardinality(tags)=0), '{}'::jsonb),
    ('ordinary_geography_unresolved','high',(select count(*) from public.milestones where status='published' and duplicate_of_id is null and country_name is not null and country_id is null and geography_exemption_reason is null), '{}'::jsonb)
  ) v(gate,severity,failures,detail);
$$;

-- Generalized proposal resolver (keeps legacy personality_* keys for clients).
create or replace function public.list_milestone_link_proposals(p_status text default 'pending',p_limit int default 200)
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select coalesce(jsonb_agg(row order by row->>'created_at'),'[]'::jsonb) from (
    select jsonb_build_object('id',pr.id,'milestone_id',pr.milestone_id,'milestone_title',m.title,
      'milestone_slug',m.slug,'milestone_date',m.date,'entity_type',pr.entity_type,'entity_id',pr.entity_id,
      'entity_name',coalesce(p.name,e.title,v.name,n.title,o.name),'entity_slug',coalesce(p.slug,e.slug,v.slug,n.slug,o.slug),
      'entity_image_url',coalesce(p.image_url,e.logo_url,v.logo_url,n.image_url,o.logo_url),
      'personality_name',p.name,'personality_slug',p.slug,'personality_image_url',p.image_url,
      'matched_name',pr.matched_name,'matched_field',pr.matched_field,'confidence',pr.confidence,
      'proposed_role_kind',pr.proposed_role_kind,'status',pr.status,'created_at',pr.created_at) row
    from public.milestone_link_proposals pr join public.milestones m on m.id=pr.milestone_id
    left join public.personalities p on pr.entity_type='personality' and p.id=pr.entity_id
    left join public.events e on pr.entity_type='event' and e.id=pr.entity_id
    left join public.venues v on pr.entity_type='venue' and v.id=pr.entity_id
    left join public.news_articles n on pr.entity_type='news' and n.id=pr.entity_id
    left join public.organizations o on pr.entity_type='organization' and o.id=pr.entity_id
    where public.is_admin(auth.uid()) and (p_status is null or pr.status=p_status)
    order by pr.created_at limit greatest(1,least(p_limit,1000))
  ) q;
$$;

-- Keep the legacy two-argument RPC contract; proposal role is controlled.
create or replace function public.approve_milestone_link_proposal(p_id uuid,p_role text default null)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare pr public.milestone_link_proposals%rowtype;
begin
  perform public.assert_admin_or_internal();
  select * into pr from public.milestone_link_proposals where id=p_id and status='pending' for update;
  if not found then raise exception 'proposal % not found or not pending',p_id; end if;
  insert into public.milestone_links(milestone_id,entity_type,entity_id,role,role_kind,sort_order)
  values(pr.milestone_id,pr.entity_type,pr.entity_id,p_role,
    coalesce(pr.proposed_role_kind,case pr.entity_type when 'news' then 'coverage' when 'venue' then 'location' when 'organization' then 'organizer' else 'subject' end),
    coalesce((select max(sort_order)+1 from public.milestone_links where milestone_id=pr.milestone_id),0))
  on conflict(milestone_id,entity_type,entity_id) do update set role_kind=excluded.role_kind;
  update public.milestone_link_proposals set status='approved',reviewed_at=now(),reviewed_by=auth.uid() where id=p_id;
end;
$$;

-- Automation registry. Category proposals are review-only; no semantic change
-- is auto-applied. The HTTP checker is invoked through workflow infrastructure.
insert into public.admin_automations(slug,name,description,managed_by,enabled,"trigger",schedule,action)
values ('milestone_category_proposals','Propose milestone categories',
  'Creates deterministic category review items for milestones still classified as other.',
  'system',true,jsonb_build_object('type','schedule'),'40 3 * * 2',jsonb_build_object('type','rpc','fn','run_milestone_category_proposals'))
on conflict(slug) do update set name=excluded.name,description=excluded.description,enabled=excluded.enabled,schedule=excluded.schedule,action=excluded.action;

insert into public.admin_automations(slug,name,description,managed_by,enabled,"trigger",schedule,action)
values ('milestone_editorial_review','Review milestone descriptions',
  'Queues uncertainty and editorialized language for human factual review; never rewrites prose automatically.',
  'system',true,jsonb_build_object('type','schedule'),'45 3 * * 2',jsonb_build_object('type','rpc','fn','run_milestone_editorial_review'))
on conflict(slug) do update set name=excluded.name,description=excluded.description,enabled=excluded.enabled,schedule=excluded.schedule,action=excluded.action;

insert into public.admin_automations(slug,name,description,managed_by,enabled,"trigger",schedule,action)
values ('milestone_topic_backfill','Backfill milestone topics',
  'Assigns controlled active topic tags to newly imported and newly categorized milestones.',
  'system',true,jsonb_build_object('type','schedule'),'50 3 * * 2',jsonb_build_object('type','rpc','fn','backfill_milestone_topic_tags'))
on conflict(slug) do update set name=excluded.name,description=excluded.description,enabled=excluded.enabled,schedule=excluded.schedule,action=excluded.action;

insert into public.admin_automations(slug,name,description,managed_by,enabled,"trigger",schedule,action)
values ('milestone_duplicate_detection','Detect milestone duplicates',
  'Creates date, jurisdiction and entity-aware duplicate candidates for human review.',
  'system',true,jsonb_build_object('type','schedule'),'55 3 * * 2',jsonb_build_object('type','rpc','fn','run_milestone_duplicate_detection'))
on conflict(slug) do update set name=excluded.name,description=excluded.description,enabled=excluded.enabled,schedule=excluded.schedule,action=excluded.action;

insert into public.admin_automations(slug,name,description,managed_by,enabled,"trigger",schedule,action)
values ('milestone_geography_resolution','Resolve milestone geography',
  'Resolves exact country, city and city-alias matches while preserving explicit historical-place exemptions.',
  'system',true,jsonb_build_object('type','schedule'),'35 3 * * 2',jsonb_build_object('type','rpc','fn','run_milestone_geography_resolution'))
on conflict(slug) do update set name=excluded.name,description=excluded.description,enabled=excluded.enabled,schedule=excluded.schedule,action=excluded.action;

insert into public.workflow_definitions
  (name,display_name,description,edge_function,queue_name,default_payload,schedule,
   max_retries,retry_backoff_base,max_concurrency,timeout_seconds,is_enabled,priority,tags)
values ('milestone-source-health','Milestone source health',
  'Conservatively checks milestone citations; 403 and 429 remain indeterminate and only 404/410 are dead.',
  'milestone-source-health','scheduled_jobs','{"limit":75}'::jsonb,'15 2 * * *',
  2,300,1,900,true,4,array['milestone','quality','sources'])
on conflict(name) do update set display_name=excluded.display_name,description=excluded.description,
  edge_function=excluded.edge_function,default_payload=excluded.default_payload,schedule=excluded.schedule,
  max_concurrency=excluded.max_concurrency,timeout_seconds=excluded.timeout_seconds,
  is_enabled=excluded.is_enabled,tags=excluded.tags,updated_at=now();

do $$ begin
  perform cron.unschedule('wf-milestone-source-health')
  where exists(select 1 from cron.job where jobname='wf-milestone-source-health');
exception when others then null; end $$;
select cron.schedule('wf-milestone-source-health','15 2 * * *',
  $$select public.enqueue_workflow('milestone-source-health','{"limit":75}'::jsonb)$$);

-- Corpus backfills run as separately observable production jobs after this
-- transactional schema migration. This keeps DDL deployment bounded and makes
-- each remediation phase independently retryable.

revoke all on function public.canonical_milestone_source_url(text) from public;
revoke all on function public.classify_milestone_source(text) from public;
revoke all on function public.milestone_sources_valid(jsonb) from public;
revoke all on function public.sync_milestone_source_health(uuid) from public;
revoke all on function public.claim_milestone_source_health(integer) from public;
revoke all on function public.release_milestone_source_health_claims(uuid[]) from public;
revoke all on function public.mark_milestone_sources_for_rescore(uuid[]) from public;
revoke all on function public.compute_milestone_quality_dimensions(uuid) from public;
revoke all on function public.compute_milestone_completeness(uuid) from public;
revoke all on function public.run_milestone_trust_recompute(int,boolean) from public;
revoke all on function public.run_milestone_coverage_radar(boolean) from public;
revoke all on function public.suggest_milestone_category(text,text) from public;
revoke all on function public.run_milestone_category_proposals(integer,boolean) from public;
revoke all on function public.milestone_editorial_issues(text) from public;
revoke all on function public.run_milestone_editorial_review(integer,boolean) from public;
revoke all on function public.backfill_milestone_topic_tags(integer,boolean,uuid) from public;
revoke all on function public.run_milestone_duplicate_detection(integer) from public;
revoke all on function public.run_milestone_geography_resolution(integer) from public;
revoke all on function public.list_milestone_reviews(text,integer) from public;
revoke all on function public.list_milestone_duplicate_candidates(text,integer) from public;
revoke all on function public.decide_milestone_duplicate_candidate(uuid,text,text) from public;
revoke all on function public.milestone_quality_dashboard() from public;
revoke all on function public.milestone_quality_gate_checks() from public;
revoke all on function public.milestones_due_for_quality_image(integer) from public;

grant execute on function public.sync_milestone_source_health(uuid) to service_role;
grant execute on function public.claim_milestone_source_health(integer) to service_role;
grant execute on function public.release_milestone_source_health_claims(uuid[]) to service_role;
grant execute on function public.mark_milestone_sources_for_rescore(uuid[]) to service_role;
grant execute on function public.compute_milestone_quality_dimensions(uuid) to service_role;
grant execute on function public.compute_milestone_completeness(uuid) to service_role;
grant execute on function public.run_milestone_trust_recompute(int,boolean) to service_role;
grant execute on function public.run_milestone_coverage_radar(boolean) to service_role;
grant execute on function public.run_milestone_category_proposals(integer,boolean) to service_role;
grant execute on function public.run_milestone_editorial_review(integer,boolean) to service_role;
grant execute on function public.backfill_milestone_topic_tags(integer,boolean,uuid) to service_role;
grant execute on function public.run_milestone_duplicate_detection(integer) to service_role;
grant execute on function public.run_milestone_geography_resolution(integer) to service_role;
grant execute on function public.list_milestone_reviews(text,integer) to authenticated,service_role;
grant execute on function public.list_milestone_duplicate_candidates(text,integer) to authenticated,service_role;
grant execute on function public.decide_milestone_duplicate_candidate(uuid,text,text) to authenticated,service_role;
grant execute on function public.milestone_quality_dashboard() to authenticated,service_role;
grant execute on function public.milestone_quality_gate_checks() to service_role;
grant execute on function public.milestones_due_for_quality_image(integer) to service_role;

commit;
