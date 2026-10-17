-- cities_directory(): stop sending 16,206 copies of 25 key names and 212 countries.
--
-- 99991792214562 indexed the venue count and took this RPC from 2,565 ms to 1,620 ms
-- against anon's 3s statement_timeout. It then named the remaining cost rather than
-- fixing it: `jsonb_agg` was **851 ms of that 1,620**, building a **7,514 kB** payload
-- over 16,206 rows. This is that follow-up.
--
-- WHERE THE 7.5 MB ACTUALLY WAS, measured per key rather than guessed. The obvious
-- suspicion was a fat prose column, and it is wrong: `editorial_hook` is **41 kB, 0.5%**,
-- present on 424 rows. There is no fat field. The payload is death by a thousand keys:
--
--   key NAMES ..................... 3,675 kB  (55.2% of the payload)
--   all values together ........... 2,986 kB
--   of which the country block .... 2,673 kB  (35.5%), carrying 212 DISTINCT
--                                              country tuples across 16,206 rows
--
-- So two structural costs, neither of them a field anyone would think to delete: the
-- per-row repetition of 25 identifiers, and a denormalised country/continent block.
--
-- WHY NOT PAGINATION, which is what "the payload is too big" usually means. The /cities
-- page does its filtering, its facet counts and its map CLIENT-SIDE over the whole
-- corpus — `filterAndSortCities`, `continentFacetCounts` and `CitiesMapPane` in
-- src/hooks/useCitiesDirectory.ts all read the full set. Paginating this RPC therefore
-- does not shrink a page load, it breaks search, the continent counts and the map at
-- once, and only pays off after all three move server-side. That is a different and much
-- larger change. The payload can be made 2.7x smaller without touching any of it.
--
-- BOTH CANDIDATE SHAPES WERE BUILT AND MEASURED BEFORE CHOOSING, because they cost the
-- same at the consumer (both replace the bare top-level array, so both need the same two
-- call-site updates):
--
--   current, array of 25-key objects ...................... 7,514 kB
--   (a) objects, country normalised, dead fields dropped .. 4,677 kB  (-38%)
--   (b) columnar rows + country lookup .................... 2,815 kB  (-63%)
--
-- (b) at identical blast radius, so (b). End to end, dry-run on prod:
--
--   2,565 ms (before 99991792214562) -> 1,620 ms (its index) -> **720 ms** (this)
--
-- i.e. 4.2x headroom under the 3s ceiling where it was 1.17x, and 12,590 blocks.
--
-- THE `cols` HEADER IS LOAD-BEARING AND IS NOT DECORATION. A columnar payload decoded
-- against a column order hardcoded in TypeScript breaks SILENTLY and catastrophically
-- the first time someone inserts a column — every city would read another city's field,
-- with no error anywhere. Shipping the column names WITH the data makes the payload
-- self-describing, lets the client throw on a column it needs and cannot find, and makes
-- "cols length = row length" an invariant a postcondition can assert (P2). Do not
-- "simplify" this by dropping `cols` and indexing by constant.
--
-- `name_local` / `name_local_lang` ARE DROPPED, NOT MISSED. They have been returned
-- since 99991791360464 and are read by NO consumer: `CitiesDirectoryRow` does not
-- declare them, `toDirectoryCity` does not copy them, and the maps script does not touch
-- them. 43 kB of payload nothing has ever looked at.
--
-- `id` STAYS, AND THAT IS A MEASURED DECISION RATHER THAN AN OVERSIGHT. With the key
-- names gone it is now **~600 kB of the remaining 2,815 kB (21%)** — a uuid used in
-- exactly two places: as the key of the `venueCounts` map the sort reads, and as a
-- `city.slug || city.id` fallback in one URL. `slug` is already present and unique, so it
-- is removable — but only by changing `CityForFilter`, the sorter in the pure
-- `citiesFilter` module and three test files. Named for whoever wants that 21%.
--
-- ORDER IS EXPLICIT ON THE AGGREGATE, not inherited from the CTE. The maps script
-- depends on it: scripts/generate-country-maps.mjs:401 reads "Ordered venue_count desc
-- by cities_directory" and pins the first-listed city per country. (Note
-- src/utils/citiesFilter.ts:59 claims this RPC "has no ORDER BY" — that comment is stale
-- and was already wrong before this migration; the sorters there are total regardless,
-- so nothing depends on it being true.)
--
-- CARRIED FORWARD FROM 99991792214562, deliberately unchanged: the index-only venue
-- count, `hr as materialized` (PG12+ inlines a once-referenced CTE and would rebuild the
-- per-row scan), the `geo_places` country fallback, and `high_risk` as a LEFT JOIN that
-- cannot yield NULL. `rows` gains `materialized` because it is now referenced twice — by
-- the country lookup and by the row build — and without it the whole join runs twice.
--
-- EQUIVALENCE ASSERTED, NOT ASSUMED — the house rule for this function, because
-- high_risk drives safety-gating copy. P6 compares the shipped payload against the
-- EXISTS form in one statement so both see one snapshot.

create or replace function public.cities_directory()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with vc as (
    -- Index-only scan on idx_venues_city_id_approved; see 99991792214562 for the two
    -- measured visibility-map bounds and why the degraded one is still a win.
    select v.city_id, count(*)::int as n
    from public.venues v
    where v.review_status = 'approved'
      and v.city_id is not null
    group by v.city_id
  ),
  -- Upcoming only. The events corpus is ~99% past (36.5k rows scraped from the
  -- Wayback Machine), so a lifetime count would say nothing about whether there is
  -- anything to go to.
  ec as (
    select e.city_id, count(*)::int as n
    from public.events e
    where e.city_id is not null
      and e.start_date >= now() - interval '1 day'
    group by e.city_id
  ),
  qv as (
    select q.city_id, count(*)::int as n
    from public.queer_villages q
    where q.city_id is not null
    group by q.city_id
  ),
  -- The high-risk COUNTRY set, resolved once (67 of 250 countries). Must stay
  -- `materialized` — see the header.
  hr as materialized (
    select cp.place_id as country_id
    from public.geo_country_profiles cp
    where (cp.lgbti_criminalization->>'legal') = 'false'
       or public.death_penalty_risk(cp.lgbti_criminalization) <> 'none'
  ),
  -- `materialized` because `ctry` and the row build both read it; without it this
  -- whole join runs twice.
  rows as materialized (
    select
      c.id,
      c.slug,
      c.name,
      c.name_en,
      c.name_de,
      c.region_name,
      c.population,
      c.latitude,
      c.longitude,
      c.is_capital,
      nullif(c.is_regional_capital, false) as is_regional_capital,
      c.capital_of_region,
      c.editorial_hook,
      co.id            as country_id,
      co.name          as country_name,
      co.slug          as country_slug,
      co.equality_score,
      cont.code        as continent_code,
      cont.name        as continent_name,
      coalesce(vc.n, 0) as venue_count,
      coalesce(ec.n, 0) as upcoming_event_count,
      coalesce(qv.n, 0) as village_count,
      -- Resolved here, not in the client, so the card cannot disagree with the RLS
      -- predicate that decides whether that city's venues are gated at all. A LEFT JOIN
      -- rather than a per-row EXISTS; `is not null` keeps it strictly boolean, which
      -- `in (select ...)` would not.
      (hr.country_id is not null) as high_risk
    from public.cities c
    left join public.countries  co   on co.id   = c.country_id
    left join public.continents cont on cont.id = co.continent_id
    left join vc on vc.city_id = c.id
    left join ec on ec.city_id = c.id
    left join qv on qv.city_id = c.id
    -- Inlined from location_is_high_risk(); the coalesce is that function's own
    -- geo_places fallback, kept verbatim.
    left join hr on hr.country_id = coalesce(
      c.country_id,
      (select gp.country_id from public.geo_places gp
        where gp.id = c.id and gp.place_type = 'city')
    )
    where c.duplicate_of_id is null
      and c.slug is not null
      and c.slug not like 'tmp-%'
      and c.latitude is not null
      and c.longitude is not null
      and c.seo_indexable is true
      -- `not in` would swallow NULLs; shell_status is NOT NULL on every row.
      and c.shell_status not in ('ghost', 'merged')
  ),
  -- 212 distinct tuples, which is the whole point: they were being repeated 16,206
  -- times for 2,673 kB. Objects rather than tuples here — at 212 rows the key names
  -- cost ~17 kB and buy a self-describing lookup.
  ctry as (
    select
      row_number() over (order by country_slug nulls last) - 1 as ix,
      country_id, country_name, country_slug, equality_score,
      continent_code, continent_name
    from rows
    where country_id is not null
    group by country_id, country_name, country_slug, equality_score,
             continent_code, continent_name
  )
  select jsonb_build_object(
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',             k.country_id,
               'name',           k.country_name,
               'slug',           k.country_slug,
               'equality_score', k.equality_score,
               'continent_code', k.continent_code,
               'continent_name', k.continent_name
             ) order by k.ix)
      from ctry k), '[]'::jsonb),
    -- Shipped WITH the data so the client decodes by name. See the header: a hardcoded
    -- column order fails silently on an insert.
    'cols', jsonb_build_array(
      'id', 'slug', 'name', 'name_en', 'name_de', 'region_name', 'population',
      'latitude', 'longitude', 'is_capital', 'is_regional_capital', 'capital_of_region',
      'editorial_hook', 'venue_count', 'upcoming_event_count', 'village_count',
      'high_risk', 'country'),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_array(
               r.id, r.slug, r.name, r.name_en, r.name_de, r.region_name, r.population,
               r.latitude, r.longitude, r.is_capital, r.is_regional_capital,
               r.capital_of_region, r.editorial_hook, r.venue_count,
               r.upcoming_event_count, r.village_count, r.high_risk, k.ix)
             -- Explicit on the aggregate, not inherited: the maps script pins the
             -- first-listed city per country.
             order by r.venue_count desc, r.population desc nulls last, r.name asc)
      from rows r
      left join ctry k on k.country_id = r.country_id), '[]'::jsonb)
  );
$function$;

do $verify$
declare
  v_src       text;
  v_col       text;
  v_p         jsonb;
  v_cols      int;
  v_rows      int;
  v_expected  int;
  v_bad       int;
  v_disagree  int;
  -- Resolved FROM the payload's own `cols`, never hardcoded. Hardcoding an ordinal
  -- here would reproduce, inside the check, the exact brittleness the `cols` header
  -- exists to remove — and the check would then pass against a reordered payload.
  ix_id       int;
  ix_vc       int;
  ix_hr       int;
  ix_country  int;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'cities_directory';

  -- P1: the three things 99991792214562 established stay established. Each is a
  -- silent, measured regression if dropped, so none of them is restated by accident.
  if position('hr as materialized' in v_src) = 0 then
    raise exception 'P1 failed: the hr CTE is no longer materialized — the per-row scan is back';
  end if;
  if position('place_type = ''city''' in v_src) = 0 then
    raise exception 'P1 failed: the geo_places country fallback was dropped';
  end if;
  if position('(hr.country_id is not null) as high_risk' in v_src) = 0 then
    raise exception 'P1 failed: high_risk is no longer the boolean LEFT JOIN form';
  end if;
  if position('rows as materialized' in v_src) = 0 then
    raise exception 'P1 failed: the rows CTE is not materialized — it is read twice, so the join now runs twice';
  end if;

  v_p := public.cities_directory();

  -- P2: the envelope, and the invariant that makes positional decoding safe at all.
  if not (v_p ? 'countries' and v_p ? 'cols' and v_p ? 'rows') then
    raise exception 'P2 failed: envelope is missing one of countries/cols/rows';
  end if;
  v_cols := jsonb_array_length(v_p->'cols');
  v_rows := jsonb_array_length(v_p->'rows');

  -- FILTER binds to the aggregate, so the `- 1` goes OUTSIDE it; written the other way
  -- round this is a 42601 that neither check-migration-sql.mjs nor any unit test can
  -- see, because both treat a plpgsql body as an opaque dollar-quoted literal.
  select min(ord) filter (where col = 'id')          - 1,
         min(ord) filter (where col = 'venue_count') - 1,
         min(ord) filter (where col = 'high_risk')   - 1,
         min(ord) filter (where col = 'country')     - 1
    into ix_id, ix_vc, ix_hr, ix_country
  from jsonb_array_elements_text(v_p->'cols') with ordinality t(col, ord);

  if ix_id is null or ix_vc is null or ix_hr is null or ix_country is null then
    raise exception 'P2 failed: cols is missing one of id/venue_count/high_risk/country (got %)', v_p->'cols';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(v_p->'rows') r
  where jsonb_array_length(r.value) <> v_cols;
  if v_bad <> 0 then
    raise exception 'P2 failed: % of % rows do not have cols length (%) — positional decoding would read the wrong field', v_bad, v_rows, v_cols;
  end if;

  -- P3: the dead columns are gone AND the live ones are present. Asserting only the
  -- absence would be satisfied by a payload that had lost half its fields.
  if (v_p->'cols') ?| array['name_local', 'name_local_lang'] then
    raise exception 'P3 failed: name_local/name_local_lang are back in the payload and no consumer reads them';
  end if;
  foreach v_col in array array['id','slug','name','region_name','latitude','longitude',
                               'is_capital','venue_count','upcoming_event_count',
                               'village_count','high_risk','country']
  loop
    if not ((v_p->'cols') ? v_col) then
      raise exception 'P3 failed: cols is missing the % column a consumer reads', v_col;
    end if;
  end loop;

  -- P4: cardinality derived live, never pinned — the corpus grew 6.4x in 26 days.
  select count(*) into v_expected
  from public.cities c
  where c.duplicate_of_id is null
    and c.slug is not null
    and c.slug not like 'tmp-%'
    and c.latitude is not null
    and c.longitude is not null
    and c.seo_indexable is true
    and c.shell_status not in ('ghost', 'merged');

  if v_rows <> v_expected then
    raise exception 'P4 failed: payload has % rows, predicate matches %', v_rows, v_expected;
  end if;
  if v_rows = 0 then
    raise exception 'P4 failed: directory is empty — every other check here passes vacuously on an empty payload';
  end if;

  -- P5: every country reference resolves. A dangling index is the failure mode of
  -- normalising, and it would render as a city with no country rather than as an error.
  select count(*) into v_bad
  from jsonb_array_elements(v_p->'rows') r
  where (r.value->>ix_country) is not null
    and (v_p->'countries'->((r.value->>ix_country)::int)) is null;
  if v_bad <> 0 then
    raise exception 'P5 failed: % rows carry a country index with no entry in the lookup', v_bad;
  end if;
  if jsonb_array_length(v_p->'countries') = 0 then
    raise exception 'P5 failed: the country lookup is empty, so P5 proved nothing';
  end if;

  -- P6: order is what the maps script depends on.
  select count(*) into v_bad
  from (
    select (r.value->>ix_vc)::int as vc,
           lag((r.value->>ix_vc)::int) over (order by r.ordinality) as prev
    from jsonb_array_elements(v_p->'rows') with ordinality r(value, ordinality)
  ) q
  where prev is not null and vc > prev;
  if v_bad <> 0 then
    raise exception 'P6 failed: % rows break the venue_count desc order the maps script pins on', v_bad;
  end if;

  -- P7: the house rule. high_risk compared against the EXISTS form in ONE statement,
  -- so both see a single snapshot.
  with hr as materialized (
    select cp.place_id as country_id
    from public.geo_country_profiles cp
    where (cp.lgbti_criminalization->>'legal') = 'false'
       or public.death_penalty_risk(cp.lgbti_criminalization) <> 'none'
  )
  select count(*) into v_disagree
  from jsonb_array_elements(v_p->'rows') r
  join public.cities c on c.id = (r.value->>ix_id)::uuid
  where (r.value->>ix_hr)::boolean <> exists (
    select 1 from hr
    where hr.country_id = coalesce(
      c.country_id,
      (select gp.country_id from public.geo_places gp
        where gp.id = c.id and gp.place_type = 'city')
    )
  );
  if v_disagree <> 0 then
    raise exception 'P7 failed: % of % cities disagree with the EXISTS form on high_risk', v_disagree, v_rows;
  end if;

  raise notice 'cities_directory: P1-P7 pass (% rows, % cols, % countries, 0 high_risk disagreements)',
    v_rows, v_cols, jsonb_array_length(v_p->'countries');
end
$verify$;

comment on function public.cities_directory() is
  'Columnar directory payload for /cities: {countries, cols, rows}. Key names were 55% '
  'of the old 7,514 kB array-of-objects and the country block another 35% over 212 '
  'distinct tuples; this is 2,815 kB / ~720 ms against anon''s 3s ceiling. Decode by '
  'name via cols — never by a hardcoded column order. See 99991792214568.';
