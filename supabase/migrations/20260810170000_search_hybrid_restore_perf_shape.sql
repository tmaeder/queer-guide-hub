-- Restore the search_hybrid performance shape that 20260713100710 silently reverted.
--
-- 20260621120000 fixed three things; 20260713100710 added the exact-title boost by
-- starting from a PRE-06-21 `LANGUAGE sql` body and CREATE OR REPLACE-ing over it,
-- which dropped all three at once. That migration's own header said: "If ever
-- redefined, KEEP the plpgsql/dynamic-EXECUTE shape and the SET clause."
--
-- What came back (measured on prod 2026-08-03, before this migration):
--   1. Per-candidate embedding refetch. The reverted body had
--        left join lateral (select se.embedding from search_embeddings se
--                           where $2 is not null and se.doc_id=sd.doc_id) emb
--      i.e. one lookup into the ~300MB embeddings table PER CANDIDATE. Cost scales
--      with the candidate count, so selective queries looked fine and broad ones died:
--        berghain (55 cands)  217ms      gay bars in lisbon (184)  ok
--        queer bar berlin (1797) >8s     pride (8442)  34,913ms
--      vnn (HNSW top-200) carries vdist again; vec_sim = 1-vnn.vdist via LEFT JOIN.
--   2. Wide `cand` projection (title/description/facets/... hydrated for every
--      candidate instead of the final page only).
--   3. LANGUAGE sql instead of plpgsql + dynamic EXECUTE + force_custom_plan.
--
-- User-visible effect: PostgREST runs as authenticator with statement_timeout=8s, so
-- broad queries aborted; workers/search-proxy swallowed the RPC error and served
-- `_source:"popular"` filler with totalHits:0 — "queer bar berlin" returned London and
-- Madrid bars. service_role has NO timeout, which is why the same call looked healthy
-- when run directly in SQL. Broken since 2026-07-13; masked by the Cloudflare outage.
--
-- This body = the 20260623160001 plpgsql body (all three fixes + safety gating) with
-- ONLY the exact-title delta from 20260713100710 re-applied:
--   cand:   + case when ... lower(unaccent(title))=lower(unaccent(eff_q)) ... end exact_title
--   scored: + 0.08 * f.exact_title
-- The `toks` split stays single-escaped '\s+' (a doubled '\\s+' silently kills the
-- query-is-a-city-name boost -- see 20260621120000).
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
    case when p.eff_q is not null and lower(unaccent(coalesce(sd.title,'')))=lower(unaccent(p.eff_q)) then 1 else 0 end exact_title,
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
scored as (select f.*, f.rrf + 0.08 * f.exact_title + 0.06 * case when f.entity_type='venue' then coalesce(f.lgbtq_score, 0.5) else 1.0 end + case f.entity_type when 'venue' then 0.015 when 'queer_village' then 0.012 when 'event' then 0.010 when 'personality' then 0.010 when 'city' then 0.006 when 'country' then 0.004 when 'marketplace' then 0.004 when 'news' then -0.010 when 'tag' then -0.006 else 0 end + case when f.boost_city is not null and lower(f.city)=f.boost_city then 0.05 else 0 end + case when f.is_featured then 0.02 else 0 end + case when f.liveness_status in ('dead','cancelled','dead_link','sold_out') then -0.5 when f.liveness_status='live' then 0.01 else 0 end + case when f.closed_at is not null then -0.5 else 0 end + case when f.entity_type='event' and f.start_date is not null and f.start_date>=$8 then 0.03*exp(-extract(epoch from (f.start_date-$8))/(60*60*24*30)) else 0 end - case when f.dist_m is not null then least(f.dist_m/50000.0,1)*0.02 else 0 end as score from fused f),
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
