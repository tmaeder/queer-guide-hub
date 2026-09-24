-- City relationship integrity: stable IDs are authoritative. Text matching is
-- retained only for unlinked legacy rows when country evidence corroborates an
-- exact normalized city name. This prevents namesakes such as Berlin, US from
-- inheriting Berlin, Germany content.

create index if not exists idx_events_unlinked_country_city_normalized
on public.events (
  country_id,
  public.immutable_unaccent(lower(btrim(city)))
)
where city_id is null and duplicate_of_id is null and city is not null;

create index if not exists idx_venues_unlinked_country_city_normalized
on public.venues (
  country_id,
  public.immutable_unaccent(lower(btrim(city)))
)
where city_id is null and duplicate_of_id is null and closed_at is null and city is not null;

drop function if exists public.search_events(
  text, text, timestamptz, timestamptz, text[], text[], text[], text,
  boolean, integer, integer
);

create function public.search_events(
  p_city text default null,
  p_event_type text default null,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_tags text[] default null,
  p_accessibility_attributes text[] default null,
  p_target_groups text[] default null,
  p_search text default null,
  p_include_past boolean default false,
  p_limit integer default 24,
  p_offset integer default 0,
  p_city_id uuid default null,
  p_country_id uuid default null
)
returns table(total bigint, event jsonb)
language sql
stable
set search_path to 'public'
as $function$
  with filtered as (
    select e.*
    from public.events e
    where e.status = 'active'
      and e.duplicate_of_id is null
      and ((e.series_next and e.parent_event_id is null)
           or coalesce(p_include_past, false)
           or p_start is not null
           or p_end is not null)
      and (case when p_include_past then e.start_date <= now()
                else coalesce(e.end_date, e.start_date) >= now() end)
      and (
        (p_city_id is not null and (
          e.city_id = p_city_id
          or (
            e.city_id is null
            and p_city is not null
            and p_country_id is not null
            and e.country_id = p_country_id
            and public.immutable_unaccent(lower(btrim(e.city)))
                = public.immutable_unaccent(lower(btrim(p_city)))
          )
        ))
        or (p_city_id is null and (
          p_city is null
          or public.immutable_unaccent(lower(e.city))
             ilike '%' || public.immutable_unaccent(lower(p_city)) || '%'
        ) and (p_country_id is null or e.country_id = p_country_id))
      )
      and (p_event_type is null or e.event_type = p_event_type)
      and (p_end is null or e.start_date <= p_end)
      and (p_start is null or coalesce(e.end_date, e.start_date) >= p_start)
      and (p_tags is null or e.tags && p_tags)
      and (p_accessibility_attributes is null or e.accessibility_attributes && p_accessibility_attributes)
      and (p_target_groups is null or e.target_groups && p_target_groups)
      and (p_search is null
           or e.title ilike '%' || p_search || '%'
           or e.description ilike '%' || p_search || '%')
  ),
  counted as (select count(*)::bigint as total from filtered),
  paged as (
    select f.*
    from filtered f
    order by f.is_featured desc,
             case when p_include_past then f.start_date end desc,
             case when not p_include_past then f.start_date end asc
    limit greatest(coalesce(p_limit, 24), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    (select total from counted),
    to_jsonb(p) || jsonb_build_object(
      'venues',
      case when v.id is null then null else jsonb_build_object(
        'id', v.id, 'name', v.name, 'address', v.address, 'city', v.city,
        'state', v.state, 'country', v.country, 'phone', v.phone,
        'website', v.website, 'email', v.email) end
    )
  from paged p
  left join public.venues v on v.id = p.venue_id;
$function$;

grant execute on function public.search_events(
  text, text, timestamptz, timestamptz, text[], text[], text[], text,
  boolean, integer, integer, uuid, uuid
) to anon, authenticated, service_role;

create or replace function public.rpc_venues_ranked(
  p_user_id uuid default null,
  p_lat numeric default null,
  p_lng numeric default null,
  p_filters jsonb default '{}',
  p_sort text default 'relevance',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table(venue jsonb, score numeric, distance_m numeric, total_count bigint)
language plpgsql
stable security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_prefs_categories text[] := coalesce(
    (select array(select jsonb_array_elements_text(discovery_profile -> 'categories'))
       from public.profiles where user_id = p_user_id), array[]::text[]);
  v_prefs_tags text[] := coalesce(
    (select array(select jsonb_array_elements_text(discovery_profile -> 'tags'))
       from public.profiles where user_id = p_user_id), array[]::text[]);
  v_prefs_groups text[] := coalesce(
    (select array(select jsonb_array_elements_text(discovery_profile -> 'target_groups'))
       from public.profiles where user_id = p_user_id), array[]::text[]);
  v_behavior_cats text[] := case when p_user_id is null then array[]::text[] else coalesce(
    (select array_agg(category) from (
       select v.category, count(*) as n
       from public.venue_checkins c join public.venues v on v.id = c.venue_id
       where c.user_id = p_user_id and v.category is not null
       group by v.category having count(*) >= 3
     ) t), array[]::text[]) end;

  v_q text := nullif(p_filters->>'search', '');
  v_category text := nullif(p_filters->>'category', '');
  v_city text := nullif(p_filters->>'city', '');
  v_city_id uuid := nullif(p_filters->>'cityId', '')::uuid;
  v_country_id uuid := nullif(p_filters->>'countryId', '')::uuid;
  v_radius_km numeric := nullif(p_filters->>'radiusKm', '')::numeric;
  v_price int := nullif(p_filters->>'priceLevel', '')::int;
  v_tags text[] := coalesce(array(select jsonb_array_elements_text(p_filters -> 'tags')), array[]::text[]);
  v_amenities text[] := coalesce(array(select jsonb_array_elements_text(p_filters -> 'amenities')), array[]::text[]);
  v_services text[] := coalesce(array(select jsonb_array_elements_text(p_filters -> 'services')), array[]::text[]);
  v_access text[] := coalesce(array(select jsonb_array_elements_text(p_filters -> 'accessibility')), array[]::text[]);
  v_groups text[] := coalesce(array(select jsonb_array_elements_text(p_filters -> 'groups')), array[]::text[]);

  v_w_distance numeric := case when p_user_id is null then 0.55 else 0.35 end;
  v_w_interest numeric := case when p_user_id is null then 0.0 else 0.25 end;
  v_w_behavior numeric := case when p_user_id is null then 0.0 else 0.15 end;
  v_w_quality numeric := case when p_user_id is null then 0.30 else 0.15 end;
  v_w_recency numeric := 0.10;
  v_show_gated boolean := (select auth.uid()) is not null;
  v_total bigint;
begin
  select count(*) into v_total
  from public.venues v
  where v.data_source is distinct from 'refuge-restrooms'
    and v.duplicate_of_id is null
    and v.closed_at is null
    and (v_show_gated or v.safety_gated is not true)
    and (v_q is null or v.name ilike '%' || v_q || '%'
         or coalesce(v.description, '') ilike '%' || v_q || '%'
         or coalesce(v.address, '') ilike '%' || v_q || '%')
    and (v_category is null or v.category = v_category)
    and (
      (v_city_id is not null and (
        v.city_id = v_city_id
        or (v.city_id is null and v_city is not null and v_country_id is not null
            and v.country_id = v_country_id
            and public.immutable_unaccent(lower(btrim(v.city)))
                = public.immutable_unaccent(lower(btrim(v_city))))
      ))
      or (v_city_id is null and (v_city is null or v.city ilike '%' || v_city || '%')
          and (v_country_id is null or v.country_id = v_country_id))
    )
    and (array_length(v_tags, 1) is null or v.tags && v_tags)
    and (array_length(v_amenities, 1) is null or v.amenities && v_amenities)
    and (array_length(v_services, 1) is null or v.services && v_services)
    and (array_length(v_access, 1) is null or v.accessibility_attributes && v_access)
    and (array_length(v_groups, 1) is null or v.target_groups && v_groups)
    and (v_price is null or v.price_range = v_price);

  return query
  with base as (
    select v.*,
      (case when p_lat is not null and p_lng is not null
                  and v.latitude is not null and v.longitude is not null then
        6371000 * 2 * asin(sqrt(
          power(sin(radians((v.latitude - p_lat) / 2)), 2) +
          cos(radians(p_lat)) * cos(radians(v.latitude)) *
          power(sin(radians((v.longitude - p_lng) / 2)), 2)
        )) else null end)::numeric as dist_m
    from public.venues v
    where v.data_source is distinct from 'refuge-restrooms'
      and v.duplicate_of_id is null
      and v.closed_at is null
      and (v_show_gated or v.safety_gated is not true)
      and (v_q is null or v.name ilike '%' || v_q || '%'
           or coalesce(v.description, '') ilike '%' || v_q || '%'
           or coalesce(v.address, '') ilike '%' || v_q || '%')
      and (v_category is null or v.category = v_category)
      and (
        (v_city_id is not null and (
          v.city_id = v_city_id
          or (v.city_id is null and v_city is not null and v_country_id is not null
              and v.country_id = v_country_id
              and public.immutable_unaccent(lower(btrim(v.city)))
                  = public.immutable_unaccent(lower(btrim(v_city))))
        ))
        or (v_city_id is null and (v_city is null or v.city ilike '%' || v_city || '%')
            and (v_country_id is null or v.country_id = v_country_id))
      )
      and (array_length(v_tags, 1) is null or v.tags && v_tags)
      and (array_length(v_amenities, 1) is null or v.amenities && v_amenities)
      and (array_length(v_services, 1) is null or v.services && v_services)
      and (array_length(v_access, 1) is null or v.accessibility_attributes && v_access)
      and (array_length(v_groups, 1) is null or v.target_groups && v_groups)
      and (v_price is null or v.price_range = v_price)
  ), filtered as (
    select b.* from base b
    where v_radius_km is null or b.dist_m is null or b.dist_m <= v_radius_km * 1000
  ), scored as (
    select f.*,
      (case when f.dist_m is null then 0.3 else exp(-power(f.dist_m / 30000.0, 2)) end)::numeric as s_distance,
      least(1.0::numeric,
        (case when array_length(v_prefs_categories, 1) > 0 and f.category = any(v_prefs_categories) then 0.5 else 0 end)::numeric +
        (case when array_length(v_prefs_tags, 1) > 0 and f.tags && v_prefs_tags then 0.3 else 0 end)::numeric +
        (case when array_length(v_prefs_groups, 1) > 0 and f.target_groups && v_prefs_groups then 0.2 else 0 end)::numeric
      ) as s_interest,
      (case when array_length(v_behavior_cats, 1) > 0 and f.category = any(v_behavior_cats) then 1.0 else 0.0 end)::numeric as s_behavior,
      least(1.0::numeric,
        (case when f.is_featured then 0.5 else 0 end)::numeric +
        (case when f.verified then 0.3 else 0 end)::numeric + 0.2::numeric
      ) as s_quality,
      greatest(0.0::numeric, 1.0::numeric -
        (ln(greatest(1, extract(day from (now() - f.created_at))::int)) / ln(365))::numeric
      ) as s_recency
    from filtered f
  ), ranked as (
    select s.*,
      (v_w_distance * s.s_distance + v_w_interest * s.s_interest +
       v_w_behavior * s.s_behavior + v_w_quality * s.s_quality +
       v_w_recency * s.s_recency)::numeric as relevance
    from scored s
  )
  select
    to_jsonb(r) - 's_distance' - 's_interest' - 's_behavior'
                - 's_quality' - 's_recency' - 'relevance' - 'dist_m',
    r.relevance, r.dist_m, v_total
  from ranked r
  order by
    case when p_sort = 'name' then r.name end asc nulls last,
    case when p_sort = 'category' then r.category end asc nulls last,
    case when p_sort = 'city' then r.city end asc nulls last,
    case when p_sort = 'created_at' then r.created_at end desc nulls last,
    case when p_sort = 'featured' then r.is_featured::int end desc,
    case when p_sort = 'nearest' then r.dist_m end asc nulls last,
    case when p_sort = 'relevance' then r.relevance end desc nulls last,
    r.relevance desc nulls last, r.id asc
  limit p_limit offset p_offset;
end
$function$;

grant execute on function public.rpc_venues_ranked(uuid, numeric, numeric, jsonb, text, integer, integer)
to anon, authenticated, service_role;

-- Reject linked records that contradict their city's country. Historic or
-- geographic exceptions must first be represented explicitly, not inferred.
create or replace function public.city_relationship_country_mismatches()
returns table(entity_type text, entity_id uuid, city_id uuid, entity_country_id uuid, city_country_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select 'venue', v.id, v.city_id, v.country_id, c.country_id
  from public.venues v join public.cities c on c.id = v.city_id
  where v.duplicate_of_id is null and v.country_id is distinct from c.country_id
  union all
  select 'event', e.id, e.city_id, e.country_id, c.country_id
  from public.events e join public.cities c on c.id = e.city_id
  where e.duplicate_of_id is null and e.country_id is distinct from c.country_id;
$function$;

revoke all on function public.city_relationship_country_mismatches() from public, anon, authenticated;
grant execute on function public.city_relationship_country_mismatches() to service_role;
