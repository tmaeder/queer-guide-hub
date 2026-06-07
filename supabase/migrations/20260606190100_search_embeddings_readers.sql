-- Embedding move, Phase 1 readers: the 4 functions that did vector search now
-- read search_embeddings (sibling) instead of search_documents.embedding.
-- search_hybrid + get_recommendations use a p_query_vec/p_bias_vec-gated LATERAL
-- join (keyword/popularity-only queries never touch the embedding table);
-- related_entities + find_duplicates join the sibling directly.
-- Parity-validated live on prod before commit (see sibling migration header).

CREATE OR REPLACE FUNCTION public.search_hybrid(p_query text DEFAULT ''::text, p_query_vec vector DEFAULT NULL::vector, p_content_types text[] DEFAULT NULL::text[], p_filters jsonb DEFAULT '{}'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_km double precision DEFAULT NULL::double precision, p_now timestamp with time zone DEFAULT now(), p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_sort text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
select jsonb_build_object('total',(select count(*) from cand),'hits',coalesce((select jsonb_agg(h) from (
  select jsonb_build_object('objectID',entity_id,'doc_id',doc_id,'type',entity_type,'title',title,'description',left(description,300),'category',facets->>'category','city',city,'country',country,'location',nullif(concat_ws(', ',city,country),''),'slug',slug,'imageUrl',image_url,'featured',is_featured,'is_free',is_free,'price_min',price_min,'price_max',price_max,'start_date',extract(epoch from start_date),'end_date',extract(epoch from end_date),'trust_score',trust_score,'liveness_status',liveness_status,'_geoloc',case when geog is not null then jsonb_build_object('lat',st_y(geog::geometry),'lng',st_x(geog::geometry)) end,'_distance_m',case when dist_m is not null then round(dist_m)::int end,'_rankingScore',round(score::numeric,6),'tags',facets->'tags') h
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
) x),'[]'::jsonb))
$function$;

CREATE OR REPLACE FUNCTION public.related_entities(p_entity_type text, p_entity_id uuid, p_content_types text[] DEFAULT NULL::text[], p_same_type_only boolean DEFAULT false, p_limit integer DEFAULT 10, p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare v extensions.vector(1024);
begin
  select se.embedding into v
    from public.search_embeddings se
    join public.search_documents sd on sd.doc_id=se.doc_id
   where sd.entity_type=p_entity_type and sd.entity_id=p_entity_id;
  if v is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('objectID',entity_id,'type',entity_type,'title',title,'description',left(description,200),'city',city,'country',country,'slug',slug,'imageUrl',image_url,'category',facets->>'category','featured',is_featured,'_score',round(sim::numeric,4)) order by sim desc)
    from (
      select sd.entity_id, sd.entity_type, sd.title, sd.description, sd.city, sd.country, sd.slug, sd.image_url, sd.facets, sd.is_featured,
             1-(se.embedding <=> v) as sim
      from public.search_documents sd
      join public.search_embeddings se on se.doc_id=sd.doc_id
      where se.embedding is not null
        and not (sd.entity_type=p_entity_type and sd.entity_id=p_entity_id)
        and (p_content_types is null or sd.entity_type=any(p_content_types))
        and (not p_same_type_only or sd.entity_type=p_entity_type)
        and (sd.entity_type<>'event' or sd.start_date is null or coalesce(sd.end_date,sd.start_date)>=p_now-interval '1 day')
        and coalesce(sd.liveness_status,'') not in ('dead','cancelled','dead_link')
        and sd.closed_at is null
      order by se.embedding <=> v
      limit greatest(p_limit,0)
    ) nn
  ), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.find_duplicates(p_content_type text, p_title text DEFAULT NULL::text, p_embedding vector DEFAULT NULL::vector, p_exclude_id uuid DEFAULT NULL::uuid, p_title_threshold real DEFAULT 0.45, p_vec_threshold real DEFAULT 0.88, p_limit integer DEFAULT 5)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  with ids as (
    select entity_id from public.search_documents
     where entity_type=p_content_type and (p_exclude_id is null or entity_id<>p_exclude_id)
       and p_title is not null and p_title<>'' and title % p_title
    union
    (select sd.entity_id from public.search_documents sd
       join public.search_embeddings se on se.doc_id=sd.doc_id
      where sd.entity_type=p_content_type and (p_exclude_id is null or sd.entity_id<>p_exclude_id)
        and p_embedding is not null and se.embedding is not null
      order by se.embedding <=> p_embedding limit 20)
  ),
  scored as (
    select sd.entity_id, sd.title, sd.slug, sd.city, sd.country, sd.image_url,
      case when p_title is not null and p_title<>'' then similarity(coalesce(sd.title,''),p_title) else 0 end as ts,
      case when p_embedding is not null and e.embedding is not null then 1-(e.embedding <=> p_embedding) else null end as vs
    from public.search_documents sd
    join ids using (entity_id)
    left join lateral (select se.embedding from public.search_embeddings se where p_embedding is not null and se.doc_id=sd.doc_id) e on true
  )
  select coalesce((
    select jsonb_agg(jsonb_build_object('id',entity_id,'title',title,'slug',slug,'city',city,'country',country,'image_url',image_url,'title_sim',round(ts::numeric,3),'vec_sim',case when vs is not null then round(vs::numeric,3) end,'match',case when ts>=p_title_threshold and (vs is not null and vs>=p_vec_threshold) then 'both' when ts>=p_title_threshold then 'title' else 'vector' end) order by greatest(coalesce(ts,0),coalesce(vs,0)) desc)
    from (select * from scored where ts>=p_title_threshold or (vs is not null and vs>=p_vec_threshold) order by greatest(coalesce(ts,0),coalesce(vs,0)) desc limit greatest(p_limit,0)) x
  ), '[]'::jsonb);
$function$;

CREATE OR REPLACE FUNCTION public.get_recommendations(p_bias_vec vector DEFAULT NULL::vector, p_content_types text[] DEFAULT NULL::text[], p_city text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_km double precision DEFAULT NULL::double precision, p_exclude_ids uuid[] DEFAULT NULL::uuid[], p_now timestamp with time zone DEFAULT now(), p_limit integer DEFAULT 20)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
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
select coalesce((select jsonb_agg(jsonb_build_object('objectID',entity_id,'type',entity_type,'title',title,'description',left(description,200),'city',city,'country',country,'slug',slug,'imageUrl',image_url,'category',facets->>'category','featured',is_featured,'start_date',extract(epoch from start_date),'_score',round(score::numeric,4)) order by score desc) from (select * from scored order by score desc limit greatest(p_limit,0)) x), '[]'::jsonb);
$function$;
