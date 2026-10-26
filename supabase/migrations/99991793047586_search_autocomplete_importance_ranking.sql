-- search_autocomplete: rank by importance, not by a one-per-type round robin.
--
-- The old body took row_number() over (partition by entity_type) and emitted
-- rn=1 of every type before any rn=2, ordered within a type by similarity
-- alone. So each type got exactly one slot, filled by the closest spelling:
--   `par`   -> "Par" (a Cornish village, 1 venue) as the only city; Paris absent
--   `new y` -> a venue called "New York" in Didymoteicho above New York City
--   `berl`  -> a venue called "Berlin" in Rhodes in the top 2
-- and every venue appeared twice, once as its org-spine organization twin.
--
-- Now: prefix matches first; featured PLACES (city/country/village) next;
-- then closeness to the typed text, featured, type, quality. At most 3 per
-- type (soft diversity instead of forced rotation). Rows identical on
-- (title, city, country) are collapsed, keeping the higher-ranked type, so a
-- venue and its organization twin show once; same-named cities in different
-- countries (London GB / London CA) stay distinct.

create or replace function api_private.search_autocomplete(
  p_prefix text,
  p_content_types text[] default null::text[],
  p_limit integer default 8,
  p_now timestamp with time zone default now(),
  p_include_gated boolean default false)
returns jsonb
language sql
stable security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
  with cand as (
    select entity_id, entity_type, title, city, country, slug, image_url,
      (title ilike p_prefix||'%') as is_prefix,
      similarity(title, p_prefix) as sim,
      is_featured as featured,
      (is_featured and entity_type in ('city','country','queer_village')) as place_featured,
      quality_score,
      case entity_type when 'city' then 1 when 'country' then 2 when 'queer_village' then 3
        when 'venue' then 4 when 'event' then 5 when 'personality' then 6 when 'tag' then 7
        when 'group' then 8 when 'organization' then 9 when 'marketplace' then 10
        when 'news' then 11 else 12 end as type_rank
    from public.search_documents
    where (p_content_types is null or entity_type = any(p_content_types))
      and (p_include_gated or not safety_gated)
      and title is not null and length(btrim(p_prefix)) >= 2
      and (title ilike p_prefix||'%' or title % p_prefix)
      and coalesce(liveness_status,'') not in ('dead','cancelled','dead_link') and closed_at is null
      and (entity_type <> 'event' or start_date is null or coalesce(end_date,start_date) >= p_now - interval '1 day')),
  dedup as (
    select distinct on (lower(title), lower(coalesce(city,'')), lower(coalesce(country,''))) *
    from cand
    order by lower(title), lower(coalesce(city,'')), lower(coalesce(country,'')),
             featured desc, type_rank, quality_score desc nulls last),
  ranked as (
    select *, row_number() over (partition by entity_type
      order by is_prefix desc, place_featured desc, sim desc, featured desc, quality_score desc nulls last, title) as rn
    from dedup),
  top as (
    select * from ranked where rn <= 3
    order by is_prefix desc, place_featured desc, sim desc, featured desc, type_rank, quality_score desc nulls last, title
    limit greatest(p_limit, 0))
  select coalesce(jsonb_agg(jsonb_build_object(
      'objectID', z.entity_id, 'type', z.entity_type, 'title', z.title, 'city', z.city,
      'country', z.country, 'slug', z.slug, 'imageUrl', z.image_url,
      'optimizedUrl', img.optimized_url, 'thumbnailUrl', img.thumbnail_url)
    order by z.is_prefix desc, z.place_featured desc, z.sim desc, z.featured desc, z.type_rank,
             z.quality_score desc nulls last, z.title), '[]'::jsonb)
  from top z
  left join lateral (
    select ia.optimized_url, ia.thumbnail_url
    from public.image_asset_links l join public.image_assets ia on ia.id = l.asset_id
    where l.entity_id = z.entity_id
      and l.entity_type = case z.entity_type when 'news' then 'news_article' when 'marketplace' then 'marketplace_listing' else z.entity_type end
      and ia.status = 'active' and ia.optimization_status in ('optimized','cdn_optimized')
    order by (l.role = 'cover') desc, l.sort_order nulls last
    limit 1) img on true;
$fn$;

do $verify$
declare
  v jsonb;
begin
  -- `par` leads with Paris, France (featured place), not the village of Par.
  v := api_private.search_autocomplete('par', null, 8, now(), false);
  if v->0->>'type' <> 'city' or v->0->>'title' <> 'Paris' then
    raise exception 'autocomplete(par) first is %/%, expected city Paris', v->0->>'type', v->0->>'title';
  end if;
  -- `new y` leads with the city.
  v := api_private.search_autocomplete('new y', null, 8, now(), false);
  if v->0->>'type' <> 'city' or v->0->>'title' <> 'New York' then
    raise exception 'autocomplete(new y) first is %/%, expected city New York', v->0->>'type', v->0->>'title';
  end if;
  -- No row appears twice on (title, city, country).
  v := api_private.search_autocomplete('berghain', null, 8, now(), false);
  if (select count(*) from jsonb_array_elements(v) e) <>
     (select count(distinct lower(e->>'title')||'|'||lower(coalesce(e->>'city',''))||'|'||lower(coalesce(e->>'country',''))) from jsonb_array_elements(v) e) then
    raise exception 'autocomplete(berghain) still returns duplicate title/city/country rows';
  end if;
end
$verify$;
