-- search_hybrid: a geo origin without a radius must not filter.
--
-- The candidate filter read
--   (p.origin is null or (sd.geog is not null and st_dwithin(sd.geog,p.origin,$7*1000)))
-- With p_lat/p_lng set and p_radius_km NULL, `$7*1000` is NULL, st_dwithin is
-- NULL, and EVERY row is excluded. /search?q=london&lat=..&lng=.. therefore
-- returned zero matches and the worker padded the page with unrelated popular
-- venues (Barcelona, Sydney, Paris, LA, ...).
--
-- Second fix, same function: the query-city detector compared the city title
-- against single query tokens, so `new york` matched the city "York" (23
-- venues), stripped "york", and searched "new" boosted to York -> New
-- Orleans, Provincetown, York. It now matches the title as a whole-word phrase
-- inside the query and prefers the longest match ("New York" over "York").
--
-- Third fix: with a city in the query, the exact-title boost (+0.08) went to
-- rows titled exactly like the rest of the query ANYWHERE, beating the city
-- boost (+0.05): `gay bar new york` led with two venues literally named
-- "Gay Bar" in Skandia and Xativa. When the query names a city, the
-- exact-title boost now counts only for rows in that city.
--
-- Fourth fix: a query none of whose words match anything (no tsvector hit,
-- no trigram title hit) still returned the vector arm's 40 nearest
-- neighbours: `zzxqwplkjhqweri` -> Benken ZH, Mazamitla, research papers.
-- Measured over real queries (German compound, Japanese, Russian, Spanish,
-- misspelt, natural-language): every one has >= 1 keyword candidate, while
-- nonsense has 0. Vector-only candidates are now admitted only when the
-- keyword arm matched something. The keyword set is materialized once and
-- reused, so this is also faster (nonsense ~700ms -> ~300ms); totals for real
-- queries are unchanged.
--
-- An origin with no radius is "where the user is": it still feeds dist_m, the
-- soft distance penalty and sort=distance. Only an explicit radius filters.
--
-- Patched from the live definition (pg_get_functiondef) with an exactly-once
-- replacement, so nothing else in the body is restated.

do $patch$
declare
  v_fn  regprocedure := 'api_private.search_hybrid(text,vector,text[],jsonb,double precision,double precision,double precision,timestamp with time zone,integer,integer,timestamp with time zone,timestamp with time zone,numeric,numeric,text)';
  v_src text := pg_get_functiondef(v_fn);
  v_old text := '(p.origin is null or (sd.geog is not null and st_dwithin(sd.geog,p.origin,$7*1000)))';
  v_new text := '(p.origin is null or $7 is null or (sd.geog is not null and st_dwithin(sd.geog,p.origin,$7*1000)))';
  v_old2 text := 'lower(unaccent(c.title))=any(toks.arr)) z where z.n>=10 order by z.n desc limit 1)';
  v_new2 text := '(chr(32)||array_to_string(toks.arr,chr(32))||chr(32)) like (''% ''||lower(unaccent(c.title))||'' %'')) z where z.n>=10 order by length(z.cname) desc, z.n desc limit 1)';
  v_old3 text := 'f.rrf + 0.08 * f.exact_title + ';
  v_new3 text := 'f.rrf + 0.08 * f.exact_title * (case when f.boost_city is null or lower(f.city)=f.boost_city then 1 else 0 end) + ';
  v_old4 text := 'kwvec as (select sd.doc_id from public.search_documents sd, p2 p where p.eff_q is not null and (sd.search_tsv @@ websearch_to_tsquery(''simple'',unaccent(p.eff_q)) or sd.title % p.eff_q) union select doc_id from vnn),';
  v_new4 text := 'kwonly as materialized (select sd.doc_id from public.search_documents sd, p2 p where p.eff_q is not null and (sd.search_tsv @@ websearch_to_tsquery(''simple'',unaccent(p.eff_q)) or sd.title % p.eff_q)),
kwvec as (select doc_id from kwonly union select doc_id from vnn where exists (select 1 from kwonly)),';
  v_n   int;
begin
  if position(v_new in v_src) = 0 then
    v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
    if v_n <> 1 then
      raise exception 'search_hybrid geo filter: expected exactly 1 occurrence of the old predicate, found %', v_n;
    end if;
    v_src := replace(v_src, v_old, v_new);
  end if;
  if position(v_new2 in v_src) = 0 then
    v_n := (length(v_src) - length(replace(v_src, v_old2, ''))) / length(v_old2);
    if v_n <> 1 then
      raise exception 'search_hybrid city detector: expected exactly 1 occurrence of the old predicate, found %', v_n;
    end if;
    v_src := replace(v_src, v_old2, v_new2);
  end if;
  if position(v_new3 in v_src) = 0 then
    v_n := (length(v_src) - length(replace(v_src, v_old3, ''))) / length(v_old3);
    if v_n <> 1 then
      raise exception 'search_hybrid exact-title boost: expected exactly 1 occurrence of the old expression, found %', v_n;
    end if;
    v_src := replace(v_src, v_old3, v_new3);
  end if;
  if position(v_new4 in v_src) = 0 then
    v_n := (length(v_src) - length(replace(v_src, v_old4, ''))) / length(v_old4);
    if v_n <> 1 then
      raise exception 'search_hybrid vector admission: expected exactly 1 occurrence of the old kwvec CTE, found %', v_n;
    end if;
    v_src := replace(v_src, v_old4, v_new4);
  end if;
  execute v_src;
end
$patch$;

do $verify$
declare
  v_res jsonb;
begin
  if position('$7 is null or (sd.geog' in regexp_replace(pg_get_functiondef('api_private.search_hybrid(text,vector,text[],jsonb,double precision,double precision,double precision,timestamp with time zone,integer,integer,timestamp with time zone,timestamp with time zone,numeric,numeric,text)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g')) = 0 then
    raise exception 'search_hybrid geo filter patch not present';
  end if;
  -- Behaviour: origin (Berlin) with no radius must still return london matches.
  v_res := api_private.search_hybrid('london', null, null, '{}'::jsonb, 52.52, 13.405, null, now(), 5, 0);
  if jsonb_array_length(v_res->'hits') = 0 then
    raise exception 'search_hybrid(london, lat/lng, no radius) still returns 0 hits';
  end if;
  -- Multi-word city: every top hit for `new york` is in New York.
  v_res := api_private.search_hybrid('new york', null, null, '{}'::jsonb, null, null, null, now(), 10, 0);
  if jsonb_array_length(v_res->'hits') = 0
     or exists (select 1 from jsonb_array_elements(v_res->'hits') h where lower(coalesce(h->>'city','')) <> 'new york') then
    raise exception 'search_hybrid(new york) top 10 not all New York';
  end if;
  -- A city in the query outranks an exact title elsewhere.
  v_res := api_private.search_hybrid('gay bar new york', null, null, '{}'::jsonb, null, null, null, now(), 5, 0);
  if jsonb_array_length(v_res->'hits') = 0
     or exists (select 1 from jsonb_array_elements(v_res->'hits') h where lower(coalesce(h->>'city','')) <> 'new york') then
    raise exception 'search_hybrid(gay bar new york) top 5 not all New York';
  end if;
  -- Nonsense with a query vector: nothing matches, so nothing is returned.
  v_res := api_private.search_hybrid('zzxqwplkjhqweri', (select embedding from public.search_embeddings where embedding is not null limit 1), null, '{}'::jsonb, null, null, null, now(), 5, 0);
  if (v_res->>'total')::int <> 0 then
    raise exception 'search_hybrid(nonsense) still returns % vector-only hits', v_res->>'total';
  end if;
  -- Positive control: a real query with a vector still returns hits.
  v_res := api_private.search_hybrid('places to dance at night', (select embedding from public.search_embeddings where embedding is not null limit 1), null, '{}'::jsonb, null, null, null, now(), 5, 0);
  if jsonb_array_length(v_res->'hits') = 0 then
    raise exception 'search_hybrid(places to dance at night) returns no hits';
  end if;
end
$verify$;
