-- 99991793214974_city_refresh_fair_bounded_drain
--
-- Gap passes repeatedly selected fresh, high-population unresolved rows while
-- the quality backlog grew. On 2026-10-28, 55/60 candidates had been visited
-- within two days and only 18/60 were indexable. The shared selector also hit
-- PostgREST's statement timeout in the factual and alias jobs.
-- Keep identity/classification adoption in the existing Edge Function. This
-- migration changes queue selection and bounded scheduling, never city facts,
-- publication flags, evidence requirements, issue counts or quality ceilings.

-- A machine identity finding is work for this resolver. Explicit human holds,
-- confirmation requirements and human decisions remain protected.
create or replace view public.city_factual_protected_ids
with (security_invoker=true, security_barrier=true) as
select distinct q.entity_id as city_id
from public.review_queue q join public.cities c on c.id=q.entity_id
where q.entity_type='city' and (
  q.resolved_by is not null
  or lower(q.details->>'requires_confirm')='true'
  or lower(q.details->>'force_review')='true'
  or lower(q.details->>'manual_hold')='true'
  or lower(q.details->>'human_reviewed')='true'
  or (lower(q.details->>'hard_blocker')='true' and not coalesce(
    q.status='pending' and q.review_type='CITY_IDENTITY_AMBIGUOUS'
    and q.details->>'source'='city_quality_profile'
    and q.details->>'city_name'=c.name and q.details->>'city_slug'=c.slug
    and q.details->>'publication_ready'='false'
    and q.details-array['source','city_name','city_slug','hard_blocker','publication_ready','observed_at']='{}'::jsonb,
    false))
);
revoke all on public.city_factual_protected_ids from public,anon,authenticated;
grant select on public.city_factual_protected_ids to service_role;

create or replace function public.city_factual_research_allowed(p_city_id uuid)
returns boolean language sql stable security invoker as $allowed$
  select not exists(select 1 from public.city_factual_protected_ids where city_id=p_city_id);
$allowed$;
revoke all on function public.city_factual_research_allowed(uuid) from public,anon,authenticated;
grant execute on function public.city_factual_research_allowed(uuid) to service_role;

-- xmin detects every committed edit, including paths that do not maintain
-- updated_at. Expose only the native resolver's existing factual projection.
create or replace function public.get_city_factual_snapshots(p_ids uuid[])
returns setof jsonb language sql stable security definer set search_path to 'public'
as $snapshots$
  select (select jsonb_object_agg(k,v) from jsonb_each(to_jsonb(c)) fields(k,v)
    where k=any(array['id','name','slug','updated_at','latitude','longitude','description',
      'image_url','curated_image_url','population','area_km2','elevation_m','official_website',
      'postal_codes','area_codes','sister_cities','economy_sectors','universities','local_language',
      'climate_type','airport_codes','major_airport_code','transportation_info','is_regional_capital',
      'capital_of_region','field_provenance','enrichment_status','wikidata_qid','wikipedia_title',
      'country_id','name_local','name_local_lang']))
    || jsonb_build_object('row_version',c.xmin::text,'countries',
      (select jsonb_build_object('code',country.code,'name',country.name,'languages',country.languages)
        from public.countries country where country.id=c.country_id))
  from public.cities c where c.id=any(p_ids[1:300]) and c.duplicate_of_id is null
    and public.city_factual_research_allowed(c.id)
  order by array_position(p_ids,c.id);
$snapshots$;
revoke all on function public.get_city_factual_snapshots(uuid[]) from public,anon,authenticated;
grant execute on function public.get_city_factual_snapshots(uuid[]) to service_role;

create or replace function public.apply_city_factual_patch(
  p_city_id uuid, p_expected_row_version text, p_expected_updated_at timestamptz,
  p_expected_provenance jsonb, p_expected_status jsonb,
  p_patch jsonb, p_aliases jsonb default '[]'::jsonb, p_locality jsonb default null
)
returns jsonb language plpgsql security definer set search_path to 'public'
as $write$
declare
  v_city public.cities%rowtype;
  v_assignments text;
  v_aliases integer := 0;
  v_localities integer := 0;
  v_row_version text;
begin
  if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution')) then
    return jsonb_build_object('status','blocked','reason','review_sweep_running');
  end if;
  select * into v_city from public.cities where id=p_city_id for update;
  if not found or v_city.duplicate_of_id is not null or v_city.shell_status='merged'
    or coalesce(v_city.enrichment_status#>>'{disposition,state}','')='not_a_city' then
    return jsonb_build_object('status','blocked','reason','missing_or_retired_city');
  end if;
  select xmin::text into v_row_version from public.cities where id=p_city_id;
  if p_expected_row_version is null or v_row_version<>p_expected_row_version
    or v_city.updated_at is distinct from p_expected_updated_at
    or v_city.field_provenance is distinct from p_expected_provenance
    or v_city.enrichment_status is distinct from p_expected_status then
    return jsonb_build_object('status','blocked','reason','stale_snapshot');
  end if;
  begin
    perform 1 from public.review_queue where entity_type='city' and entity_id=p_city_id for update nowait;
  exception when lock_not_available then
    return jsonb_build_object('status','blocked','reason','review_sweep_running');
  end;
  if not public.city_factual_research_allowed(p_city_id) then
    return jsonb_build_object('status','blocked','reason','human_hold');
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or p_patch='{}'::jsonb then
    raise exception 'Nonempty city factual patch required' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p_patch) key where key<>all(array[
    'wikidata_qid','wikipedia_title','latitude','longitude','population','area_km2','elevation_m',
    'official_website','postal_codes','area_codes','sister_cities','economy_sectors','universities',
    'local_language','climate_type','airport_codes','major_airport_code','transportation_info',
    'is_regional_capital','capital_of_region','description','field_provenance','enrichment_status',
    'last_refreshed_at','name_local','name_local_lang','needs_attention'
  ])) then raise exception 'Unsupported city factual patch field' using errcode='22023'; end if;
  if jsonb_typeof(p_aliases) is distinct from 'array' or jsonb_array_length(p_aliases)>1000 then
    raise exception 'Bounded city alias array required' using errcode='22023';
  end if;
  perform set_config('app.actor','system:city-factual-backfill',true);
  select string_agg(format('%I=patched.%I',key,key),', ' order by key)
    into v_assignments from jsonb_object_keys(p_patch) key;
  execute 'update public.cities c set '||v_assignments||
    ' from jsonb_populate_record(null::public.cities,$1) patched where c.id=$2'
    using p_patch,p_city_id;
  -- Fill-only aliases share the city transaction and ownership checks. A failed
  -- city write must not leave unguarded side effects on a stale/held identity.
  insert into public.city_aliases(city_id,alias,locale)
    select p_city_id,a.alias,a.locale from jsonb_to_recordset(p_aliases) a(alias text,locale text)
    where nullif(btrim(a.alias),'') is not null
      and lower(btrim(a.alias))<>lower(btrim(v_city.name))
    on conflict(city_id,alias_key) do nothing;
  get diagnostics v_aliases=row_count;
  if p_locality is not null then
    if jsonb_typeof(p_locality) is distinct from 'object'
      or nullif(btrim(p_locality->>'municipality_name'),'') is null
      or coalesce(p_locality->>'locality_qid','') !~ '^Q[0-9]+$'
      or coalesce(p_locality->>'municipality_qid','') !~ '^Q[0-9]+$'
      or not coalesce((p_locality->>'anchor_lat')::numeric between -90 and 90,false)
      or not coalesce((p_locality->>'anchor_lng')::numeric between -180 and 180,false) then
      raise exception 'Corroborated city locality proposal required' using errcode='22023';
    end if;
    insert into public.city_localities(country_id,locality_name,locality_qid,kind,
      municipality_name,municipality_qid,anchor_lat,anchor_lng,radius_m,source,note)
    values(v_city.country_id,v_city.name,p_locality->>'locality_qid','locality',
      p_locality->>'municipality_name',p_locality->>'municipality_qid',
      (p_locality->>'anchor_lat')::numeric,(p_locality->>'anchor_lng')::numeric,
      3000,'city-factual-backfill',p_locality->>'note') on conflict do nothing;
    get diagnostics v_localities=row_count;
  end if;
  return jsonb_build_object('status','updated','aliases_written',v_aliases,'localities_written',v_localities);
end;
$write$;
revoke all on function public.apply_city_factual_patch(uuid,text,timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.apply_city_factual_patch(uuid,text,timestamptz,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;

create or replace function public.cities_due_for_refresh(
  p_limit integer default 25,
  p_scope text default 'content_first'
)
returns table(
  id uuid, name text, slug text, latitude numeric, longitude numeric,
  country_id uuid, description text, official_website text,
  completeness_score smallint, shell_status text,
  last_refreshed_at timestamptz, refresh_reason text,
  has_content boolean, wikidata_qid text
)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  -- Preserve the old NULL-scope result (no candidates).
  if p_scope is null then return; end if;

  if p_scope in ('qid_gap', 'alias_gap', 'all') then
    return query
    with protected as materialized (select city_id from public.city_factual_protected_ids),
    candidates as materialized (
      select c.id, c.name, c.slug, c.latitude, c.longitude, c.country_id,
        c.description, c.official_website, c.completeness_score, c.shell_status,
        c.last_refreshed_at, c.wikidata_qid,
        row_number() over (order by
          case when p_scope in ('qid_gap', 'alias_gap') then not c.seo_indexable end,
          case when p_scope in ('qid_gap', 'alias_gap') then c.last_refreshed_at end asc nulls first,
          case when p_scope in ('qid_gap', 'alias_gap') then -coalesce(c.population, 0) end,
          case when p_scope = 'all' then (c.slug like 'tmp-%')::int end,
          c.last_refreshed_at asc nulls first, c.completeness_score, c.id
        ) as queue_position
      from public.cities c
      where c.duplicate_of_id is null and c.shell_status <> 'merged'
        and not exists(select 1 from protected p where p.city_id=c.id)
        and coalesce(c.enrichment_status->'wikidata_link'->>'state', '') <> 'data_unavailable'
        and coalesce(c.enrichment_status->'disposition'->>'state', '') <> 'not_a_city'
        and (p_scope <> 'qid_gap' or c.wikidata_qid is null)
        and (p_scope <> 'alias_gap' or (
          c.wikidata_qid is not null
          and not exists (select 1 from public.city_aliases a where a.city_id = c.id)
        ))
        -- A failed identity proof is not made stronger by retrying it every
        -- five minutes. Rotate through the untouched tail before revisiting.
        and (p_scope = 'all' or c.last_refreshed_at is null
          or c.last_refreshed_at < now() - interval '1 day')
      order by queue_position
      limit greatest(1, least(p_limit, 1000))
    )
    select c.id, c.name, c.slug, c.latitude, c.longitude, c.country_id,
      c.description, c.official_website, c.completeness_score, c.shell_status,
      c.last_refreshed_at,
      case when p_scope = 'qid_gap' then 'unlinked'
        when p_scope = 'alias_gap' then 'no_aliases'
        when c.last_refreshed_at is null then 'never_refreshed'
        when c.wikidata_qid is null then 'unlinked'
        when c.completeness_score < 40 then 'low_completeness'
        else 'stale' end,
      (exists (select 1 from public.venues v where v.city_id = c.id)
        or exists (select 1 from public.events e where e.city_id = c.id)),
      c.wikidata_qid
    from candidates c
    order by c.queue_position;
    return;
  end if;

  -- Compute content membership once. The previous correlated EXISTS arms
  -- were evaluated while sorting the full city population and again for the
  -- result, even when a gap scope did not order by content at all.
  return query
  with protected as materialized (select city_id from public.city_factual_protected_ids),
  content_cities as materialized (
    select v.city_id from public.venues v where v.city_id is not null
    union
    select e.city_id from public.events e where e.city_id is not null
  )
  select c.id, c.name, c.slug, c.latitude, c.longitude, c.country_id,
    c.description, c.official_website, c.completeness_score, c.shell_status,
    c.last_refreshed_at,
    case when c.last_refreshed_at is null then 'never_refreshed'
      when c.wikidata_qid is null then 'unlinked'
      when c.completeness_score < 40 then 'low_completeness'
      else 'stale' end,
    content.city_id is not null, c.wikidata_qid
  from public.cities c
  left join content_cities content on content.city_id = c.id
  where c.duplicate_of_id is null and c.shell_status <> 'merged'
    and not exists(select 1 from protected p where p.city_id=c.id)
    and coalesce(c.enrichment_status->'wikidata_link'->>'state', '') <> 'data_unavailable'
    and coalesce(c.enrichment_status->'disposition'->>'state', '') <> 'not_a_city'
    and (p_scope <> 'content_only' or content.city_id is not null)
  order by (content.city_id is null)::int, (c.slug like 'tmp-%')::int,
    c.last_refreshed_at asc nulls first, c.completeness_score, c.id
  limit greatest(1, least(p_limit, 1000));
end;
$function$;

-- Preserve the production selector's service-only execution boundary.
revoke all on function public.cities_due_for_refresh(integer,text) from public, anon, authenticated;
grant execute on function public.cities_due_for_refresh(integer,text) to service_role;

comment on function public.cities_due_for_refresh(integer,text) is
  'Bounded factual work list. qid_gap/alias_gap prioritize indexable cities, rotate oldest visits before population and cool down for one day. Gap content membership is computed only after LIMIT; content scopes share a materialized membership set. Identity, class, country and ownership decisions remain in the native resolver.';

-- Update only these native jobs, preserving their original authentication and
-- applying the existing tracking wrapper. Do not run a global cron resync.
do $schedule$
declare
  r record;
  v_schedule text;
  v_batch integer;
  v_command text;
  v_count integer;
begin
  for r in select * from public.admin_automations
    where slug in ('city_qid_gap_link','city_alias_harvest','city_factual_sparql')
    for update
  loop
    if not r.enabled and not (r.slug = 'city_alias_harvest' and r.last_run_status = 'auto_paused') then
      raise exception 'City repair refuses to override a manually disabled job: %', r.slug;
    end if;
    v_batch := case when r.slug = 'city_factual_sparql' then 12 else 20 end;
    v_schedule := case r.slug
      when 'city_qid_gap_link' then '*/10 * * * *'
      when 'city_alias_harvest' then '5-59/10 * * * *'
      else r.schedule end;
    select count(*) into v_count from regexp_matches(
      r.action->>'command', '"batch_limit"[[:space:]]*:[[:space:]]*[0-9]+', 'g');
    if v_count <> 1 or position('/functions/v1/city-factual-backfill' in r.action->>'command') = 0 then
      raise exception 'Unexpected city automation command: %', r.slug;
    end if;
    v_command := regexp_replace(r.action->>'command',
      '"batch_limit"[[:space:]]*:[[:space:]]*[0-9]+',
      '"batch_limit":' || v_batch::text, 'g');
    update public.admin_automations set
      action = jsonb_set(action, '{command}', to_jsonb(v_command)),
      schedule = v_schedule, enabled = true,
      description = case r.slug
        when 'city_qid_gap_link' then 'Every 10 minutes: up to 20 missing city identities, indexable and oldest unvisited first, with a one-day revisit cooldown. Native class/country/coordinate/evidence guards remain required.'
        when 'city_alias_harvest' then 'Every 10 minutes, offset five minutes: up to 20 linked cities missing aliases, with a one-day revisit cooldown. Re-enabled after repairing the timed-out selector and oversized batch.'
        else description end
    where id = r.id;
    perform cron.schedule(r.slug, v_schedule,
      public.admin_automation_effective_command(r.slug, v_command));
  end loop;
  if (select count(*) from public.admin_automations
    where slug in ('city_qid_gap_link','city_alias_harvest','city_factual_sparql')) <> 3 then
    raise exception 'Expected all three city research jobs';
  end if;
end;
$schedule$;

-- The old unbounded AI substring matched "has an airport/airfield". Its
-- disambiguation arm also flagged ordinary historical explanations in Terni
-- and Morpeth. Match an actual disambiguation lead or self-referential refusal,
-- never erase a correct, sourced description to make a counter smaller.
create or replace function public.city_description_is_wrong_subject(p_description text)
returns boolean language sql immutable security invoker set search_path to 'public'
as $predicate$
  select coalesce(p_description, '') ~*
      '\m(may|can)([[:space:]]+also)?[[:space:]]+refer[[:space:]]+to[[:space:]]*:'
    or coalesce(p_description, '') ~*
      '^[[:space:]]*[^.!?]{0,180}\m(refers to multiple|is a disambiguation)\M'
    or coalesce(p_description, '') ~*
      '(^|[[:space:]])(as an ai|i cannot provide|provided sources do not contain|sources do not provide)([[:space:][:punct:]]|$)';
$predicate$;

do $view_patch$
declare
  v_definition text := pg_get_viewdef('public.city_quality_profile'::regclass, true);
  v_old text := $old$f.description ~* '(^|[[:space:]])(may refer to|refers to multiple|disambiguation)([[:space:]]|$)'::text OR f.description ~* '(as an ai|i cannot provide|provided sources do not contain|sources do not provide)'::text$old$;
  v_count integer;
  v_acl aclitem[];
  v_options text[];
  v_options_clause text := '';
  v_owner oid;
begin
  if position('city_description_is_wrong_subject(f.description)' in v_definition) > 0 then return; end if;
  v_count := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old);
  if v_count <> 1 then raise exception 'Expected exactly one legacy city description predicate, found %', v_count; end if;
  select relacl, reloptions, relowner into v_acl, v_options, v_owner
    from pg_class where oid = 'public.city_quality_profile'::regclass;
  if v_options is not null then
    select ' with (' || string_agg(format('%I=%L', split_part(option, '=', 1),
      substring(option from position('=' in option) + 1)), ', ') || ')'
      into v_options_clause from unnest(v_options) option;
  end if;
  execute 'create or replace view public.city_quality_profile' || v_options_clause || ' as ' ||
    replace(v_definition, v_old, 'public.city_description_is_wrong_subject(f.description)');
  if exists(select 1 from pg_class where oid = 'public.city_quality_profile'::regclass
    and (relacl is distinct from v_acl or reloptions is distinct from v_options or relowner <> v_owner)) then
    raise exception 'City quality view access settings changed';
  end if;
end;
$view_patch$;
