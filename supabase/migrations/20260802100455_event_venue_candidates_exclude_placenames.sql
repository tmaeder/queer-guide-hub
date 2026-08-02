-- Exclude place-names from the event -> venue candidate set.
--
-- Scraped events routinely carry a CITY or NEIGHBOURHOOD in venue_name ("San
-- Francisco", "Puerto Vallarta", "East Village", "Hillcrest"), and `venues`
-- contains rows with those same names. Both sides normalize identically, so the
-- pair scores name_exact=true and link_event_venues auto-applies it — attaching
-- events to a venue record that is not a venue at all.
--
-- Measured over the whole corpus before this change: 82 candidates, 65 of them
-- name_exact, of which 15 (14 city names + 1 queer-village name) were place
-- collisions. That is a 23% error rate on the branch that needs no human review.
-- run_event_venue_link has no cron and has never run, so nothing was corrupted
-- yet; this makes it safe to enable.
--
-- Only the EVENT side is filtered. A venue legitimately named after its
-- neighbourhood still matches when the event names an actual venue.
create or replace function public.find_event_venue_candidates(
  p_limit integer default 500,
  p_active_only boolean default true
)
returns table(event_id uuid, venue_id uuid, event_venue_name text, venue_name text, name_exact boolean, distance_m numeric)
language sql
stable security definer
set search_path to 'public', 'extensions'
as $function$
  WITH ev AS (
    SELECT e.id, e.venue_name, e.city_id, e.latitude, e.longitude,
           public.normalize_name(e.venue_name) AS vn_norm
    FROM public.events e
    WHERE e.venue_id IS NULL
      AND e.venue_name IS NOT NULL AND btrim(e.venue_name) <> ''
      AND e.city_id IS NOT NULL
      AND e.duplicate_of_id IS NULL
      AND (NOT p_active_only
           OR e.start_date IS NULL
           OR e.start_date >= now() - interval '1 year')
      -- venue_name is really a place name -> not a venue link candidate
      AND NOT EXISTS (
        SELECT 1 FROM public.cities c
         WHERE c.duplicate_of_id IS NULL
           AND lower(btrim(c.name)) = lower(btrim(e.venue_name))
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.queer_villages qv
         WHERE lower(btrim(qv.name)) = lower(btrim(e.venue_name))
      )
    ORDER BY e.start_date DESC NULLS LAST
    LIMIT greatest(coalesce(p_limit, 500), 0)
  )
  SELECT ev.id,
         v.id,
         ev.venue_name,
         v.name,
         (coalesce(v.name_normalized, public.normalize_name(v.name)) = ev.vn_norm) AS name_exact,
         CASE
           WHEN ev.latitude IS NOT NULL AND ev.longitude IS NOT NULL
            AND v.latitude  IS NOT NULL AND v.longitude  IS NOT NULL THEN
             round((2 * 6371000 * asin(least(1.0::float8, sqrt(
                 power(sin(radians((v.latitude - ev.latitude)::float8) / 2), 2)
               + cos(radians(ev.latitude::float8)) * cos(radians(v.latitude::float8))
               * power(sin(radians((v.longitude - ev.longitude)::float8) / 2), 2)
             ))))::numeric, 1)
           ELSE NULL
         END AS distance_m
  FROM ev
  JOIN public.venues v
    ON v.city_id = ev.city_id
   AND v.duplicate_of_id IS NULL
  WHERE ev.vn_norm <> ''
    AND (coalesce(v.name_normalized, public.normalize_name(v.name)) = ev.vn_norm
         OR extensions.similarity(
              coalesce(v.name_normalized, public.normalize_name(v.name)), ev.vn_norm) >= 0.80)
  ORDER BY ev.id,
           (coalesce(v.name_normalized, public.normalize_name(v.name)) = ev.vn_norm) DESC,
           extensions.similarity(
             coalesce(v.name_normalized, public.normalize_name(v.name)), ev.vn_norm) DESC,
           distance_m NULLS LAST;
$function$;

comment on function public.find_event_venue_candidates(integer, boolean) is
  'Event -> venue link candidates within the same city. Skips events whose venue_name is actually a city or queer-village name: scraped events often carry the city there, and venues rows share those names, so the pair normalizes to name_exact and would auto-link an event to a non-venue.';;