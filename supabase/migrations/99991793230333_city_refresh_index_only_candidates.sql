-- Native alias runs still intermittently hit PostgREST's 8s statement timeout.
-- EXPLAIN measured 1.35s with 5,120 physical block reads: the old wide candidate
-- projection reads city metadata before the 20-row bound. Keep the identical
-- queue order/eligibility/holds and fetch public fields only after that bound.
-- The partial covering index makes the eligibility scan independent of wide
-- enrichment JSON and description storage. No timeout, scope, ACL, lifecycle,
-- publication, scheduling or quality-ceiling changes; applied SQL stays intact.
create index if not exists city_factual_queue_cover_idx on public.cities(id)
include(seo_indexable,last_refreshed_at,population,completeness_score,wikidata_qid,slug)
where duplicate_of_id is null and shell_status <> 'merged'
 and coalesce(enrichment_status->'wikidata_link'->>'state','') <> 'data_unavailable'
 and coalesce(enrichment_status->'disposition'->>'state','') <> 'not_a_city';

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
      select c.id,
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
    from candidates q join public.cities c on c.id=q.id
    order by q.queue_position;
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
