-- Safety layer (2/3): close the search/discovery surface.
--
-- The search-proxy Worker calls these RPCs with the SERVICE key and SECURITY
-- DEFINER bypasses RLS, so the entity-table RLS from migration 1 does NOT protect
-- search. We denormalize `safety_gated` onto search_documents and teach every
-- anon-reachable discovery RPC to exclude gated rows unless the caller proves the
-- user is authenticated:
--   * search_hybrid / search_facets        -> gate via p_filters->>'include_gated'
--                                              (no signature change; contract assert
--                                               + hot path untouched)
--   * search_autocomplete / get_recommendations / related_entities
--                                           -> new p_include_gated boolean param
--   * events_in_window                      -> always excludes gated (public calendar)
--   * rpc_venues_ranked (browser, user JWT) -> gate via auth.uid()
--   * v_popular_entities (popular/trending)  -> drops gated venues/events at source
-- The Worker passes include_gated=true only after verifying the user's JWT.

-- ---------------------------------------------------------------------------
-- search_documents.safety_gated, kept in sync by a BEFORE trigger that mirrors
-- the source entity. Decoupled from the (frequently-rewritten) indexer functions:
-- every indexer upsert fires this trigger, which re-derives the flag.
-- ---------------------------------------------------------------------------
alter table public.search_documents add column if not exists safety_gated boolean not null default false;
create index if not exists idx_search_documents_safety_gated on public.search_documents(doc_id) where safety_gated;

create or replace function public.set_search_document_safety_gated()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.safety_gated := case new.entity_type
    when 'venue'        then coalesce((select safety_gated from public.venues        where id = new.entity_id), false)
    when 'event'        then coalesce((select safety_gated from public.events        where id = new.entity_id), false)
    when 'organization' then coalesce((select safety_gated from public.organizations where id = new.entity_id), false)
    else false
  end;
  return new;
end;
$$;

drop trigger if exists trg_search_documents_safety_gated on public.search_documents;
create trigger trg_search_documents_safety_gated
  before insert or update on public.search_documents
  for each row execute function public.set_search_document_safety_gated();

-- Backfill existing docs.
update public.search_documents sd set safety_gated = true
 where sd.safety_gated is distinct from true
   and (
     (sd.entity_type = 'venue'        and sd.entity_id in (select id from public.venues        where safety_gated))
  or (sd.entity_type = 'event'        and sd.entity_id in (select id from public.events        where safety_gated))
  or (sd.entity_type = 'organization' and sd.entity_id in (select id from public.organizations where safety_gated))
   );

-- ---------------------------------------------------------------------------
-- v_popular_entities: drop gated venues/events from the popular/trending feed
-- entirely (global discovery should not promote high-risk gated content).
-- Column list unchanged so the dependent mv_entity_popularity view is unaffected.
-- ---------------------------------------------------------------------------
create or replace view public.v_popular_entities as
 select 'venue'::text as content_type,
    (venues.id)::text as content_id,
    ((coalesce((venues.quality_score)::integer, 0) +
        case when venues.is_featured then 20 else 0 end))::real as score
   from venues
  where not venues.safety_gated
union all
 select 'event'::text as content_type,
    (events.id)::text as content_id,
    (((case when events.is_featured then 20 else 0 end)::numeric
      + greatest((0)::numeric, ((30)::numeric - (extract(epoch from (events.start_date - now())) / 86400.0)))))::real as score
   from events
  where (events.start_date > (now() - '1 day'::interval))
    and not events.safety_gated
union all
 select 'city'::text as content_type,
    (cities.id)::text as content_id,
    (10)::real as score
   from cities
union all
 select 'personality'::text as content_type,
    (personalities.id)::text as content_id,
    (5)::real as score
   from personalities;

-- ---------------------------------------------------------------------------
-- search_hybrid: gate via p_filters->>'include_gated' (signature unchanged).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_hybrid(p_query text DEFAULT ''::text, p_query_vec vector DEFAULT NULL::vector, p_content_types text[] DEFAULT NULL::text[], p_filters jsonb DEFAULT '{}'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_km double precision DEFAULT NULL::double precision, p_now timestamp with time zone DEFAULT now(), p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_sort text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
declare result jsonb;
begin
execute $q$
with toks as (select regexp_split_to_array(lower(unaccent(coalesce(nullif(btrim($1),''),''))), '\s+') as arr),
qcity as (select cname from (select c.title cname,(select count(*) from public.search_documents v where v.entity_type='venue' and lower(v.city)=lower(c.title)) n from public.search_documents c, toks where c.entity_type='city' and c.title is not null and length(c.title)>=4 and lower(unaccent(c.title))=any(toks.arr)) z where z.n>=10 order by z.n desc limit 1),
params as (select nullif(btrim($1),'') q0, (select cname from qcity) dcity, case when $5 is not null and $6 is not null then st_setsrid(st_makepoint($6,$5),4326)::geography end origin),
p2 as (select q0,dcity,origin, lower(coalesce($4->>'city',dcity)) boost_city, nullif(btrim(case when dcity is not null then regexp_replace(q0,dcity,'','gi') else q0 end),'') eff_q from params),
vnn as (select se.doc_id, (se.embedding <=> $2) as vdist from public.search_embeddings se where $2 is not null and se.embedding is not null order by se.embedding <=> $2 limit 200),
kwvec as (select sd.doc_id from public.search_documents sd, p2 p where p.eff_q is not null and (sd.search_tsv @@ websearch_to_tsquery('simple',unaccent(p.eff_q)) or sd.title % p.eff_q) union select doc_id from vnn),
cand as (select sd.doc_id, sd.entity_id, sd.entity_type, sd.city, sd.is_featured, sd.quality_score, sd.lgbtq_score, sd.liveness_status, sd.closed_at, sd.start_date, sd.price_min, sd.price_max, sd.trust_score, p.boost_city,
    case when p.eff_q is not null then ts_rank_cd(sd.search_tsv, websearch_to_tsquery('simple',unaccent(p.eff_q))) else 0 end kw_rank,
    case when p.eff_q is not null then similarity(coalesce(sd.title,''),p.eff_q) else 0 end trg,
    case when $2 is not null and vnn.vdist is not null then 1-vnn.vdist else null end vec_sim,
    case when p.origin is not null and sd.geog is not null then st_distance(sd.geog,p.origin) else null end dist_m
  from public.search_documents sd cross join p2 p left join vnn on vnn.doc_id=sd.doc_id
  where ($3 is null or sd.entity_type=any($3)) and sd.closed_at is null
    and (coalesce(($4->>'include_gated')::boolean,false) or not sd.safety_gated)
    and (not ($4 ? 'city') or lower(sd.city)=lower($4->>'city'))
    and (not ($4 ? 'country') or lower(sd.country)=lower($4->>'country'))
    and (not ($4 ? 'category') or lower(sd.facets->>'category')=lower($4->>'category'))
    and (not ($4 ? 'is_featured') or sd.is_featured=($4->>'is_featured')::boolean)
    and (not ($4 ? 'is_free') or sd.is_free=($4->>'is_free')::boolean)
    and (not ($4 ? 'target_groups') or (jsonb_typeof(sd.facets->'target_groups')='array' and (sd.facets->'target_groups') ?| array(select jsonb_array_elements_text($4->'target_groups'))))
    and (not ($4 ? 'tags') or (jsonb_typeof(sd.facets->'tags')='array' and (sd.facets->'tags') ?| array(select jsonb_array_elements_text($4->'tags'))))
    and ($11 is null or (sd.start_date is not null and coalesce(sd.end_date,sd.start_date) >= $11))
    and ($12 is null or (sd.start_date is not null and sd.start_date <= $12))
    and ($13 is null or coalesce(sd.price_max,sd.price_min) >= $13)
    and ($14 is null or coalesce(sd.price_min,sd.price_max) <= $14)
    and (p.origin is null or (sd.geog is not null and st_dwithin(sd.geog,p.origin,$7*1000)))
    and (sd.entity_type<>'event' or sd.start_date is null or coalesce(sd.end_date,sd.start_date)>=$8-interval '1 day')
    and ((p.eff_q is null and p.boost_city is null) or (p.eff_q is null and p.boost_city is not null and lower(sd.city)=p.boost_city) or (p.eff_q is not null and sd.doc_id in (select doc_id from kwvec)))),
kw as (select doc_id, rank() over (order by greatest(kw_rank,trg) desc) rk from cand where greatest(kw_rank,trg)>0),
vec as (select doc_id, rank() over (order by vec_sim desc) rk from cand where vec_sim is not null),
fused as (select c.*, coalesce(1.0/(60+kw.rk),0)+coalesce(1.0/(60+vec.rk),0) rrf from cand c left join kw using(doc_id) left join vec using(doc_id)),
scored as (select f.*, f.rrf + 0.06 * case when f.entity_type='venue' then coalesce(f.lgbtq_score, 0.5) else 1.0 end + case f.entity_type when 'venue' then 0.015 when 'queer_village' then 0.012 when 'event' then 0.010 when 'personality' then 0.010 when 'city' then 0.006 when 'country' then 0.004 when 'marketplace' then 0.004 when 'news' then -0.010 when 'tag' then -0.006 else 0 end + case when f.boost_city is not null and lower(f.city)=f.boost_city then 0.05 else 0 end + case when f.is_featured then 0.02 else 0 end + case when f.liveness_status in ('dead','cancelled','dead_link','sold_out') then -0.5 when f.liveness_status='live' then 0.01 else 0 end + case when f.closed_at is not null then -0.5 else 0 end + case when f.entity_type='event' and f.start_date is not null and f.start_date>=$8 then 0.03*exp(-extract(epoch from (f.start_date-$8))/(60*60*24*30)) else 0 end - case when f.dist_m is not null then least(f.dist_m/50000.0,1)*0.02 else 0 end as score from fused f),
top_hits as (select scored.doc_id, scored.entity_id, scored.entity_type, scored.score, scored.dist_m, case scored.entity_type when 'news' then 'news_article' when 'marketplace' then 'marketplace_listing' else scored.entity_type end as img_entity_type,
  row_number() over (order by case when $15='date_asc' then extract(epoch from start_date) end asc nulls last, case when $15='date_desc' then extract(epoch from start_date) end desc nulls last, case when $15='price_asc' then price_min end asc nulls last, case when $15='price_desc' then coalesce(price_max,price_min) end desc nulls last, case when $15='distance' then dist_m end asc nulls last, case when $15='trust' then trust_score end desc nulls last, score desc, quality_score desc nulls last) as ord
  from scored order by case when $15='date_asc' then extract(epoch from start_date) end asc nulls last, case when $15='date_desc' then extract(epoch from start_date) end desc nulls last, case when $15='price_asc' then price_min end asc nulls last, case when $15='price_desc' then coalesce(price_max,price_min) end desc nulls last, case when $15='distance' then dist_m end asc nulls last, case when $15='trust' then trust_score end desc nulls last, score desc, quality_score desc nulls last limit greatest($9,0) offset greatest($10,0))
select jsonb_build_object('total',(select count(*) from cand),'hits',coalesce((
  select jsonb_agg(jsonb_build_object('objectID',t.entity_id,'doc_id',t.doc_id,'type',t.entity_type,'title',sd.title,'description',left(sd.description,300),'category',sd.facets->>'category','city',sd.city,'country',sd.country,'location',nullif(concat_ws(', ',sd.city,sd.country),''),'slug',sd.slug,'imageUrl',sd.image_url,'optimizedUrl',img.optimized_url,'thumbnailUrl',img.thumbnail_url,'featured',sd.is_featured,'is_free',sd.is_free,'price_min',sd.price_min,'price_max',sd.price_max,'start_date',extract(epoch from sd.start_date),'end_date',extract(epoch from sd.end_date),'trust_score',sd.trust_score,'liveness_status',sd.liveness_status,'_geoloc',case when sd.geog is not null then jsonb_build_object('lat',st_y(sd.geog::geometry),'lng',st_x(sd.geog::geometry)) end,'_distance_m',case when t.dist_m is not null then round(t.dist_m)::int end,'_rankingScore',round(t.score::numeric,6),'tags',sd.facets->'tags') order by t.ord)
  from top_hits t join public.search_documents sd on sd.doc_id=t.doc_id
  left join lateral (select ia.optimized_url, ia.thumbnail_url from public.image_asset_links l join public.image_assets ia on ia.id=l.asset_id where l.entity_id=t.entity_id and l.entity_type=t.img_entity_type and ia.status='active' and ia.optimization_status in ('optimized','cdn_optimized') order by (l.role='cover') desc, l.sort_order nulls last limit 1) img on true
), '[]'::jsonb))
$q$
into result
using p_query, p_query_vec, p_content_types, p_filters, p_lat, p_lng, p_radius_km, p_now, p_limit, p_offset, p_date_from, p_date_to, p_price_min, p_price_max, p_sort;
return result;
end
$function$;

-- ---------------------------------------------------------------------------
-- search_facets: same p_filters->>'include_gated' gate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_facets(p_query text DEFAULT ''::text, p_content_types text[] DEFAULT NULL::text[], p_filters jsonb DEFAULT '{}'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_km double precision DEFAULT NULL::double precision, p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
with params as (
  select nullif(btrim(p_query),'') as q,
         case when p_lat is not null and p_lng is not null
              then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as origin
),
match as (
  select sd.doc_id from public.search_documents sd, params p
  where p.q is not null and (sd.search_tsv @@ websearch_to_tsquery('simple', unaccent(p.q)) or sd.title % p.q)
),
cand as (
  select sd.entity_type, sd.city, sd.country, sd.facets,
         sd.price_min, sd.price_max, sd.is_free, sd.start_date
  from public.search_documents sd, params p
  where (p_content_types is null or sd.entity_type = any(p_content_types))
    and (coalesce((p_filters->>'include_gated')::boolean, false) or not sd.safety_gated)
    and (not (p_filters ? 'city')        or lower(sd.city)    = lower(p_filters->>'city'))
    and (not (p_filters ? 'country')     or lower(sd.country) = lower(p_filters->>'country'))
    and (not (p_filters ? 'category')    or lower(sd.facets->>'category') = lower(p_filters->>'category'))
    and (not (p_filters ? 'is_featured') or sd.is_featured = (p_filters->>'is_featured')::boolean)
    and (not (p_filters ? 'is_free')     or sd.is_free     = (p_filters->>'is_free')::boolean)
    and (not (p_filters ? 'target_groups')
         or (jsonb_typeof(sd.facets->'target_groups') = 'array'
             and (sd.facets->'target_groups') ?| array(select jsonb_array_elements_text(p_filters->'target_groups'))))
    and (not (p_filters ? 'tags')
         or (jsonb_typeof(sd.facets->'tags') = 'array'
             and (sd.facets->'tags') ?| array(select jsonb_array_elements_text(p_filters->'tags'))))
    and (p.origin is null or (sd.geog is not null and st_dwithin(sd.geog, p.origin, p_radius_km*1000)))
    and (sd.entity_type <> 'event' or sd.start_date is null or coalesce(sd.end_date, sd.start_date) >= p_now - interval '1 day')
    and (p.q is null or sd.doc_id in (select doc_id from match))
)
select jsonb_strip_nulls(jsonb_build_object(
  'type',     (select jsonb_object_agg(entity_type, c) from (select entity_type, count(*) c from cand group by 1) t),
  'category', (select jsonb_object_agg(k, c) from (select facets->>'category' k, count(*) c from cand where facets ? 'category' group by 1 order by c desc limit 50) t),
  'city',     (select jsonb_object_agg(k, c) from (select city k, count(*) c from cand where city is not null group by 1 order by c desc limit 50) t),
  'country',  (select jsonb_object_agg(k, c) from (select country k, count(*) c from cand where country is not null group by 1 order by c desc limit 50) t),
  'target_groups', (select jsonb_object_agg(k, c) from (
                 select tg as k, count(*) c
                 from cand, lateral jsonb_array_elements_text(
                        case when jsonb_typeof(facets->'target_groups')='array' then facets->'target_groups' else '[]'::jsonb end) tg
                 group by tg order by c desc limit 50) t),
  'tags',     (select jsonb_object_agg(k, c) from (
                 select tg as k, count(*) c
                 from cand, lateral jsonb_array_elements_text(
                        case when jsonb_typeof(facets->'tags')='array' then facets->'tags' else '[]'::jsonb end) tg
                 group by tg order by c desc limit 50) t),
  'price',    (select case when count(price_min) = 0 then null else jsonb_build_object(
                 'min', min(price_min), 'max', max(coalesce(price_max, price_min)),
                 'free_count', count(*) filter (where is_free is true),
                 'bands', jsonb_build_object(
                   '0-10',   count(*) filter (where price_min >= 0   and price_min < 10),
                   '10-25',  count(*) filter (where price_min >= 10  and price_min < 25),
                   '25-50',  count(*) filter (where price_min >= 25  and price_min < 50),
                   '50-100', count(*) filter (where price_min >= 50  and price_min < 100),
                   '100+',   count(*) filter (where price_min >= 100)
                 )) end
               from cand where price_min is not null),
  'date',     (select jsonb_object_agg(m, c) from (
                 select to_char(date_trunc('month', start_date), 'YYYY-MM') m, count(*) c
                 from cand where entity_type = 'event' and start_date is not null and start_date >= p_now
                 group by 1 order by 1 limit 12) t)
))
$function$;

-- ---------------------------------------------------------------------------
-- search_autocomplete: new p_include_gated param (DROP+CREATE to change signature).
-- ---------------------------------------------------------------------------
drop function if exists public.search_autocomplete(text, text[], integer, timestamptz);
CREATE OR REPLACE FUNCTION public.search_autocomplete(p_prefix text, p_content_types text[] DEFAULT NULL::text[], p_limit integer DEFAULT 8, p_now timestamp with time zone DEFAULT now(), p_include_gated boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  with cand as (
    select entity_id, entity_type, title, city, country, slug, image_url,
           (title ilike p_prefix || '%') as is_prefix,
           similarity(title, p_prefix) as sim,
           is_featured as featured
    from public.search_documents
    where (p_content_types is null or entity_type = any(p_content_types))
      and (p_include_gated or not safety_gated)
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
grant execute on function public.search_autocomplete(text, text[], integer, timestamptz, boolean) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_recommendations: new p_include_gated param.
-- ---------------------------------------------------------------------------
-- NOTE: body kept in sync with 20260623102938_discovery_rpcs_optimized_images
-- (optimizedUrl/thumbnailUrl image-asset enrichment) PLUS the safety gate.
drop function if exists public.get_recommendations(vector, text[], text, double precision, double precision, double precision, uuid[], timestamptz, integer);
CREATE OR REPLACE FUNCTION public.get_recommendations(p_bias_vec vector DEFAULT NULL::vector, p_content_types text[] DEFAULT NULL::text[], p_city text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_km double precision DEFAULT NULL::double precision, p_exclude_ids uuid[] DEFAULT NULL::uuid[], p_now timestamptz DEFAULT now(), p_limit integer DEFAULT 20, p_include_gated boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
    and (p_include_gated or not sd.safety_gated)
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
      and l.entity_type = case x.entity_type when 'news' then 'news_article' when 'marketplace' then 'marketplace_listing' else x.entity_type end
      and ia.status = 'active' and ia.optimization_status in ('optimized','cdn_optimized')
    order by (l.role = 'cover') desc, l.sort_order nulls last limit 1
  ) img on true
), '[]'::jsonb);
$function$;
grant execute on function public.get_recommendations(vector, text[], text, double precision, double precision, double precision, uuid[], timestamptz, integer, boolean) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- related_entities: new p_include_gated param.
-- ---------------------------------------------------------------------------
-- NOTE: body kept in sync with 20260623102938_discovery_rpcs_optimized_images
-- (optimizedUrl/thumbnailUrl image-asset enrichment) PLUS the safety gate.
drop function if exists public.related_entities(text, uuid, text[], boolean, integer, timestamptz);
CREATE OR REPLACE FUNCTION public.related_entities(p_entity_type text, p_entity_id uuid, p_content_types text[] DEFAULT NULL::text[], p_same_type_only boolean DEFAULT false, p_limit integer DEFAULT 10, p_now timestamptz DEFAULT now(), p_include_gated boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v extensions.vector(1024);
begin
  select se.embedding into v
    from public.search_embeddings se
    join public.search_documents sd on sd.doc_id=se.doc_id
   where sd.entity_type=p_entity_type and sd.entity_id=p_entity_id;
  if v is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'objectID', nn.entity_id, 'type', nn.entity_type, 'title', nn.title,
        'description', left(nn.description, 200), 'city', nn.city, 'country', nn.country,
        'slug', nn.slug, 'imageUrl', nn.image_url,
        'optimizedUrl', img.optimized_url, 'thumbnailUrl', img.thumbnail_url,
        'category', nn.facets->>'category', 'featured', nn.is_featured, '_score', round(nn.sim::numeric, 4)
      ) order by nn.sim desc)
    from (
      select sd.entity_id, sd.entity_type, sd.title, sd.description, sd.city, sd.country, sd.slug, sd.image_url, sd.facets, sd.is_featured,
             1-(se.embedding <=> v) as sim
      from public.search_documents sd
      join public.search_embeddings se on se.doc_id=sd.doc_id
      where se.embedding is not null
        and not (sd.entity_type=p_entity_type and sd.entity_id=p_entity_id)
        and (p_include_gated or not sd.safety_gated)
        and (p_content_types is null or sd.entity_type=any(p_content_types))
        and (not p_same_type_only or sd.entity_type=p_entity_type)
        and (sd.entity_type<>'event' or sd.start_date is null or coalesce(sd.end_date,sd.start_date)>=p_now-interval '1 day')
        and coalesce(sd.liveness_status,'') not in ('dead','cancelled','dead_link')
        and sd.closed_at is null
      order by se.embedding <=> v
      limit greatest(p_limit,0)
    ) nn
    left join lateral (
      select ia.optimized_url, ia.thumbnail_url
      from public.image_asset_links l
      join public.image_assets ia on ia.id = l.asset_id
      where l.entity_id = nn.entity_id
        and l.entity_type = case nn.entity_type when 'news' then 'news_article' when 'marketplace' then 'marketplace_listing' else nn.entity_type end
        and ia.status = 'active' and ia.optimization_status in ('optimized','cdn_optimized')
      order by (l.role = 'cover') desc, l.sort_order nulls last limit 1
    ) img on true
  ), '[]'::jsonb);
end $function$;
grant execute on function public.related_entities(text, uuid, text[], boolean, integer, timestamptz, boolean) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- events_in_window: public calendar RPC — always excludes gated events.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.events_in_window(p_start timestamp with time zone, p_end timestamp with time zone, p_city text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'objectID', entity_id, 'type', 'event', 'title', title,
    'description', left(description, 200), 'city', city, 'country', country,
    'slug', slug, 'imageUrl', image_url,
    'start_date', extract(epoch from start_date), 'end_date', extract(epoch from end_date),
    'is_free', is_free, 'price_min', price_min, 'price_max', price_max,
    'featured', is_featured,
    '_geoloc', case when geog is not null then jsonb_build_object('lat', st_y(geog::geometry), 'lng', st_x(geog::geometry)) end
  ) order by start_date), '[]'::jsonb)
  from (
    select entity_id, title, description, city, country, slug, image_url,
           start_date, end_date, is_free, price_min, price_max, is_featured, geog
    from public.search_documents
    where entity_type = 'event'
      and not safety_gated
      and start_date is not null
      and start_date <= p_end
      and coalesce(end_date, start_date) >= p_start
      and (p_city    is null or lower(city)    = lower(p_city))
      and (p_country is null or lower(country) = lower(p_country))
      and coalesce(liveness_status,'') not in ('dead','cancelled','dead_link')
    order by start_date
    limit greatest(p_limit, 0)
  ) e;
$function$;

-- ---------------------------------------------------------------------------
-- rpc_venues_ranked: browser path (SECURITY DEFINER, user JWT) — gate via auth.uid().
-- p_user_id is client-supplied and spoofable, so the gate uses auth.uid().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_venues_ranked(p_user_id uuid DEFAULT NULL::uuid, p_lat numeric DEFAULT NULL::numeric, p_lng numeric DEFAULT NULL::numeric, p_filters jsonb DEFAULT '{}'::jsonb, p_sort text DEFAULT 'relevance'::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(venue jsonb, score numeric, distance_m numeric, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_prefs_categories  text[] := COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(discovery_profile -> 'categories'))
       FROM public.profiles WHERE user_id = p_user_id),
    ARRAY[]::text[]);
  v_prefs_tags        text[] := COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(discovery_profile -> 'tags'))
       FROM public.profiles WHERE user_id = p_user_id),
    ARRAY[]::text[]);
  v_prefs_groups      text[] := COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(discovery_profile -> 'target_groups'))
       FROM public.profiles WHERE user_id = p_user_id),
    ARRAY[]::text[]);
  v_behavior_cats     text[] := CASE WHEN p_user_id IS NULL THEN ARRAY[]::text[] ELSE COALESCE(
    (SELECT ARRAY_AGG(category)
       FROM (
         SELECT v.category, COUNT(*) AS n
           FROM public.venue_checkins c JOIN public.venues v ON v.id = c.venue_id
          WHERE c.user_id = p_user_id AND v.category IS NOT NULL
          GROUP BY v.category HAVING COUNT(*) >= 3
       ) t),
    ARRAY[]::text[]) END;

  v_q                 text := NULLIF(p_filters->>'search', '');
  v_category          text := NULLIF(p_filters->>'category', '');
  v_city              text := NULLIF(p_filters->>'city', '');
  v_radius_km         numeric := NULLIF(p_filters->>'radiusKm', '')::numeric;
  v_price             int     := NULLIF(p_filters->>'priceLevel', '')::int;
  v_tags              text[]  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'tags')), ARRAY[]::text[]);
  v_amenities         text[]  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'amenities')), ARRAY[]::text[]);
  v_services          text[]  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'services')), ARRAY[]::text[]);
  v_access            text[]  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'accessibility')), ARRAY[]::text[]);
  v_groups            text[]  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'groups')), ARRAY[]::text[]);

  v_w_distance        numeric := CASE WHEN p_user_id IS NULL THEN 0.55 ELSE 0.35 END;
  v_w_interest        numeric := CASE WHEN p_user_id IS NULL THEN 0.0  ELSE 0.25 END;
  v_w_behavior        numeric := CASE WHEN p_user_id IS NULL THEN 0.0  ELSE 0.15 END;
  v_w_quality         numeric := CASE WHEN p_user_id IS NULL THEN 0.30 ELSE 0.15 END;
  v_w_recency         numeric := 0.10;

  v_show_gated        boolean := (SELECT auth.uid()) IS NOT NULL;

  v_total             bigint;
BEGIN
  -- Cheap filtered count first. No scoring, no distance compute.
  SELECT COUNT(*) INTO v_total
    FROM public.venues v
   WHERE v.data_source IS DISTINCT FROM 'refuge-restrooms'
     AND v.duplicate_of_id IS NULL
     AND v.closed_at IS NULL
     AND (v_show_gated OR v.safety_gated IS NOT TRUE)
     AND (v_q IS NULL OR
          v.name ILIKE '%' || v_q || '%' OR
          COALESCE(v.description, '') ILIKE '%' || v_q || '%' OR
          COALESCE(v.address, '') ILIKE '%' || v_q || '%')
     AND (v_category IS NULL OR v.category = v_category)
     AND (v_city IS NULL OR v.city ILIKE '%' || v_city || '%')
     AND (array_length(v_tags, 1) IS NULL OR v.tags && v_tags)
     AND (array_length(v_amenities, 1) IS NULL OR v.amenities && v_amenities)
     AND (array_length(v_services, 1) IS NULL OR v.services && v_services)
     AND (array_length(v_access, 1) IS NULL OR v.accessibility_attributes && v_access)
     AND (array_length(v_groups, 1) IS NULL OR v.target_groups && v_groups)
     AND (v_price IS NULL OR v.price_range = v_price);

  RETURN QUERY
  WITH base AS (
    SELECT v.*,
           (CASE
             WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
              AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
               6371000 * 2 * ASIN(SQRT(
                 POWER(SIN(RADIANS((v.latitude - p_lat) / 2)), 2) +
                 COS(RADIANS(p_lat)) * COS(RADIANS(v.latitude)) *
                 POWER(SIN(RADIANS((v.longitude - p_lng) / 2)), 2)
               ))
             ELSE NULL
           END)::numeric AS dist_m
      FROM public.venues v
     WHERE v.data_source IS DISTINCT FROM 'refuge-restrooms'
       AND v.duplicate_of_id IS NULL
       AND v.closed_at IS NULL
       AND (v_show_gated OR v.safety_gated IS NOT TRUE)
       AND (v_q IS NULL OR
            v.name ILIKE '%' || v_q || '%' OR
            COALESCE(v.description, '') ILIKE '%' || v_q || '%' OR
            COALESCE(v.address, '') ILIKE '%' || v_q || '%')
       AND (v_category IS NULL OR v.category = v_category)
       AND (v_city IS NULL OR v.city ILIKE '%' || v_city || '%')
       AND (array_length(v_tags, 1) IS NULL OR v.tags && v_tags)
       AND (array_length(v_amenities, 1) IS NULL OR v.amenities && v_amenities)
       AND (array_length(v_services, 1) IS NULL OR v.services && v_services)
       AND (array_length(v_access, 1) IS NULL OR v.accessibility_attributes && v_access)
       AND (array_length(v_groups, 1) IS NULL OR v.target_groups && v_groups)
       AND (v_price IS NULL OR v.price_range = v_price)
  ),
  filtered AS (
    SELECT b.* FROM base b
     WHERE (v_radius_km IS NULL OR b.dist_m IS NULL OR b.dist_m <= v_radius_km * 1000)
  ),
  scored AS (
    SELECT
      f.*,
      (CASE WHEN f.dist_m IS NULL THEN 0.3 ELSE EXP(- POWER(f.dist_m / 30000.0, 2)) END)::numeric AS s_distance,
      LEAST(1.0::numeric,
        (CASE WHEN array_length(v_prefs_categories, 1) > 0 AND f.category = ANY(v_prefs_categories) THEN 0.5 ELSE 0 END)::numeric
      + (CASE WHEN array_length(v_prefs_tags, 1) > 0 AND f.tags && v_prefs_tags THEN 0.3 ELSE 0 END)::numeric
      + (CASE WHEN array_length(v_prefs_groups, 1) > 0 AND f.target_groups && v_prefs_groups THEN 0.2 ELSE 0 END)::numeric
      ) AS s_interest,
      (CASE WHEN array_length(v_behavior_cats, 1) > 0 AND f.category = ANY(v_behavior_cats) THEN 1.0 ELSE 0.0 END)::numeric AS s_behavior,
      LEAST(1.0::numeric,
        (CASE WHEN f.is_featured THEN 0.5 ELSE 0 END)::numeric
      + (CASE WHEN f.verified THEN 0.3 ELSE 0 END)::numeric
      + 0.2::numeric
      ) AS s_quality,
      GREATEST(0.0::numeric, 1.0::numeric - (LN(GREATEST(1, EXTRACT(DAY FROM (now() - f.created_at))::int)) / LN(365))::numeric) AS s_recency
      FROM filtered f
  ),
  ranked AS (
    SELECT
      s.*,
      ( v_w_distance * s.s_distance
      + v_w_interest * s.s_interest
      + v_w_behavior * s.s_behavior
      + v_w_quality  * s.s_quality
      + v_w_recency  * s.s_recency )::numeric AS relevance
      FROM scored s
  )
  SELECT
    to_jsonb(r) - 's_distance' - 's_interest' - 's_behavior'
                - 's_quality' - 's_recency' - 'relevance' - 'dist_m' AS venue,
    r.relevance,
    r.dist_m,
    v_total AS total
    FROM ranked r
   ORDER BY
     CASE WHEN p_sort = 'name'       THEN r.name      END ASC NULLS LAST,
     CASE WHEN p_sort = 'category'   THEN r.category  END ASC NULLS LAST,
     CASE WHEN p_sort = 'city'       THEN r.city      END ASC NULLS LAST,
     CASE WHEN p_sort = 'created_at' THEN r.created_at END DESC NULLS LAST,
     CASE WHEN p_sort = 'featured'   THEN r.is_featured::int END DESC,
     CASE WHEN p_sort = 'nearest'    THEN r.dist_m    END ASC NULLS LAST,
     CASE WHEN p_sort = 'relevance'  THEN r.relevance END DESC NULLS LAST,
     r.relevance DESC NULLS LAST,
     r.id ASC
   LIMIT p_limit OFFSET p_offset;
END
$function$;

-- ---------------------------------------------------------------------------
-- get_trending_entities: engagement-ranked discovery feed — always excludes
-- gated venues/events (consistent with v_popular_entities). Body kept in sync
-- with 20260623102938_discovery_rpcs_optimized_images (optimized_url/
-- thumbnail_url columns + image-asset lateral) PLUS the safety gate. The return
-- type gained two columns there, so DROP first.
-- ---------------------------------------------------------------------------
drop function if exists public.get_trending_entities(text[], text, integer);
CREATE FUNCTION public.get_trending_entities(p_types text[] DEFAULT ARRAY['venue'::text, 'event'::text], p_city text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS TABLE(entity_type text, entity_id text, score real, title text, city text, country text, slug text, image_url text, optimized_url text, thumbnail_url text, start_date timestamptz, end_date timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
  WITH w AS (
    SELECT entity_type, entity_id,
      sum(CASE event_type WHEN 'click' THEN 1 WHEN 'view' THEN 0.3 WHEN 'save' THEN 3 WHEN 'favorite' THEN 3 WHEN 'book' THEN 5 WHEN 'attend' THEN 5 ELSE 0 END * exp(-EXTRACT(EPOCH FROM (now() - created_at)) / (3.0 * 86400.0)))::real AS score
    FROM user_events
    WHERE created_at > now() - interval '7 days' AND entity_type = ANY(p_types)
    GROUP BY entity_type, entity_id
  )
  SELECT w.entity_type, w.entity_id, w.score,
    COALESCE(v.name, e.title, c.name, p.name) AS title,
    COALESCE(v.city, e.city, c.name) AS city,
    COALESCE(v.country, e.country, co.name) AS country,
    COALESCE(v.slug, e.slug, c.slug, p.slug) AS slug,
    COALESCE(v.images[1], v.logo_url, e.images[1], e.logo_url, c.curated_image_url, c.image_url, co.curated_image_url, co.image_url, p.image_url) AS image_url,
    img.optimized_url, img.thumbnail_url,
    e.start_date, e.end_date
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
      and l.entity_type = case w.entity_type when 'news' then 'news_article' when 'marketplace' then 'marketplace_listing' else w.entity_type end
      and ia.status = 'active' and ia.optimization_status in ('optimized','cdn_optimized')
    order by (l.role = 'cover') desc, l.sort_order nulls last limit 1
  ) img ON true
  WHERE (p_city IS NULL OR lower(COALESCE(v.city, e.city, c.name)) = lower(p_city))
    AND COALESCE(v.safety_gated, false) = false
    AND COALESCE(e.safety_gated, false) = false
    AND (w.entity_type <> 'event' OR e.end_date IS NULL AND e.start_date >= now() - interval '12 hours' OR e.end_date >= now())
  ORDER BY w.score DESC
  LIMIT p_limit;
$function$;
grant execute on function public.get_trending_entities(text[], text, integer) to anon, authenticated, service_role;
