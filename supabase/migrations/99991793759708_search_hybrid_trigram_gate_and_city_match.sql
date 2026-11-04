-- search_hybrid: make the keyword arm cheap enough to stay under the Worker's
-- 4s RPC timeout, and rank a city/country page first for a bare place query.
--
-- MEASURED (prod, 2026-11-04). /search returned unrelated rows ("Pllek,
-- Amsterdam", "Maxway Coffee, Berlin" for `sauna` and `new york`, every one at
-- _rankingScore 0.1) whenever search_hybrid exceeded the Worker's 4s timeout:
-- that is the v_popular_entities fallback, not a ranking result.
-- pg_stat_statements: mean 760 ms, max 7.4 s. EXPLAIN ANALYZE of `sauna` with a
-- vector, 5.87 s:
--   * kwonly 4.16 s — `title % q` (pg_trgm, threshold 0.3) admitted 13,957
--     bitmap candidates for a 5-letter word; heap recheck kept 859. FTS alone
--     found 2,581. Only 42 rows were trigram-only, and for `chemsex` the
--     trigram-only rows are exactly the junk users saw ("Cheap Sex", "Cheb",
--     "Cher") beside 36 real FTS hits.
--   * qcity 0.50 s — every one of 17.5k city docs unaccented and LIKE-tested
--     against the query.
--   * cand 0.67 s — seq scan of all 144k docs with a 4-way OR join filter
--     instead of a PK lookup of the ~2-3k keyword/vector candidates.
--
-- CHANGES
--   1. Trigram admission only when FTS finds < 20 docs (typo tolerance is what
--      it is for: `heldnbar` FTS 0 -> trigram finds Heldenbar, unchanged).
--      kw_hit now means "admitted by the keyword arm", so a vector-only row no
--      longer collects the keyword bonus through a 0.3 trigram resemblance.
--   2. City detection matches query n-grams (1..6 tokens) against an
--      expression index instead of scanning every city. Same semantics as the
--      old whole-word LIKE: a city title must equal a contiguous token window.
--   3. Keyword/vector candidates are fetched by doc_id; the browse branches
--      (no residual query) keep their table scan in a separate UNION ALL arm.
--   4. A bare place query (`berlin`, `new york`) had eff_q NULL, so exact_title
--      was 0 for the city page itself and recurring events outranked it.
--      exact_title now compares against the residual query OR the original
--      one; +0.01 for facets.is_major_city breaks the Berlin DE / Berlin US tie.
--
-- Old vs new on prod, same vector, 14 queries: top-1 identical on all 13
-- non-place queries; cold `sauna` 3,069 -> 1,003 ms, `new york` 2,877 -> 853,
-- `harvey milk` 1,482 -> 429, `heldnbar` 722 -> 242.

create index if not exists search_documents_city_title_unaccent
  on public.search_documents (lower(public.immutable_unaccent(title)))
  where entity_type = 'city';

CREATE OR REPLACE FUNCTION api_private.search_hybrid(p_query text DEFAULT ''::text, p_query_vec vector DEFAULT NULL::vector, p_content_types text[] DEFAULT NULL::text[], p_filters jsonb DEFAULT '{}'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_km double precision DEFAULT NULL::double precision, p_now timestamp with time zone DEFAULT now(), p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_sort text DEFAULT NULL::text)
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
qng as (select coalesce(array_agg(array_to_string(toks.arr[i:j],chr(32))),'{}'::text[]) ng from toks, generate_series(1,coalesce(array_length(toks.arr,1),0)) i, generate_series(i, least(i+5, array_length(toks.arr,1))) j),
qcity as (select cname from (select c.title cname,(select count(*) from public.search_documents v where v.entity_type='venue' and lower(v.city)=lower(c.title)) n from public.search_documents c, qng where c.entity_type='city' and c.title is not null and length(c.title)>=4 and lower(public.immutable_unaccent(c.title)) = any(qng.ng)) z where z.n>=10 order by length(z.cname) desc, z.n desc limit 1),
params as materialized (select nullif(btrim($1),'') q0, (select cname from qcity) dcity, case when $5 is not null and $6 is not null then st_setsrid(st_makepoint($6,$5),4326)::geography end origin),
p2 as materialized (select q0,dcity,origin, lower(coalesce($4->>'city',dcity)) boost_city, nullif(btrim(case when dcity is not null then regexp_replace(q0,dcity,'','gi') else q0 end),'') eff_q from params),
vnn as (select se.doc_id, (se.embedding <=> $2) as vdist from public.search_embeddings se where $2 is not null and se.embedding is not null order by se.embedding <=> $2 limit 200),
ftsonly as materialized (select sd.doc_id from public.search_documents sd, p2 p where p.eff_q is not null and sd.search_tsv @@ websearch_to_tsquery('simple',unaccent(p.eff_q))),
kwonly as materialized (select doc_id from ftsonly union select sd.doc_id from public.search_documents sd, p2 p where p.eff_q is not null and (select count(*) from (select 1 from ftsonly limit 20) z) < 20 and sd.title % p.eff_q),
kwvec as materialized (select doc_id from kwonly union select doc_id from vnn where exists (select 1 from kwonly)),
base as (select sd.* from public.search_documents sd where (select eff_q from p2) is not null and sd.doc_id in (select doc_id from kwvec)
  union all
  select sd.* from public.search_documents sd cross join p2 p where p.eff_q is null and ((p.boost_city is null) or (p.boost_city is not null and lower(sd.city)=p.boost_city) or (p.dcity is not null and sd.city is null and sd.search_tsv @@ websearch_to_tsquery('simple',unaccent(p.q0))))),
cand as (select sd.doc_id, sd.entity_id, sd.entity_type, sd.city, sd.is_featured, sd.quality_score, sd.lgbtq_score, sd.liveness_status, sd.closed_at, sd.start_date, sd.price_min, sd.price_max, sd.trust_score, p.boost_city,
    case when p.eff_q is not null then ts_rank_cd(sd.search_tsv, websearch_to_tsquery('simple',unaccent(p.eff_q))) else 0 end kw_rank,
    case when p.eff_q is not null then similarity(coalesce(sd.title,''),p.eff_q) else 0 end trg,
    case when coalesce(p.eff_q,p.q0) is not null and lower(unaccent(coalesce(sd.title,'')))=lower(unaccent(coalesce(p.eff_q,p.q0))) then 1 else 0 end exact_title,
    coalesce((sd.facets->>'is_major_city')::boolean,false) is_major,
    case when sd.doc_id in (select doc_id from kwonly) then 1 else 0 end kw_hit,
    case when $2 is not null and vnn.vdist is not null then 1-vnn.vdist else null end vec_sim,
    case when p.origin is not null and sd.geog is not null then st_distance(sd.geog,p.origin) else null end dist_m
  from base sd cross join p2 p left join vnn on vnn.doc_id=sd.doc_id
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
    and (p.origin is null or $7 is null or (sd.geog is not null and st_dwithin(sd.geog,p.origin,$7*1000)))
    and (sd.entity_type<>'event' or sd.start_date is null or coalesce(sd.end_date,sd.start_date)>=$8-interval '1 day')),
kw as (select doc_id, rank() over (order by greatest(kw_rank,trg) desc) rk from cand where kw_hit=1),
vec as (select doc_id, rank() over (order by vec_sim desc) rk from cand where vec_sim is not null),
fused as (select c.*, coalesce(1.0/(60+kw.rk),0)+coalesce(1.0/(60+vec.rk),0) rrf from cand c left join kw using(doc_id) left join vec using(doc_id)),
scored as (select f.*, f.rrf + 0.08 * f.exact_title * (case when f.boost_city is null or lower(f.city)=f.boost_city then 1 else 0 end) + 0.03 * f.kw_hit + 0.06 * case when f.entity_type='venue' then coalesce(f.lgbtq_score, 0.5) else 1.0 end + case f.entity_type when 'venue' then 0.015 when 'queer_village' then 0.012 when 'event' then 0.010 when 'personality' then 0.010 when 'city' then 0.006 when 'country' then 0.004 when 'marketplace' then 0.004 when 'news' then -0.010 when 'tag' then -0.006 else 0 end + case when f.boost_city is not null and lower(f.city)=f.boost_city then 0.05 else 0 end + case when f.is_featured then 0.02 else 0 end + case when f.exact_title=1 and f.is_major then 0.01 else 0 end + case when f.liveness_status in ('dead','cancelled','dead_link','sold_out') then -0.5 when f.liveness_status='live' then 0.01 else 0 end + case when f.closed_at is not null then -0.5 else 0 end + case when f.entity_type='event' and f.start_date is not null and f.start_date>=$8 then 0.03*exp(-extract(epoch from (f.start_date-$8))/(60*60*24*30)) else 0 end + case when f.entity_type='news' and f.start_date is not null then 0.01*exp(-greatest(extract(epoch from ($8-f.start_date)),0)/(60*60*24*365)) else 0 end - case when f.dist_m is not null then least(f.dist_m/50000.0,1)*0.02 else 0 end as score from fused f),
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

-- search_facets runs in parallel with search_hybrid and the Worker awaits both,
-- so it carries the same trigram admission gate (and stays count-consistent
-- with the hits it describes).
CREATE OR REPLACE FUNCTION api_private.search_facets(p_query text DEFAULT ''::text, p_content_types text[] DEFAULT NULL::text[], p_filters jsonb DEFAULT '{}'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_km double precision DEFAULT NULL::double precision, p_now timestamp with time zone DEFAULT now(), p_query_vec vector DEFAULT NULL::vector)
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
vnn as (
  select se.doc_id from public.search_embeddings se
  where p_query_vec is not null and se.embedding is not null
  order by se.embedding <=> p_query_vec limit 200
),
fts as materialized (
  select sd.doc_id from public.search_documents sd, params p
  where p.q is not null and sd.search_tsv @@ websearch_to_tsquery('simple', unaccent(p.q))
),
match as (
  select doc_id from fts
  union
  select sd.doc_id from public.search_documents sd, params p
  where p.q is not null and (select count(*) from (select 1 from fts limit 20) z) < 20 and sd.title % p.q
  union
  select doc_id from vnn
),
cand as (
  select sd.entity_type, sd.city, sd.country, sd.facets,
         sd.price_min, sd.price_max, sd.is_free, sd.start_date
  from public.search_documents sd, params p
  where (p_content_types is null or sd.entity_type = any(p_content_types))
    and sd.closed_at is null
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

-- Postconditions: behaviour, not source text.
do $verify$
declare r jsonb;
begin
  -- Typo tolerance survives the trigram gate: FTS matches nothing for
  -- 'berlinn', so the trigram arm must run and find Berlin.
  r := api_private.search_hybrid('berlinn', null, null, '{}'::jsonb);
  if not exists (select 1 from jsonb_array_elements(r->'hits') h where h->>'title' = 'Berlin') then
    raise exception 'search_hybrid: typo query berlinn did not reach Berlin — trigram fallback broken';
  end if;
  -- Guards a vacuous keyword arm.
  r := api_private.search_hybrid('pride', null, null, '{}'::jsonb);
  if coalesce((r->>'total')::int, 0) < 100 then
    raise exception 'search_hybrid: pride returned % rows, expected thousands', r->>'total';
  end if;
  -- A bare major-city query surfaces that city's own page near the top
  -- (top 5, not top 1, so a venue literally named "Berlin" cannot abort db push).
  r := api_private.search_hybrid('berlin', null, null, '{}'::jsonb, p_limit => 5);
  if not exists (select 1 from jsonb_array_elements(r->'hits') h where h->>'title' = 'Berlin' and h->>'type' = 'city') then
    raise exception 'search_hybrid: the Berlin city page is not in the top 5 for berlin';
  end if;
  r := api_private.search_facets('pride');
  if r->'type' is null then
    raise exception 'search_facets: no type facet for pride';
  end if;
end
$verify$;
