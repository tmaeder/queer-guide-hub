-- search_hybrid: a geo origin without a radius must not filter.
--
-- The candidate filter read
--   (p.origin is null or (sd.geog is not null and st_dwithin(sd.geog,p.origin,$7*1000)))
-- With p_lat/p_lng set and p_radius_km NULL, `$7*1000` is NULL, st_dwithin is
-- NULL, and EVERY row is excluded. /search?q=london&lat=..&lng=.. therefore
-- returned zero matches and the worker padded the page with unrelated popular
-- venues (Barcelona, Sydney, Paris, LA, ...).
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
  v_n   int;
begin
  if position(v_new in v_src) > 0 then
    return; -- already applied
  end if;
  v_n := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  if v_n <> 1 then
    raise exception 'search_hybrid geo filter: expected exactly 1 occurrence of the old predicate, found %', v_n;
  end if;
  execute replace(v_src, v_old, v_new);
end
$patch$;

do $verify$
declare
  v_res jsonb;
begin
  if position('$7 is null or (sd.geog' in pg_get_functiondef('api_private.search_hybrid(text,vector,text[],jsonb,double precision,double precision,double precision,timestamp with time zone,integer,integer,timestamp with time zone,timestamp with time zone,numeric,numeric,text)'::regprocedure)) = 0 then
    raise exception 'search_hybrid geo filter patch not present';
  end if;
  -- Behaviour: origin (Berlin) with no radius must still return london matches.
  v_res := api_private.search_hybrid('london', null, null, '{}'::jsonb, 52.52, 13.405, null, now(), 5, 0);
  if jsonb_array_length(v_res->'hits') = 0 then
    raise exception 'search_hybrid(london, lat/lng, no radius) still returns 0 hits';
  end if;
end
$verify$;
