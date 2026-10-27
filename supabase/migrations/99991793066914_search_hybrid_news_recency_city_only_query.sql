-- search_hybrid: news recency, and city-only queries on types without a city.
--
-- 1. A query that is only a city name ("berlin") is detected as that city,
--    stripped, and served as "rows located in Berlin" (lower(sd.city)=boost_city).
--    News, people and other types carry no city, so the News tab for `berlin`
--    returned 0 and People for `london` returned 0. Rows with no city now also
--    match when their text contains the query (keyword match on the original
--    query). Measured: berlin/news 0 -> 135, london/personality 0 -> 13.
--
-- 2. News had no recency signal (events have an imminence boost; news only a
--    flat -0.010 type penalty), so `same-sex marriage` led with 2006-2015
--    archive pieces. News now gets +0.01*exp(-age/365d): enough to beat the
--    tiny RRF rank gaps between equally relevant articles years apart, small
--    against the exact-title (+0.08) and city (+0.05) boosts. 0.02 was tried
--    and let marginal mentions outrank on-topic articles.
--
-- Patched from the live definition with exactly-once replacements (anchors
-- are the text 99991793044018 leaves behind).

do $patch$
declare
  v_fn  regprocedure := 'api_private.search_hybrid(text,vector,text[],jsonb,double precision,double precision,double precision,timestamp with time zone,integer,integer,timestamp with time zone,timestamp with time zone,numeric,numeric,text)';
  v_src text := pg_get_functiondef(v_fn);
  v_old5 text := 'or (p.eff_q is null and p.boost_city is not null and lower(sd.city)=p.boost_city)';
  v_new5 text := 'or (p.eff_q is null and p.boost_city is not null and lower(sd.city)=p.boost_city) or (p.eff_q is null and p.dcity is not null and sd.city is null and sd.search_tsv @@ websearch_to_tsquery(''simple'',unaccent(p.q0)))';
  v_old6 text := 'then 0.03*exp(-extract(epoch from (f.start_date-$8))/(60*60*24*30)) else 0 end';
  v_new6 text := 'then 0.03*exp(-extract(epoch from (f.start_date-$8))/(60*60*24*30)) else 0 end + case when f.entity_type=''news'' and f.start_date is not null then 0.01*exp(-greatest(extract(epoch from ($8-f.start_date)),0)/(60*60*24*365)) else 0 end';
  v_n   int;
begin
  if position(v_new5 in v_src) = 0 then
    v_n := (length(v_src) - length(replace(v_src, v_old5, ''))) / length(v_old5);
    if v_n <> 1 then
      raise exception 'search_hybrid city-only branch: expected exactly 1 occurrence, found %', v_n;
    end if;
    v_src := replace(v_src, v_old5, v_new5);
  end if;
  if position(v_new6 in v_src) = 0 then
    v_n := (length(v_src) - length(replace(v_src, v_old6, ''))) / length(v_old6);
    if v_n <> 1 then
      raise exception 'search_hybrid event imminence term: expected exactly 1 occurrence, found %', v_n;
    end if;
    v_src := replace(v_src, v_old6, v_new6);
  end if;
  execute v_src;
end
$patch$;

do $verify$
declare
  v_def text := regexp_replace(pg_get_functiondef('api_private.search_hybrid(text,vector,text[],jsonb,double precision,double precision,double precision,timestamp with time zone,integer,integer,timestamp with time zone,timestamp with time zone,numeric,numeric,text)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g');
  v_res jsonb;
begin
  if position('p.dcity is not null and sd.city is null' in v_def) = 0 then
    raise exception 'search_hybrid city-only branch for city-less rows not present';
  end if;
  if position('f.entity_type=''news'' and f.start_date is not null then 0.01*exp' in v_def) = 0 then
    raise exception 'search_hybrid news recency term not present';
  end if;
  -- Behaviour, only where the data allows it: if a news article mentions
  -- Berlin and Berlin is a detected city, the News tab for `berlin` is not empty.
  if exists (select 1 from public.search_documents where entity_type = 'news' and search_tsv @@ websearch_to_tsquery('simple', 'berlin'))
     and (select count(*) from public.search_documents where entity_type = 'venue' and lower(city) = 'berlin') >= 10 then
    v_res := api_private.search_hybrid('berlin', null, array['news'], '{}'::jsonb, null, null, null, now(), 5, 0);
    if jsonb_array_length(v_res->'hits') = 0 then
      raise exception 'search_hybrid(berlin, news) still returns 0 hits';
    end if;
  end if;
end
$verify$;
