-- 99991793214974_city_refresh_fair_bounded_drain
--
-- TODO: why this migration exists.

-- Gap passes repeatedly selected fresh, high-population unresolved rows while
-- the quality backlog grew. On 2026-10-28, 55/60 candidates had been visited
-- within two days and only 18/60 were indexable. The shared selector also hit
-- PostgREST's statement timeout in the factual and alias jobs.
-- Keep identity/classification adoption in the existing Edge Function. This
-- migration changes queue selection and bounded scheduling, never city facts,
-- publication flags, evidence requirements, issue counts or quality ceilings.

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
    with candidates as materialized (
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
  with content_cities as materialized (
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
