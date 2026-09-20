-- cities_directory(): resolve high_risk set-based instead of once per city.
--
-- SYMPTOM, as reported: "I typed Berlin into the search field and pressed Enter.
-- Nothing happened." (/cities?q=berlin). The search box is not the bug — it filters
-- on change and reads ?q= on mount. The DIRECTORY was empty: cities_directory()
-- returned HTTP 500 and Cities.tsx renders an RPC failure as the "No cities found"
-- empty state, so a broken fetch is indistinguishable from a filter that matched
-- nothing.
--
-- WHY IT 500s. `anon` carries statement_timeout = 3s (pg_roles.rolconfig; authenticated
-- gets 8s). Warm, this RPC answers in ~0.6s and is fine — which is why it looks healthy
-- when you probe it. Cold or contended it ran far past 3s, so every cache eviction
-- turned /cities into an empty page for logged-out visitors. Intermittent by
-- construction, which is why it reads as "sometimes nothing happens".
--
-- THE COST DRIVER, measured rather than guessed. The row builder called
-- public.location_is_high_risk(c.country_id, c.id) once per city — 2,529 calls, each
-- its own scan of geo_country_profiles:
--
--   seq scan of cities alone ........................  2,734 buffers
--   + the per-row location_is_high_risk call ........ 47,458 buffers, 260 ms
--   + set-based, this migration .....................  5,928 buffers,  38 ms
--
-- i.e. the function was ~94% of this fragment; 8x fewer buffers and 6.9x faster.
-- (Quote buffers, not warm milliseconds: the failure mode is a COLD call, where those
-- ~41,000 extra buffers are physical reads rather than shared hits.)
--
-- EQUIVALENCE IS ASSERTED, NOT ASSUMED. The old and new expressions were evaluated
-- against each other in ONE statement, so both saw a single snapshot: 2,529 rows
-- compared, 152 high_risk under each, **0 disagreements**. That matters more than the
-- speed here — high_risk drives the safety-gating copy on a city card, and this
-- function is deliberately resolved server-side so the card cannot disagree with the
-- RLS predicate that decides whether those venues are visible at all. A faster answer
-- that gated one city differently would be a regression, not an optimisation.
--
-- `materialized` ON THE CTE IS LOAD-BEARING, NOT DECORATION. A non-recursive CTE
-- referenced once is INLINED by PostgreSQL 12+, which would push the subquery back
-- inside the per-row EXISTS and rebuild exactly the scan this migration removes — with
-- every test still passing and the buffer count quietly back at 47k. Same reasoning as
-- the tag_hygiene_stats fix.
--
-- THE geo_places FALLBACK IS PRESERVED. location_is_high_risk resolves the country from
-- p_country_id and falls back to geo_places when it is null; the coalesce keeps that
-- arm. Measured: 0 of the 2,529 directory rows have a null country_id, and the plan
-- reports that index scan as "never executed" — so it is correctness insurance that
-- costs nothing, not dead code to drop.
--
-- NOT CHANGED, deliberately: the 1.2 MB unpaginated payload. It is worth revisiting,
-- but the timeout is the bug and a payload change alters what the client receives.

create or replace function public.cities_directory()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with vc as (
    select v.city_id, count(*)::int as n
    from public.venues v
    where v.review_status = 'approved'
      and v.city_id is not null
    group by v.city_id
  ),
  -- Upcoming only. The events corpus is ~99% past (36.5k rows scraped from the
  -- Wayback Machine), so a lifetime count would say nothing about whether there is
  -- anything to go to; 157 cities have a future event.
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
  -- The high-risk COUNTRY set, resolved once (67 of 250 countries) instead of
  -- re-derived per city. Must stay `materialized` — see the header.
  hr as materialized (
    select cp.place_id as country_id
    from public.geo_country_profiles cp
    where (cp.lgbti_criminalization->>'legal') = 'false'
       or public.death_penalty_risk(cp.lgbti_criminalization) <> 'none'
  ),
  rows as (
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
      -- predicate that decides whether that city's venues are gated at all. Inlined
      -- from location_is_high_risk() rather than calling it per row; the coalesce is
      -- that function's own geo_places fallback, kept verbatim.
      exists (
        select 1 from hr
        where hr.country_id = coalesce(
          c.country_id,
          (select gp.country_id from public.geo_places gp
            where gp.id = c.id and gp.place_type = 'city')
        )
      ) as high_risk
    from public.cities c
    left join public.countries  co   on co.id   = c.country_id
    left join public.continents cont on cont.id = co.continent_id
    left join vc on vc.city_id = c.id
    left join ec on ec.city_id = c.id
    left join qv on qv.city_id = c.id
    where c.duplicate_of_id is null
      and c.slug is not null
      and c.slug not like 'tmp-%'
      -- Coordinates were a map requirement; they stay because they are also the best
      -- available completeness proxy for a stub row. Only 2 of 3,070 rows lack them,
      -- so this is not what was truncating the directory — the limit was.
      and c.latitude is not null
      and c.longitude is not null
      and c.seo_indexable is true
      -- `not in` would swallow NULLs; shell_status is NOT NULL on every row (verified),
      -- so this is safe, and it is the same expression the places sitemap uses.
      and c.shell_status not in ('ghost', 'merged')
    order by coalesce(vc.n, 0) desc, c.population desc nulls last, c.name asc
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(rows))), '[]'::jsonb) from rows;
$function$;

do $verify$
declare
  v_rows      int;
  v_high_risk int;
  v_berlin    int;
  v_src       text;
begin
  -- Postconditions assert the REACHED state, not that this file did the reaching:
  -- a better fix merged by someone else must satisfy them too, and a migration that
  -- RAISEs on main takes every migration queued behind it down with it.
  select jsonb_array_length(public.cities_directory()) into v_rows;
  if v_rows < 2000 then
    raise exception 'cities_directory returned % rows, expected the full directory (~2529)', v_rows;
  end if;

  select count(*) into v_high_risk
  from jsonb_array_elements(public.cities_directory()) e
  where (e->>'high_risk')::boolean;
  -- 152 at the time of writing. Gate on "some, but not most": a 0 would mean the
  -- safety flag silently stopped being computed, which is the failure this rewrite
  -- could plausibly introduce and the one that matters.
  if v_high_risk = 0 or v_high_risk > v_rows / 2 then
    raise exception 'cities_directory high_risk count implausible: % of %', v_high_risk, v_rows;
  end if;

  -- The reported query has to find its city.
  select count(*) into v_berlin
  from jsonb_array_elements(public.cities_directory()) e
  where e->>'slug' = 'berlin';
  if v_berlin <> 1 then
    raise exception 'expected exactly 1 berlin row in cities_directory, got %', v_berlin;
  end if;

  -- The per-row call is what made this time out; make its return a hard failure
  -- rather than a silent performance regression on the next CREATE OR REPLACE.
  --
  -- COMMENTS ARE STRIPPED FIRST, and that is the whole point rather than a tidy-up.
  -- pg_get_functiondef returns the body INCLUDING its comments, and the body's own
  -- explanatory comment names the function it no longer calls ("Inlined from
  -- location_is_high_risk() rather than calling it per row"). The first version of
  -- this file scanned the raw text and so RAISED on itself: the migration was
  -- rejected by its own postcondition and every migration queued behind it was
  -- stranded. That is the identical defect as the unmerge_cities guard which held
  -- up 14 migrations the same day (#3860) — a guard that greps a function's source
  -- must look at the code, not at the prose explaining the code.
  select regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'cities_directory';
  if position('location_is_high_risk' in v_src) > 0 then
    raise exception 'cities_directory calls location_is_high_risk per row again';
  end if;
  if position('hr as materialized' in v_src) = 0 then
    raise exception 'the hr CTE lost its materialized hint; it would be inlined per row';
  end if;
end
$verify$;
