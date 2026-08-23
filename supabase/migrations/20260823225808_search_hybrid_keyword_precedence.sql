-- search_hybrid: a lexical match must not be displaced by semantic proximity alone.
--
-- REPRODUCTION (prod, 2026-08-23)
--   POST https://search.queer.guide/search {"query":"fentanyl test strips"}
--     -> 66 hits, the first 20 all "String Tank"/"Stripe" apparel from one merchant,
--        ZERO of the 6 DanceSafe fentanyl-test-strip listings that match exactly.
--   select search_hybrid('fentanyl test strips', null, ...)   -- vector arm OFF
--     -> ranks 1-6 ARE the DanceSafe listings.
--   So the keyword leg was never weak; the vector leg inverted the result set.
--
-- MEASURED CAUSE
--   | title                                      | tsv   | trgm  | similarity |
--   | Madrid Stripes String Tank- Red            | false | false | 0.171      |
--   | DanceSafe Fentanyl Test Strips – Box of 500| true  | true  | 0.500      |
--   The winning rows are not keyword candidates at all. `kwvec` admits
--   `keyword-predicate matches UNION vnn` (top-200 by embedding distance), so the
--   apparel can only have entered through `vnn` — bge-m3 places "fentanyl test
--   strips" near "String Tank"/"Stripes" titles. Two independent defects then let
--   those rows win, and BOTH are ordering defects, not admission defects:
--
--   1. The keyword leg scored rows that never matched a keyword.
--      `kw as (... from cand where greatest(kw_rank,trg) > 0)`. `trg` is raw
--      `similarity()`, which is > 0 for almost any pair of non-trivial strings —
--      0.171 for the apparel here — while ADMISSION uses `title % q`, i.e.
--      similarity ABOVE pg_trgm.similarity_threshold. So every vector-only row
--      also collected a keyword rank, both taking RRF mass of its own and pushing
--      the genuine keyword matches down the keyword ranking that is supposed to
--      be theirs alone.
--
--   2. A vector-only row could out-score a lexical match outright.
--      RRF gives each leg up to 1/(60+1) = 0.01639. A row present in BOTH legs
--      therefore beats a row present in one, regardless of how exact the one is —
--      an exact-title keyword match outside the vnn top-200 gets 0.01639 total,
--      a semantically-adjacent tank top in both gets up to 0.0328.
--
-- THE FIX (both deltas are ORDERING-ONLY — `cand` is untouched, so the result set
-- and `total` are byte-identical to before; only the sequence changes)
--   a. `kw_hit`: the row satisfies the same keyword predicate that admits rows into
--      `kwvec` (`search_tsv @@ q` OR `title % q`). The keyword leg now ranks exactly
--      the rows the keyword arm admitted — no tuned constant, just consistency
--      between admission and scoring. Typo/diacritic tolerance is preserved because
--      the `%` operator is what provides it and it is the same operator here.
--   b. `+ 0.03 * kw_hit` in `scored`. 0.03 > 1/(60+1) = 0.01639, the vector leg's
--      maximum possible contribution, so semantic proximity alone can no longer
--      displace a lexical match. It is deliberately BELOW the city boost (0.05) and
--      the exact-title boost (0.08), which stay dominant, and it is constant across
--      keyword hits so it never reorders them among themselves.
--
-- WHAT THIS DOES NOT DO: `vnn` still admits 200 semantic neighbours unconditionally,
-- so `total` still counts them (66 for the query above). Narrowing ADMISSION — e.g.
-- an absolute distance cut, or skipping vnn when the keyword leg is already deep —
-- changes recall and needs its own calibration; it is a separate change, not this one.
--
-- MEASURED (prod, before/after, candidate installed in pg_temp for one session):
--   * The reproduction itself: query vector = the embedding of "Madrid Stripes
--     String Tank- Red", i.e. the real failure topology (keyword matches outside
--     the vnn top-200, apparel inside). Live -> 10 tank tops. Candidate -> the six
--     DanceSafe fentanyl strips at ranks 1-6. total = 65 in BOTH.
--   * Ordering inversions (a non-keyword-match ranked above a keyword match, top-20,
--     adversarial vector, 16 queries): live had 61 on "binder", 44 "rooftop bar",
--     27 "bookshop", 23 "trans friendly", 12 "harvey milk", 3 "kitkatclub",
--     3 "naloxone" — candidate has ZERO on all 16. `total` equal on all 16.
--     Note this defect was never DanceSafe-specific; it was ranking apparel over
--     chest binders and semantic noise over bookshops platform-wide.
--   * Keyword-only path (p_query_vec => null — what run.mjs + golden.json exercise):
--     28/28 queries byte-identical in hit ORDER and total. Only the absolute
--     _rankingScore shifts, by a uniform +0.03, because with no vector every
--     candidate is a keyword hit. Nothing in the app compares that number against a
--     threshold (grep: 5 references, all display/sort), and the golden assertions
--     match on title+city+rank, so they are unaffected.
--   * Latency, min-of-4 alternating: "pride" (8,787 candidates) 512 -> 556 ms
--     (+9%), "gay bar berlin" 427 -> 446, "leather bar" 306 -> 316, "sauna"
--     305 -> 284, "fentanyl test strips" 226 -> 256. The cost is the extra
--     per-candidate `@@` + `%`. Accepted against the 1,500 ms p95 gate. If it ever
--     needs reclaiming, hoist websearch_to_tsquery into p2 and derive the trigram
--     arm from the `trg` value already computed — but that changes the plan shape,
--     which is exactly what 20260713100710 got wrong, so measure it.
--
-- VERSION. Applied via MCP apply_migration, which stamps the version from its own
-- call time — hence 20260823225808 and not the 20260927140000 this file was
-- authored as. The filename MUST match the stamped version or `db push` re-runs it.
--
-- KEEP THE SHAPE. This body is 20260810170000 (plpgsql + dynamic EXECUTE +
-- force_custom_plan + narrow `cand` + vnn carrying vdist) with only the two deltas
-- above. 20260713100710 lost all of that by CREATE OR REPLACE-ing from a stale
-- LANGUAGE sql copy and cost prod every broad query for three weeks. If this is ever
-- redefined again, start from the CURRENT definition, not from a copy in a branch.

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
    case when p.eff_q is not null and (sd.search_tsv @@ websearch_to_tsquery('simple',unaccent(p.eff_q)) or sd.title % p.eff_q) then 1 else 0 end kw_hit,
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
kw as (select doc_id, rank() over (order by greatest(kw_rank,trg) desc) rk from cand where kw_hit=1),
vec as (select doc_id, rank() over (order by vec_sim desc) rk from cand where vec_sim is not null),
fused as (select c.*, coalesce(1.0/(60+kw.rk),0)+coalesce(1.0/(60+vec.rk),0) rrf from cand c left join kw using(doc_id) left join vec using(doc_id)),
scored as (select f.*, f.rrf + 0.08 * f.exact_title + 0.03 * f.kw_hit + 0.06 * case when f.entity_type='venue' then coalesce(f.lgbtq_score, 0.5) else 1.0 end + case f.entity_type when 'venue' then 0.015 when 'queer_village' then 0.012 when 'event' then 0.010 when 'personality' then 0.010 when 'city' then 0.006 when 'country' then 0.004 when 'marketplace' then 0.004 when 'news' then -0.010 when 'tag' then -0.006 else 0 end + case when f.boost_city is not null and lower(f.city)=f.boost_city then 0.05 else 0 end + case when f.is_featured then 0.02 else 0 end + case when f.liveness_status in ('dead','cancelled','dead_link','sold_out') then -0.5 when f.liveness_status='live' then 0.01 else 0 end + case when f.closed_at is not null then -0.5 else 0 end + case when f.entity_type='event' and f.start_date is not null and f.start_date>=$8 then 0.03*exp(-extract(epoch from (f.start_date-$8))/(60*60*24*30)) else 0 end - case when f.dist_m is not null then least(f.dist_m/50000.0,1)*0.02 else 0 end as score from fused f),
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

-- Pin both deltas. This function has been silently reverted twice by rewrites
-- started from a stale copy (target_groups filter, then the whole perf shape), so
-- the guard names each property it must keep rather than trusting the next author
-- to diff against prod.
create or replace function public.assert_search_hybrid_contract()
returns text language plpgsql stable security definer set search_path to 'public','extensions','pg_temp' as $$
declare def text; full_n int; filt_n int;
begin
  def := pg_get_functiondef('public.search_hybrid(text,vector,text[],jsonb,double precision,double precision,double precision,timestamptz,integer,integer,timestamptz,timestamptz,numeric,numeric,text)'::regprocedure);

  -- 1. target_groups filter must be present…
  if position('target_groups' in def) = 0 then
    raise exception 'search_hybrid contract FAIL: target_groups filter missing — re-add the jsonb ?| any-of clause (regressed at geo_soft_boost before).';
  end if;
  -- …and must actually narrow results.
  full_n := (public.search_hybrid('', null, array['venue'], '{}'::jsonb)->>'total')::int;
  filt_n := (public.search_hybrid('', null, array['venue'], jsonb_build_object('target_groups', jsonb_build_array('lesbian')))->>'total')::int;
  if not (filt_n > 0 and filt_n < full_n) then
    raise exception 'search_hybrid contract FAIL: target_groups filter not narrowing (lesbian=% of %).', filt_n, full_n;
  end if;

  -- 2. no vnn OR-subquery in the candidate admission (defeats the GIN bitmap → seq scan).
  if position('in (select doc_id from vnn)' in def) > 0 then
    raise exception 'search_hybrid contract FAIL: vnn admission via OR-subquery defeats the index (seq scan). Gather candidates in the kwvec UNION CTE instead.';
  end if;

  -- 3. the keyword leg must rank keyword MATCHES, not everything with a non-zero
  --    trigram similarity. `where greatest(kw_rank,trg)>0` gave every
  --    semantically-admitted row a keyword rank (similarity() is > 0 for almost
  --    any pair of strings) — see 20260823225808.
  if position('from cand where kw_hit=1' in def) = 0 then
    raise exception 'search_hybrid contract FAIL: keyword leg no longer gated on kw_hit — a vector-only candidate is collecting keyword RRF again (regressed at 20260823225808 before).';
  end if;

  -- 4. keyword precedence: a lexical match must out-score pure semantic proximity.
  --    The constant has to stay above the vector leg's maximum 1/(60+1)=0.01639.
  if position('0.03 * f.kw_hit' in def) = 0 then
    raise exception 'search_hybrid contract FAIL: keyword-precedence term missing — "fentanyl test strips" returns apparel again (see 20260823225808).';
  end if;

  return format('ok: target_groups filter active (lesbian=%s of %s venues), no vnn seq-scan pattern, keyword leg gated on kw_hit, keyword-precedence term present', filt_n, full_n);
end $$;

grant execute on function public.assert_search_hybrid_contract() to authenticated, service_role, anon;
