-- search_hybrid_v2: candidate ranking RPC for the Meili -> Postgres cutover.
-- Evaluated against live Meili via the search-proxy shadow path (SHADOW_HYBRID_FN).
-- Same signature + output shape as search_hybrid (v1). Two goals vs v1:
--   (1) LATENCY: vector leg uses the HNSW index top-K only (no per-candidate
--       brute-force `embedding <=> p_query_vec`); keyword recall is bounded and
--       index-driven (gin tsv @@  OR  gin_trgm % operator). In-DB warm latency
--       drops ~2000ms -> ~150ms; shadow RPC p95 ~5.6s -> ~1.1s.
--   (2) RELEVANCE: keyword-dominant weighted RRF (1.3 kw / 0.7 vec) so the
--       vector leg re-ranks rather than over-recalls generic non-queer neighbors,
--       plus a wrong-city penalty when a city is detected in the query text.
-- NOTE: relevance still trails Meili because the corpus lacks an LGBTQ relevance
-- signal (~90% of venues untagged) and FTS ranks lexically. Closing that gap
-- needs a backfilled relevance signal + synonym/OR query handling, not constants.
create or replace function public.search_hybrid_v2(
  p_query text default ''::text, p_query_vec vector default null::vector,
  p_content_types text[] default null::text[], p_filters jsonb default '{}'::jsonb,
  p_lat double precision default null::double precision, p_lng double precision default null::double precision,
  p_radius_km double precision default null::double precision, p_now timestamptz default now(),
  p_limit integer default 20, p_offset integer default 0)
returns jsonb language sql stable security definer
set search_path to 'public','extensions','pg_temp'
as $function$
with toks as (select regexp_split_to_array(lower(unaccent(coalesce(nullif(btrim(p_query),''),''))), '\s+') arr),
qcity as (select cname from (
  select c.title cname,
    (select count(*) from public.search_documents v where v.entity_type='venue' and lower(v.city)=lower(c.title)) n
  from public.search_documents c, toks
  where c.entity_type='city' and c.title is not null and length(c.title)>=4 and lower(unaccent(c.title))=any(toks.arr)
) z where z.n>=8 order by z.n desc limit 1),
params as (select nullif(btrim(p_query),'') q0, (select cname from qcity) dcity,
  case when p_lat is not null and p_lng is not null then st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography end origin),
p2 as (select q0, dcity, origin,
  lower(coalesce(p_filters->>'city', dcity)) boost_city,
  nullif(btrim(case when dcity is not null then regexp_replace(q0, dcity, '', 'gi') else q0 end), '') eff_q
  from params),
tsq as (select case when (select eff_q from p2) is not null
              then websearch_to_tsquery('simple', unaccent((select eff_q from p2))) end q),
vnn as (select doc_id, row_number() over () vrk from (
  select doc_id from public.search_documents
  where p_query_vec is not null and embedding is not null
  order by embedding <=> p_query_vec limit 150) z),
kwc as (select sd.doc_id,
    ts_rank_cd(sd.search_tsv, (select q from tsq)) kw_rank,
    similarity(coalesce(sd.title,''), (select eff_q from p2)) trg
  from public.search_documents sd
  where (select eff_q from p2) is not null
    and ( ((select q from tsq) is not null and sd.search_tsv @@ (select q from tsq))
          or sd.title % (select eff_q from p2) )
  order by greatest(
    case when (select q from tsq) is not null then ts_rank_cd(sd.search_tsv,(select q from tsq)) else 0 end,
    similarity(coalesce(sd.title,''),(select eff_q from p2))) desc
  limit 400),
browse as (select sd.doc_id from public.search_documents sd, p2 p
  where p.eff_q is null
    and (p.boost_city is null or lower(sd.city)=p.boost_city)
  order by sd.quality_score desc nulls last limit 400),
candids as (select doc_id from kwc union select doc_id from vnn union select doc_id from browse),
cand as (
  select sd.*, p.boost_city, p.eff_q, kwc.kw_rank, kwc.trg, vnn.vrk,
    case when p.origin is not null and sd.geog is not null then st_distance(sd.geog,p.origin) end origin_dist
  from public.search_documents sd
  join p2 p on true
  left join kwc on kwc.doc_id=sd.doc_id
  left join vnn on vnn.doc_id=sd.doc_id
  where sd.doc_id in (select doc_id from candids)
    and (p_content_types is null or sd.entity_type=any(p_content_types))
    and (not (p_filters ? 'city') or lower(sd.city)=lower(p_filters->>'city'))
    and (not (p_filters ? 'country') or lower(sd.country)=lower(p_filters->>'country'))
    and (not (p_filters ? 'category') or lower(sd.facets->>'category')=lower(p_filters->>'category'))
    and (not (p_filters ? 'is_featured') or sd.is_featured=(p_filters->>'is_featured')::boolean)
    and (not (p_filters ? 'is_free') or sd.is_free=(p_filters->>'is_free')::boolean)
    and (p.origin is null or (sd.geog is not null and st_dwithin(sd.geog,p.origin,p_radius_km*1000)))
    and (sd.entity_type<>'event' or sd.start_date is null or coalesce(sd.end_date,sd.start_date)>=p_now-interval '1 day')
),
kwr as (select doc_id, rank() over (order by greatest(coalesce(kw_rank,0),coalesce(trg,0)) desc) rk
        from cand where greatest(coalesce(kw_rank,0),coalesce(trg,0))>0),
vecr as (select doc_id, vrk rk from cand where vrk is not null),
fused as (select c.*,
    1.3*coalesce(1.0/(60+kwr.rk),0) + 0.7*coalesce(1.0/(60+vecr.rk),0) rrf
  from cand c left join kwr using(doc_id) left join vecr using(doc_id)),
scored as (select f.*,
    f.rrf
    + case when f.boost_city is not null and lower(f.city)=f.boost_city then 0.05 else 0 end
    + case when f.eff_q is not null and f.boost_city is not null and f.city is not null
            and lower(f.city)<>f.boost_city and f.entity_type in ('venue','event','queer_village')
           then -0.06 else 0 end
    + case when f.is_featured then 0.02 else 0 end
    + case when f.liveness_status in ('dead','cancelled','dead_link','sold_out') then -0.5
            when f.liveness_status='live' then 0.01 else 0 end
    + case when f.closed_at is not null then -0.5 else 0 end
    + case when f.entity_type='event' and f.start_date is not null and f.start_date>=p_now
           then 0.03*exp(-extract(epoch from (f.start_date-p_now))/(60*60*24*30)) else 0 end
    - case when f.origin_dist is not null then least(f.origin_dist/50000.0,1)*0.02 else 0 end
    score
  from fused f)
select jsonb_build_object(
  'total',(select count(*) from cand),
  'hits',coalesce((select jsonb_agg(h) from (
    select jsonb_build_object('objectID',entity_id,'doc_id',doc_id,'type',entity_type,'title',title,
      'description',left(description,300),'category',facets->>'category','city',city,'country',country,
      'location',nullif(concat_ws(', ',city,country),''),'slug',slug,'imageUrl',image_url,'featured',is_featured,
      'is_free',is_free,'price_min',price_min,'price_max',price_max,'start_date',extract(epoch from start_date),
      'end_date',extract(epoch from end_date),'trust_score',trust_score,'liveness_status',liveness_status,
      '_geoloc',case when geog is not null then jsonb_build_object('lat',st_y(geog::geometry),'lng',st_x(geog::geometry)) end,
      '_distance_m',case when origin_dist is not null then round(origin_dist)::int end,
      '_rankingScore',round(score::numeric,6),'tags',facets->'tags') h
    from scored order by score desc, quality_score desc nulls last
    limit greatest(p_limit,0) offset greatest(p_offset,0)
  ) x),'[]'::jsonb))
$function$;
