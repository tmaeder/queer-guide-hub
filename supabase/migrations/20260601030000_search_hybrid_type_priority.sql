-- search_hybrid: small type-priority nudge so content (venues/events/people)
-- outranks news/tags at similar relevance in UNIVERSAL search.
--
-- Found via PG-vs-Meili head-to-head (shadow): for place/event-intent queries
-- like "gay hotel mykonos", news articles whose text matches the query tokens
-- ("gay hotel") outranked the actual venues (which match only via geo/vector),
-- so PG returned 1 venue + 3 news while Meili returned venues. Meili implicitly
-- ranks content above news/tags; this matches that.
--
-- The weights are small (≈ one RRF leg, 0.016) so they only break ties / lift
-- weak-keyword content above text-heavy news — a strong keyword match still
-- wins. Content-type-scoped queries (assistant uses p_content_types=['venue'],
-- dedicated news search uses ['news']) are unaffected: the weight is uniform
-- within a single type. Validated: "gay hotel mykonos" venue+3news -> 5 venues;
-- "drag show" still events; "harvey milk" still the person #1; known-item
-- Recall@10 0.825 (healthy); berghain/harvey rank 1; bare-city (sitges) intact.

create or replace function public.search_hybrid(p_query text default ''::text, p_query_vec vector default null::vector, p_content_types text[] default null::text[], p_filters jsonb default '{}'::jsonb, p_lat double precision default null::double precision, p_lng double precision default null::double precision, p_radius_km double precision default null::double precision, p_now timestamp with time zone default now(), p_limit integer default 20, p_offset integer default 0)
returns jsonb language sql stable security definer set search_path to 'public','extensions','pg_temp' as $function$
with toks as (select regexp_split_to_array(lower(unaccent(coalesce(nullif(btrim(p_query),''),''))), '\s+') as arr),
qcity as (select cname from (select c.title cname,(select count(*) from public.search_documents v where v.entity_type='venue' and lower(v.city)=lower(c.title)) n from public.search_documents c, toks where c.entity_type='city' and c.title is not null and length(c.title)>=4 and lower(unaccent(c.title))=any(toks.arr)) z where z.n>=10 order by z.n desc limit 1),
params as (select nullif(btrim(p_query),'') q0, (select cname from qcity) dcity, case when p_lat is not null and p_lng is not null then st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography end origin),
p2 as (select q0,dcity,origin, lower(coalesce(p_filters->>'city',dcity)) boost_city, nullif(btrim(case when dcity is not null then regexp_replace(q0,dcity,'','gi') else q0 end),'') eff_q from params),
vnn as (select doc_id from public.search_documents where p_query_vec is not null and embedding is not null order by embedding <=> p_query_vec limit 200),
cand as (
  select sd.*, p.boost_city,
    case when p.eff_q is not null then ts_rank_cd(sd.search_tsv, websearch_to_tsquery('simple',unaccent(p.eff_q))) else 0 end kw_rank,
    case when p.eff_q is not null then similarity(coalesce(sd.title,''),p.eff_q) else 0 end trg,
    case when p_query_vec is not null and sd.embedding is not null then 1-(sd.embedding <=> p_query_vec) else null end vec_sim,
    case when p.origin is not null and sd.geog is not null then st_distance(sd.geog,p.origin) else null end dist_m
  from public.search_documents sd, p2 p
  where (p_content_types is null or sd.entity_type=any(p_content_types))
    and (not (p_filters ? 'city') or lower(sd.city)=lower(p_filters->>'city'))
    and (not (p_filters ? 'country') or lower(sd.country)=lower(p_filters->>'country'))
    and (not (p_filters ? 'category') or lower(sd.facets->>'category')=lower(p_filters->>'category'))
    and (not (p_filters ? 'is_featured') or sd.is_featured=(p_filters->>'is_featured')::boolean)
    and (not (p_filters ? 'is_free') or sd.is_free=(p_filters->>'is_free')::boolean)
    and (p.origin is null or (sd.geog is not null and st_dwithin(sd.geog,p.origin,p_radius_km*1000)))
    and (sd.entity_type<>'event' or sd.start_date is null or coalesce(sd.end_date,sd.start_date)>=p_now-interval '1 day')
    and (
      (p.eff_q is null and p.boost_city is null)
      or (p.eff_q is null and p.boost_city is not null and lower(sd.city)=p.boost_city)
      or (p.eff_q is not null and (sd.search_tsv @@ websearch_to_tsquery('simple',unaccent(p.eff_q)) or similarity(coalesce(sd.title,''),p.eff_q)>0.2 or sd.doc_id in (select doc_id from vnn)))
    )
),
kw as (select doc_id, rank() over (order by greatest(kw_rank,trg) desc) rk from cand where greatest(kw_rank,trg)>0),
vec as (select doc_id, rank() over (order by vec_sim desc) rk from cand where vec_sim is not null),
fused as (select c.*, coalesce(1.0/(60+kw.rk),0)+coalesce(1.0/(60+vec.rk),0) rrf from cand c left join kw using(doc_id) left join vec using(doc_id)),
scored as (select f.*, f.rrf
   + case f.entity_type when 'venue' then 0.015 when 'queer_village' then 0.012 when 'event' then 0.010 when 'personality' then 0.010 when 'city' then 0.006 when 'country' then 0.004 when 'marketplace' then 0.004 when 'news' then -0.010 when 'tag' then -0.006 else 0 end
   + case when f.boost_city is not null and lower(f.city)=f.boost_city then 0.05 else 0 end
   + case when f.is_featured then 0.02 else 0 end
   + case when f.liveness_status in ('dead','cancelled','dead_link','sold_out') then -0.5 when f.liveness_status='live' then 0.01 else 0 end
   + case when f.closed_at is not null then -0.5 else 0 end
   + case when f.entity_type='event' and f.start_date is not null and f.start_date>=p_now then 0.03*exp(-extract(epoch from (f.start_date-p_now))/(60*60*24*30)) else 0 end
   - case when f.dist_m is not null then least(f.dist_m/50000.0,1)*0.02 else 0 end as score from fused f)
select jsonb_build_object('total',(select count(*) from cand),'hits',coalesce((select jsonb_agg(h) from (
  select jsonb_build_object('objectID',entity_id,'doc_id',doc_id,'type',entity_type,'title',title,'description',left(description,300),'category',facets->>'category','city',city,'country',country,'location',nullif(concat_ws(', ',city,country),''),'slug',slug,'imageUrl',image_url,'featured',is_featured,'is_free',is_free,'price_min',price_min,'price_max',price_max,'start_date',extract(epoch from start_date),'end_date',extract(epoch from end_date),'trust_score',trust_score,'liveness_status',liveness_status,'_geoloc',case when geog is not null then jsonb_build_object('lat',st_y(geog::geometry),'lng',st_x(geog::geometry)) end,'_distance_m',case when dist_m is not null then round(dist_m)::int end,'_rankingScore',round(score::numeric,6),'tags',facets->'tags') h
  from scored order by score desc, quality_score desc nulls last limit greatest(p_limit,0) offset greatest(p_offset,0)
) x),'[]'::jsonb))
$function$;

drop function if exists public.search_hybrid_tw(text, vector, text[], jsonb, double precision, double precision, double precision, timestamptz, integer, integer);
