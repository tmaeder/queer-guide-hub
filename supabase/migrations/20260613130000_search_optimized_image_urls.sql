-- Search surfaces (autocomplete + hybrid) carried only the raw external
-- `image_url` from search_documents — mostly publisher/merchant CDN hotlinks
-- that 401/404 or get ORB-blocked, so suggestions and result cards constantly
-- fell back to icon tiles / textures even though an R2-mirrored optimized copy
-- exists in image_assets for a large share of entities.
--
-- This resolves the best optimized/thumbnail asset per hit via a LEFT JOIN
-- LATERAL on the already-limited result rows (mirrors useEntityImageAssets:
-- active status, optimized/cdn_optimized only, prefer role='cover'). The new
-- `optimizedUrl` / `thumbnailUrl` keys let the client run resolveImageUrl()
-- and prefer the reachable URL. `imageUrl` stays as the raw fallback.
--
-- entity_type differs between search_documents ('news','marketplace') and
-- image_asset_links ('news_article','marketplace_listing'); mapped in the join.
-- Index image_asset_links_entity_idx (entity_type, entity_id) already exists.

create or replace function public.search_autocomplete(
  p_prefix text,
  p_content_types text[] default null::text[],
  p_limit int default 8,
  p_now timestamptz default now())
 returns jsonb
 language sql stable security definer set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  with cand as (
    select entity_id, entity_type, title, city, country, slug, image_url,
           (title ilike p_prefix || '%') as is_prefix,
           similarity(title, p_prefix) as sim,
           is_featured as featured
    from public.search_documents
    where (p_content_types is null or entity_type = any(p_content_types))
      and title is not null and length(btrim(p_prefix)) >= 2
      and (title ilike p_prefix || '%' or title % p_prefix)
      and coalesce(liveness_status,'') not in ('dead','cancelled','dead_link')
      and closed_at is null
      and (entity_type <> 'event' or start_date is null or coalesce(end_date, start_date) >= p_now - interval '1 day')
  ),
  ranked as (
    select *, row_number() over (partition by entity_type order by is_prefix desc, sim desc, featured desc, title) as rn
    from cand
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'objectID', z.entity_id, 'type', z.entity_type, 'title', z.title,
    'city', z.city, 'country', z.country, 'slug', z.slug, 'imageUrl', z.image_url,
    'optimizedUrl', img.optimized_url, 'thumbnailUrl', img.thumbnail_url
  ) order by z.rn, z.is_prefix desc, z.sim desc, z.title), '[]'::jsonb)
  from (
    select * from ranked
    order by rn, is_prefix desc, sim desc, title
    limit greatest(p_limit, 0)
  ) z
  left join lateral (
    select ia.optimized_url, ia.thumbnail_url
    from public.image_asset_links l
    join public.image_assets ia on ia.id = l.asset_id
    where l.entity_id = z.entity_id
      and l.entity_type = case z.entity_type
            when 'news' then 'news_article'
            when 'marketplace' then 'marketplace_listing'
            else z.entity_type end
      and ia.status = 'active'
      and ia.optimization_status in ('optimized','cdn_optimized')
    order by (l.role = 'cover') desc, l.sort_order nulls last
    limit 1
  ) img on true;
$function$;

grant execute on function public.search_autocomplete(text, text[], int, timestamptz) to anon, authenticated, service_role;


create or replace function public.search_hybrid(
  p_query text default ''::text,
  p_query_vec vector default null::vector,
  p_content_types text[] default null::text[],
  p_filters jsonb default '{}'::jsonb,
  p_lat double precision default null::double precision,
  p_lng double precision default null::double precision,
  p_radius_km double precision default null::double precision,
  p_now timestamptz default now(),
  p_limit integer default 20,
  p_offset integer default 0,
  p_date_from timestamptz default null::timestamptz,
  p_date_to timestamptz default null::timestamptz,
  p_price_min numeric default null::numeric,
  p_price_max numeric default null::numeric,
  p_sort text default null::text)
 returns jsonb
 language sql stable security definer set search_path to 'public', 'extensions', 'pg_temp'
as $function$
with toks as (select regexp_split_to_array(lower(unaccent(coalesce(nullif(btrim(p_query),''),''))), '\s+') as arr),
qcity as (select cname from (select c.title cname,(select count(*) from public.search_documents v where v.entity_type='venue' and lower(v.city)=lower(c.title)) n from public.search_documents c, toks where c.entity_type='city' and c.title is not null and length(c.title)>=4 and lower(unaccent(c.title))=any(toks.arr)) z where z.n>=10 order by z.n desc limit 1),
params as (select nullif(btrim(p_query),'') q0, (select cname from qcity) dcity, case when p_lat is not null and p_lng is not null then st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography end origin),
p2 as (select q0,dcity,origin, lower(coalesce(p_filters->>'city',dcity)) boost_city, nullif(btrim(case when dcity is not null then regexp_replace(q0,dcity,'','gi') else q0 end),'') eff_q from params),
vnn as (select se.doc_id from public.search_embeddings se where p_query_vec is not null and se.embedding is not null order by se.embedding <=> p_query_vec limit 200),
kwvec as (
  select sd.doc_id from public.search_documents sd, p2 p
  where p.eff_q is not null and (sd.search_tsv @@ websearch_to_tsquery('simple',unaccent(p.eff_q)) or sd.title % p.eff_q)
  union
  select doc_id from vnn
),
cand as (
  select sd.doc_id, sd.entity_id, sd.entity_type, sd.title, sd.description, sd.facets, sd.city, sd.country, sd.slug, sd.image_url, sd.is_featured, sd.is_free, sd.price_min, sd.price_max, sd.start_date, sd.end_date, sd.trust_score, sd.liveness_status, sd.geog, sd.quality_score, sd.closed_at, sd.lgbtq_score, p.boost_city,
    case when p.eff_q is not null then ts_rank_cd(sd.search_tsv, websearch_to_tsquery('simple',unaccent(p.eff_q))) else 0 end kw_rank,
    case when p.eff_q is not null then similarity(coalesce(sd.title,''),p.eff_q) else 0 end trg,
    case when p_query_vec is not null and emb.embedding is not null then 1-(emb.embedding <=> p_query_vec) else null end vec_sim,
    case when p.origin is not null and sd.geog is not null then st_distance(sd.geog,p.origin) else null end dist_m
  from public.search_documents sd cross join p2 p
    left join lateral (select se.embedding from public.search_embeddings se where p_query_vec is not null and se.doc_id=sd.doc_id) emb on true
  where (p_content_types is null or sd.entity_type=any(p_content_types))
    and sd.closed_at is null
    and (not (p_filters ? 'city') or lower(sd.city)=lower(p_filters->>'city'))
    and (not (p_filters ? 'country') or lower(sd.country)=lower(p_filters->>'country'))
    and (not (p_filters ? 'category') or lower(sd.facets->>'category')=lower(p_filters->>'category'))
    and (not (p_filters ? 'is_featured') or sd.is_featured=(p_filters->>'is_featured')::boolean)
    and (not (p_filters ? 'is_free') or sd.is_free=(p_filters->>'is_free')::boolean)
    and (not (p_filters ? 'target_groups')
         or (jsonb_typeof(sd.facets->'target_groups')='array'
             and (sd.facets->'target_groups') ?| array(select jsonb_array_elements_text(p_filters->'target_groups'))))
    and (p_date_from is null or (sd.start_date is not null and coalesce(sd.end_date,sd.start_date) >= p_date_from))
    and (p_date_to   is null or (sd.start_date is not null and sd.start_date <= p_date_to))
    and (p_price_min is null or coalesce(sd.price_max,sd.price_min) >= p_price_min)
    and (p_price_max is null or coalesce(sd.price_min,sd.price_max) <= p_price_max)
    and (p.origin is null or (sd.geog is not null and st_dwithin(sd.geog,p.origin,p_radius_km*1000)))
    and (sd.entity_type<>'event' or sd.start_date is null or coalesce(sd.end_date,sd.start_date)>=p_now-interval '1 day')
    and (
      (p.eff_q is null and p.boost_city is null)
      or (p.eff_q is null and p.boost_city is not null and lower(sd.city)=p.boost_city)
      or (p.eff_q is not null and sd.doc_id in (select doc_id from kwvec))
    )
),
kw as (select doc_id, rank() over (order by greatest(kw_rank,trg) desc) rk from cand where greatest(kw_rank,trg)>0),
vec as (select doc_id, rank() over (order by vec_sim desc) rk from cand where vec_sim is not null),
fused as (select c.*, coalesce(1.0/(60+kw.rk),0)+coalesce(1.0/(60+vec.rk),0) rrf from cand c left join kw using(doc_id) left join vec using(doc_id)),
scored as (select f.*, f.rrf
   + 0.06 * case when f.entity_type='venue' then coalesce(f.lgbtq_score, 0.5) else 1.0 end
   + case f.entity_type when 'venue' then 0.015 when 'queer_village' then 0.012 when 'event' then 0.010 when 'personality' then 0.010 when 'city' then 0.006 when 'country' then 0.004 when 'marketplace' then 0.004 when 'news' then -0.010 when 'tag' then -0.006 else 0 end
   + case when f.boost_city is not null and lower(f.city)=f.boost_city then 0.05 else 0 end
   + case when f.is_featured then 0.02 else 0 end
   + case when f.liveness_status in ('dead','cancelled','dead_link','sold_out') then -0.5 when f.liveness_status='live' then 0.01 else 0 end
   + case when f.closed_at is not null then -0.5 else 0 end
   + case when f.entity_type='event' and f.start_date is not null and f.start_date>=p_now then 0.03*exp(-extract(epoch from (f.start_date-p_now))/(60*60*24*30)) else 0 end
   - case when f.dist_m is not null then least(f.dist_m/50000.0,1)*0.02 else 0 end as score from fused f)
select jsonb_build_object('total',(select count(*) from cand),'hits',coalesce((
  select jsonb_agg(
    jsonb_build_object('objectID',s.entity_id,'doc_id',s.doc_id,'type',s.entity_type,'title',s.title,'description',left(s.description,300),'category',s.facets->>'category','city',s.city,'country',s.country,'location',nullif(concat_ws(', ',s.city,s.country),''),'slug',s.slug,'imageUrl',s.image_url,'optimizedUrl',img.optimized_url,'thumbnailUrl',img.thumbnail_url,'featured',s.is_featured,'is_free',s.is_free,'price_min',s.price_min,'price_max',s.price_max,'start_date',extract(epoch from s.start_date),'end_date',extract(epoch from s.end_date),'trust_score',s.trust_score,'liveness_status',s.liveness_status,'_geoloc',case when s.geog is not null then jsonb_build_object('lat',st_y(s.geog::geometry),'lng',st_x(s.geog::geometry)) end,'_distance_m',case when s.dist_m is not null then round(s.dist_m)::int end,'_rankingScore',round(s.score::numeric,6),'tags',s.facets->'tags')
    order by s.ord)
  from (
    select scored.*, row_number() over (
      order by
        case when p_sort='date_asc'   then extract(epoch from start_date) end asc  nulls last,
        case when p_sort='date_desc'  then extract(epoch from start_date) end desc nulls last,
        case when p_sort='price_asc'  then price_min end                     asc  nulls last,
        case when p_sort='price_desc' then coalesce(price_max,price_min) end desc nulls last,
        case when p_sort='distance'   then dist_m end                        asc  nulls last,
        case when p_sort='trust'      then trust_score end                   desc nulls last,
        score desc, quality_score desc nulls last
    ) as ord
    from scored
    order by
      case when p_sort='date_asc'   then extract(epoch from start_date) end asc  nulls last,
      case when p_sort='date_desc'  then extract(epoch from start_date) end desc nulls last,
      case when p_sort='price_asc'  then price_min end                     asc  nulls last,
      case when p_sort='price_desc' then coalesce(price_max,price_min) end desc nulls last,
      case when p_sort='distance'   then dist_m end                        asc  nulls last,
      case when p_sort='trust'      then trust_score end                   desc nulls last,
      score desc, quality_score desc nulls last
    limit greatest(p_limit,0) offset greatest(p_offset,0)
  ) s
  left join lateral (
    select ia.optimized_url, ia.thumbnail_url
    from public.image_asset_links l
    join public.image_assets ia on ia.id = l.asset_id
    where l.entity_id = s.entity_id
      and l.entity_type = case s.entity_type
            when 'news' then 'news_article'
            when 'marketplace' then 'marketplace_listing'
            else s.entity_type end
      and ia.status = 'active'
      and ia.optimization_status in ('optimized','cdn_optimized')
    order by (l.role = 'cover') desc, l.sort_order nulls last
    limit 1
  ) img on true
), '[]'::jsonb))
$function$;

grant execute on function public.search_hybrid(text, vector, text[], jsonb, double precision, double precision, double precision, timestamptz, integer, integer, timestamptz, timestamptz, numeric, numeric, text) to anon, authenticated, service_role;
