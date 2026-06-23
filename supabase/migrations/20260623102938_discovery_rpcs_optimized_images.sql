-- Discovery RPCs (get_recommendations / related_entities / get_trending_entities)
-- only ever returned the raw `image_url` from search_documents / entity tables —
-- mostly publisher/merchant CDN hotlinks that 401/404 or get ORB-blocked, so the
-- "Recommended for you", "Trending" and "More like this" rails constantly fell
-- back to texture placeholders even when an R2-mirrored optimized copy exists in
-- image_assets for the entity.
--
-- This mirrors what 20260613130000 already did for search_hybrid / autocomplete:
-- resolve the best optimized/thumbnail asset per hit via a LEFT JOIN LATERAL over
-- the already-limited result rows (active status, optimized/cdn_optimized only,
-- prefer role='cover'), and emit `optimizedUrl` / `thumbnailUrl` (jsonb RPCs) or
-- `optimized_url` / `thumbnail_url` (trending TABLE return). `imageUrl` stays as
-- the raw fallback so the client can run resolveImageUrl() and prefer the
-- reachable URL.
--
-- entity_type differs between search_documents ('news','marketplace') and
-- image_asset_links ('news_article','marketplace_listing'); mapped in each join.
-- Index image_asset_links_entity_idx (entity_type, entity_id) already exists.

-- ── get_recommendations (matview-backed jsonb) ─────────────────────────────
create or replace function public.get_recommendations(
  p_bias_vec      vector default null::vector,
  p_content_types text[] default null::text[],
  p_city          text default null::text,
  p_lat           double precision default null::double precision,
  p_lng           double precision default null::double precision,
  p_radius_km     double precision default null::double precision,
  p_exclude_ids   uuid[] default null::uuid[],
  p_now           timestamptz default now(),
  p_limit         integer default 20)
 returns jsonb
 language sql stable security definer set search_path to 'public', 'extensions', 'pg_temp'
as $function$
with params as (
  select case when p_lat is not null and p_lng is not null then st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography end as origin
),
cand as (
  select sd.entity_id, sd.entity_type, sd.title, sd.description, sd.city, sd.country, sd.slug, sd.image_url, sd.facets, sd.is_featured, sd.quality_score, sd.start_date,
         coalesce(p.pn,0) as pop,
         case when p_bias_vec is not null and e.embedding is not null then 1-(e.embedding <=> p_bias_vec) else 0 end as vec,
         case when pr.origin is not null and sd.geog is not null then st_distance(sd.geog,pr.origin) else null end as dist
  from public.search_documents sd
  cross join params pr
  left join public.mv_entity_popularity p on p.content_type=sd.entity_type and p.content_id=sd.entity_id::text
  left join lateral (select se.embedding from public.search_embeddings se where p_bias_vec is not null and se.doc_id=sd.doc_id) e on true
  where (p_content_types is null or sd.entity_type=any(p_content_types))
    and (p_exclude_ids is null or sd.entity_id<>all(p_exclude_ids))
    and (p_city is null or lower(sd.city)=lower(p_city))
    and (pr.origin is null or (sd.geog is not null and st_dwithin(sd.geog,pr.origin,p_radius_km*1000)))
    and (sd.entity_type<>'event' or sd.start_date is null or coalesce(sd.end_date,sd.start_date)>=p_now)
    and coalesce(sd.liveness_status,'') not in ('dead','cancelled','dead_link')
    and sd.closed_at is null
),
scored as (
  select *, 0.45*pop+0.25*vec+case when is_featured then 0.12 else 0 end+0.10*(coalesce(quality_score,0)/100.0)+case when entity_type='event' and start_date is not null and start_date>=p_now then 0.08*exp(-extract(epoch from (start_date-p_now))/(60*60*24*30)) else 0 end-case when dist is not null then least(dist/50000.0,1)*0.05 else 0 end as score
  from cand
)
select coalesce((
  select jsonb_agg(jsonb_build_object(
    'objectID',x.entity_id,'type',x.entity_type,'title',x.title,'description',left(x.description,200),
    'city',x.city,'country',x.country,'slug',x.slug,'imageUrl',x.image_url,
    'optimizedUrl',img.optimized_url,'thumbnailUrl',img.thumbnail_url,
    'category',x.facets->>'category','featured',x.is_featured,
    'start_date',extract(epoch from x.start_date),'_score',round(x.score::numeric,4)
  ) order by x.score desc)
  from (select * from scored order by score desc limit greatest(p_limit,0)) x
  left join lateral (
    select ia.optimized_url, ia.thumbnail_url
    from public.image_asset_links l
    join public.image_assets ia on ia.id = l.asset_id
    where l.entity_id = x.entity_id
      and l.entity_type = case x.entity_type
            when 'news' then 'news_article'
            when 'marketplace' then 'marketplace_listing'
            else x.entity_type end
      and ia.status = 'active'
      and ia.optimization_status in ('optimized','cdn_optimized')
    order by (l.role = 'cover') desc, l.sort_order nulls last
    limit 1
  ) img on true
), '[]'::jsonb);
$function$;

grant execute on function public.get_recommendations(vector, text[], text, double precision, double precision, double precision, uuid[], timestamptz, integer) to anon, authenticated, service_role;


-- ── related_entities (plpgsql jsonb) ───────────────────────────────────────
create or replace function public.related_entities(
  p_entity_type   text,
  p_entity_id     uuid,
  p_content_types text[] default null,
  p_same_type_only boolean default false,
  p_limit         int default 10,
  p_now           timestamptz default now())
 returns jsonb
 language plpgsql stable security definer set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v extensions.vector(1024);
begin
  select se.embedding into v
    from public.search_embeddings se
    join public.search_documents sd on sd.doc_id = se.doc_id
   where sd.entity_type = p_entity_type and sd.entity_id = p_entity_id;
  if v is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'objectID', nn.entity_id, 'type', nn.entity_type, 'title', nn.title,
        'description', left(nn.description, 200), 'city', nn.city, 'country', nn.country,
        'slug', nn.slug, 'imageUrl', nn.image_url,
        'optimizedUrl', img.optimized_url, 'thumbnailUrl', img.thumbnail_url,
        'category', nn.facets->>'category',
        'featured', nn.is_featured, '_score', round(nn.sim::numeric, 4)
      ) order by nn.sim desc)
    from (
      select sd.entity_id, sd.entity_type, sd.title, sd.description, sd.city, sd.country,
             sd.slug, sd.image_url, sd.facets, sd.is_featured,
             1 - (se.embedding <=> v) as sim
      from public.search_documents sd
      join public.search_embeddings se on se.doc_id = sd.doc_id
      where se.embedding is not null
        and not (sd.entity_type = p_entity_type and sd.entity_id = p_entity_id)
        and (p_content_types is null or sd.entity_type = any(p_content_types))
        and (not p_same_type_only or sd.entity_type = p_entity_type)
        and (sd.entity_type <> 'event' or sd.start_date is null or coalesce(sd.end_date, sd.start_date) >= p_now - interval '1 day')
        and coalesce(sd.liveness_status,'') not in ('dead','cancelled','dead_link')
        and sd.closed_at is null
      order by se.embedding <=> v
      limit greatest(p_limit, 0)
    ) nn
    left join lateral (
      select ia.optimized_url, ia.thumbnail_url
      from public.image_asset_links l
      join public.image_assets ia on ia.id = l.asset_id
      where l.entity_id = nn.entity_id
        and l.entity_type = case nn.entity_type
              when 'news' then 'news_article'
              when 'marketplace' then 'marketplace_listing'
              else nn.entity_type end
        and ia.status = 'active'
        and ia.optimization_status in ('optimized','cdn_optimized')
      order by (l.role = 'cover') desc, l.sort_order nulls last
      limit 1
    ) img on true
  ), '[]'::jsonb);
end $function$;

grant execute on function public.related_entities(text, uuid, text[], boolean, int, timestamptz) to anon, authenticated, service_role;


-- ── get_trending_entities (RETURNS TABLE — adds two columns, must drop first) ─
drop function if exists public.get_trending_entities(text[], text, integer);

create function public.get_trending_entities(
  p_types text[] default array['venue'::text, 'event'::text],
  p_city  text default null::text,
  p_limit integer default 20)
 returns table(entity_type text, entity_id text, score real, title text, city text, country text, slug text, image_url text, optimized_url text, thumbnail_url text, start_date timestamptz, end_date timestamptz)
 language sql stable security definer set search_path to 'public', 'extensions'
as $function$
  WITH w AS (
    SELECT entity_type, entity_id,
      sum(
        CASE event_type
          WHEN 'click'    THEN 1
          WHEN 'view'     THEN 0.3
          WHEN 'save'     THEN 3
          WHEN 'favorite' THEN 3
          WHEN 'book'     THEN 5
          WHEN 'attend'   THEN 5
          ELSE 0
        END
        * exp(-EXTRACT(EPOCH FROM (now() - created_at)) / (3.0 * 86400.0))
      )::real AS score
    FROM user_events
    WHERE created_at > now() - interval '7 days'
      AND entity_type = ANY(p_types)
    GROUP BY entity_type, entity_id
  )
  SELECT
    w.entity_type,
    w.entity_id,
    w.score,
    COALESCE(v.name, e.title, c.name, p.name) AS title,
    COALESCE(v.city, e.city, c.name) AS city,
    COALESCE(v.country, e.country, co.name) AS country,
    COALESCE(v.slug, e.slug, c.slug, p.slug) AS slug,
    COALESCE(
      v.images[1], v.logo_url,
      e.images[1], e.logo_url,
      c.curated_image_url, c.image_url,
      co.curated_image_url, co.image_url,
      p.image_url
    ) AS image_url,
    img.optimized_url,
    img.thumbnail_url,
    e.start_date,
    e.end_date
  FROM w
  LEFT JOIN venues v        ON w.entity_type = 'venue'       AND v.id::text  = w.entity_id
  LEFT JOIN events e        ON w.entity_type = 'event'       AND e.id::text  = w.entity_id
  LEFT JOIN cities c        ON w.entity_type = 'city'        AND c.id::text  = w.entity_id
  LEFT JOIN countries co    ON w.entity_type = 'country'     AND co.id::text = w.entity_id
  LEFT JOIN personalities p ON w.entity_type = 'personality' AND p.id::text  = w.entity_id
  LEFT JOIN LATERAL (
    select ia.optimized_url, ia.thumbnail_url
    from public.image_asset_links l
    join public.image_assets ia on ia.id = l.asset_id
    where l.entity_id::text = w.entity_id
      and l.entity_type = case w.entity_type
            when 'news' then 'news_article'
            when 'marketplace' then 'marketplace_listing'
            else w.entity_type end
      and ia.status = 'active'
      and ia.optimization_status in ('optimized','cdn_optimized')
    order by (l.role = 'cover') desc, l.sort_order nulls last
    limit 1
  ) img ON true
  WHERE (p_city IS NULL OR lower(COALESCE(v.city, e.city, c.name)) = lower(p_city))
    AND (
      w.entity_type <> 'event'
      OR e.end_date IS NULL AND e.start_date >= now() - interval '12 hours'
      OR e.end_date >= now()
    )
  ORDER BY w.score DESC
  LIMIT p_limit;
$function$;

grant execute on function public.get_trending_entities(text[], text, integer) to anon, authenticated, service_role;


-- ── Data cleanup: scraper-corrupted event image URLs ───────────────────────
-- e.g. `https://www.gaytravel4u.comdata:image/svg+xml,...` — a lazy-load `data:`
-- placeholder concatenated onto the real host. Can never resolve to an image.
-- Fix at the source (events) so the events→search_documents trigger propagates,
-- then patch search_documents directly for immediacy.
update public.events
   set logo_url = null
 where logo_url ilike '%data:image%';

update public.events
   set images = (select array_agg(x) from unnest(images) x where x not ilike '%data:image%')
 where images is not null
   and exists (select 1 from unnest(images) x where x ilike '%data:image%');

update public.search_documents
   set image_url = null
 where image_url ilike '%data:image%';
