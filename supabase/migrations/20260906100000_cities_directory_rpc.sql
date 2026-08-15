-- /cities was showing 400 of 3,068 listable cities, and the 400 were chosen by
-- POPULATION. That is the wrong axis for this site: it deletes exactly the small,
-- queer-dense places the directory exists for. Measured before this migration:
--
--   listable cities                                        3,068
--   shown by /cities                                          400
--   cities WITH approved venues that /cities excluded       1,768
--   approved venues in unreachable cities      9,729 of 24,268  (40%)
--
-- Absent from the directory: Brighton (184 venues), Zürich (155), Pattaya (113),
-- Sitges (87), Palm Springs (85), Miami (84), Puerto Vallarta (82), West Hollywood
-- (68), Torremolinos (67), Tel Aviv (44). Tel Aviv is the clinching case — it is on
-- the HOMEPAGE, with a hand-reviewed committed transit diagram, and you could not
-- reach it from the city directory.
--
-- Same failure class as filtering venues by category "relevance": a plausible global
-- filter that removes the real gay bars.
--
-- THE GATE. This adopts the one `functions/sitemap-places.xml.ts` already uses and
-- the directory hook never did. It is not "the cap, but larger" — it fixes both ends:
--
--                              | 400 cap | this gate
--   cities listed              |     400 |     2,142
--   ...with zero venues        |      36 |        27
--   ...ghost/merged junk rows  |     144 |         0     ('Indonesien', '—N/a', …)
--
-- so the directory gets 5.4x bigger AND cleaner. A naive `limit 4000` would instead
-- have dumped 936 empty shells and 144 archived non-places onto the page.
--
-- WHY ONE FUNCTION INSTEAD OF THE PREVIOUS TWO-QUERY SHAPE. useCitiesDirectory paired
-- the capped select with a venue-count query batched at 100 ids (PostgREST/Cloudflare
-- cap the URL near 8 KB). At 2,142 cities that fan-out is 22 round trips. Rolling the
-- counts into the same statement measures ~100 ms server-side, 0.31 s over the wire.
--
-- WHY IT RETURNS jsonb AND NOT `RETURNS TABLE`.  ***This is the whole point of the
-- shape and it must not be "simplified" back.***  PostgREST enforces `db-max-rows`,
-- which is 1000 on this project, on any set-returning endpoint — including an RPC.
-- The first version of this function returned a table, and the API answered
-- HTTP 200 with exactly 1000 of the 2,142 rows, silently. Berlin — the single
-- densest city in the corpus, 870 venues — was not among them, because the
-- function had no ORDER BY and the planner emitted them in physical order. A
-- `Range: 0-4999` header does NOT lift the cap; it is a server setting, not a
-- client one. That is the same silent-truncation defect this migration exists to
-- fix, reintroduced one layer up. A scalar (jsonb) function returns ONE row, so
-- the cap cannot apply, and the whole directory arrives in a single request.
--
-- The ORDER BY inside the aggregate is belt-and-braces: it makes the payload
-- deterministic, and it means that if anything downstream ever DOES truncate, what
-- survives is the densest cities rather than an arbitrary slice.
--
-- `jsonb_strip_nulls` drops absent optional keys (name_en and name_de are NULL on
-- 2,135 of 2,142 rows — the city-fields backfill recorded name_en as a dead end and
-- the corpus agrees; editorial_hook is NULL on 2,043). Worth ~11% of the payload.
-- The client's types already treat every one of those as optional.
--
-- WHY SECURITY DEFINER. RLS hides `safety_gated` venues from anon — 1,014 venues
-- across 144 cities in criminalizing countries. Under invoker rights those cities'
-- venue_count, and therefore their position once the directory sorts by content
-- density, would change depending on whether you were logged in. Counting gated
-- entities to anon is already sanctioned here: `gated_count_for_location` exists to
-- power the "Sign in to view N places" notice. It is the ROWS that are gated, not
-- their number.
--
-- This is STABLE, so it is out of scope for the anon-function exposure gate
-- (check-anon-function-grants.mjs targets VOLATILE + SECURITY DEFINER — functions
-- that can WRITE while bypassing RLS). It reads nothing an anonymous visitor cannot
-- already see on a city page, and the grants below are written out explicitly rather
-- than left to Supabase's ALTER DEFAULT PRIVILEGES.

-- The first draft returned a table; a return-type change cannot be done with
-- CREATE OR REPLACE.
drop function if exists public.cities_directory();

create or replace function public.cities_directory()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
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
      -- predicate that decides whether that city's venues are gated at all.
      public.location_is_high_risk(c.country_id, c.id) as high_risk
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
$$;

comment on function public.cities_directory() is
  'Public city directory: every seo-indexable, non-ghost, non-duplicate city with '
  'venue / upcoming-event / queer-village counts and the resolved high-risk flag. '
  'Returns jsonb, NOT a table: PostgREST caps set-returning endpoints at db-max-rows '
  '(1000 here) and silently truncated the 2,142-row directory, dropping Berlin. '
  'Counts are SECURITY DEFINER on purpose so safety-gated rows still contribute a '
  'number (same rationale as gated_count_for_location) and the sort order does not '
  'change with auth state.';

revoke all on function public.cities_directory() from public;
grant execute on function public.cities_directory() to anon, authenticated, service_role;
