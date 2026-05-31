-- v_popular_entities is an expensive aggregating view; computing it per
-- get_recommendations call cost ~4.8s. Precompute it into an indexed materialized
-- view (per-type normalized popularity) so the recommendations feed is fast
-- (~180ms scoped / ~490ms global), and refresh it on a schedule. (plan §9.1 / Phase 8)
create materialized view if not exists public.mv_entity_popularity as
  select content_type,
         content_id::text as content_id,
         score,
         (score / nullif(max(score) over (partition by content_type), 0))::real as pn
  from public.v_popular_entities;

create unique index if not exists mv_entity_popularity_pk
  on public.mv_entity_popularity (content_type, content_id);

-- Refresh on a schedule (CONCURRENTLY needs the unique index above).
select cron.schedule(
  'refresh-entity-popularity',
  '*/30 * * * *',
  $cron$refresh materialized view concurrently public.mv_entity_popularity$cron$
);

-- Repoint get_recommendations at the materialized popularity.
create or replace function public.get_recommendations(
  p_bias_vec      extensions.vector(1024) default null,
  p_content_types text[]      default null,
  p_city          text        default null,
  p_lat           double precision default null,
  p_lng           double precision default null,
  p_radius_km     double precision default null,
  p_exclude_ids   uuid[]      default null,
  p_now           timestamptz default now(),
  p_limit         int         default 20
) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
with params as (
  select case when p_lat is not null and p_lng is not null
              then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as origin
),
cand as (
  select sd.entity_id, sd.entity_type, sd.title, sd.description, sd.city, sd.country,
         sd.slug, sd.image_url, sd.facets, sd.is_featured, sd.quality_score, sd.start_date,
         coalesce(p.pn, 0) as pop,
         case when p_bias_vec is not null and sd.embedding is not null then 1 - (sd.embedding <=> p_bias_vec) else 0 end as vec,
         case when pr.origin is not null and sd.geog is not null then st_distance(sd.geog, pr.origin) else null end as dist
  from public.search_documents sd
  cross join params pr
  left join public.mv_entity_popularity p on p.content_type = sd.entity_type and p.content_id = sd.entity_id::text
  where (p_content_types is null or sd.entity_type = any(p_content_types))
    and (p_exclude_ids is null or sd.entity_id <> all(p_exclude_ids))
    and (p_city is null or lower(sd.city) = lower(p_city))
    and (pr.origin is null or (sd.geog is not null and st_dwithin(sd.geog, pr.origin, p_radius_km*1000)))
    and (sd.entity_type <> 'event' or sd.start_date is null or coalesce(sd.end_date, sd.start_date) >= p_now)
    and coalesce(sd.liveness_status,'') not in ('dead','cancelled','dead_link')
    and sd.closed_at is null
),
scored as (
  select *,
      0.45*pop
    + 0.25*vec
    + case when is_featured then 0.12 else 0 end
    + 0.10*(coalesce(quality_score,0)/100.0)
    + case when entity_type='event' and start_date is not null and start_date >= p_now
           then 0.08*exp(-extract(epoch from (start_date - p_now))/(60*60*24*30)) else 0 end
    - case when dist is not null then least(dist/50000.0, 1)*0.05 else 0 end
    as score
  from cand
)
select coalesce((
  select jsonb_agg(jsonb_build_object(
    'objectID', entity_id, 'type', entity_type, 'title', title,
    'description', left(description, 200), 'city', city, 'country', country,
    'slug', slug, 'imageUrl', image_url, 'category', facets->>'category',
    'featured', is_featured, 'start_date', extract(epoch from start_date),
    '_score', round(score::numeric, 4)
  ) order by score desc)
  from (select * from scored order by score desc limit greatest(p_limit, 0)) x
), '[]'::jsonb);
$$;
