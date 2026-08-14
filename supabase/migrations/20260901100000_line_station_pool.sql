-- The station pool behind the /trips/discover line generator.
--
-- WHY A FUNCTION AND NOT A CLIENT QUERY
--
-- The generator needs, per city: live venue count, venue counts split by
-- category (that is what a "vibe" is), upcoming event count, the next event,
-- which months have events, and whether the city has a queer village. None of
-- that is denormalised anywhere:
--
--   * `cities` carries no counts. There is no city_stats view and no matview.
--   * `search_documents` is not a shortcut either — its city rows have
--     `quality_score` 100% NULL, `lgbtq_score` at exactly one distinct value
--     (0.5, constant), and `facets` holding only {country, is_major_city,
--     lgbt_friendly_rating}. No counts.
--
-- So it needs an aggregate join, and the gate is `having count(*) >= 10`.
-- PostgREST has no HAVING and cannot filter or order by an embedded aggregate,
-- and the seven conditional category aggregates have no embed form at all.
--
-- Measured on prod before this shipped: 346 rows, 51 ms, 8,135 buffers, every
-- one a shared hit. Fetch it once and cache it for an hour; the pool changes
-- on the timescale of the ingest crons, not the timescale of a page view.
--
-- SECURITY INVOKER IS LOAD-BEARING — DO NOT "OPTIMISE" IT TO DEFINER
--
-- `venues` and `events` both carry RLS `((NOT safety_gated) OR (auth.uid() IS
-- NOT NULL))`. Because the pool gate is a venue count computed under the
-- CALLER's RLS, the safety layer flows through the aggregate for free: for an
-- anonymous reader the criminalising-country cities lose every venue and fall
-- out of the `>= 10` gate on their own. Measured: 346 rows signed in, 337 as
-- anon, and the nine that drop are exactly Cairo, Lagos, Kuala Lumpur,
-- Jakarta, Nairobi, Denpasar, Kabul, Yangon and Dar es Salaam — every one of
-- them equality_score <= 17.
--
-- A SECURITY DEFINER version would compute those counts as `postgres` and hand
-- an anonymous visitor a station in a country whose scene this platform has
-- deliberately decided not to show them. That is the whole point of the gating
-- layer, defeated by one word. The consequence to hold in mind on the client:
-- the same seed yields a different line signed-out vs signed-in, so `!!user`
-- belongs in the React Query key.
--
-- WHAT THE FILTERS MEAN
--
-- image_url / description / safety_notes / coordinates are not nice-to-haves,
-- they are the definition of a station: a plate with no name, no line of prose
-- and no position on the map is not something a person can be sent to. The
-- generator treats them as HARD and never relaxes them, at any degradation
-- rung, in exchange for a longer line.
--
-- `venues.category = 'other'` is 57% of the whole venue table, so it is
-- counted into venue_count but is deliberately NOT exposed as a vibe — a
-- filter that matches most of the corpus filters nothing.
--
-- Event months are bucketed in UTC on purpose. The bucket is coarse (a month)
-- and is compared against a client-side window; letting it follow the server
-- session timezone would make the same row land in different buckets for
-- different callers.

create or replace function public.line_station_pool()
returns table (
  id                uuid,
  name              text,
  slug              text,
  image_url         text,
  description       text,
  safety_notes      text,
  editorial_hook    text,
  latitude          double precision,
  longitude         double precision,
  timezone          text,
  population        bigint,
  lgbt_friendly_rating integer,
  country_id        uuid,
  country_name      text,
  country_code      text,
  currency          text,
  equality_score    integer,
  lgbti_criminalization jsonb,
  venue_count       integer,
  nightlife_count   integer,
  sauna_count       integer,
  cafe_count        integer,
  community_count   integer,
  outdoor_count     integer,
  shop_count        integer,
  event_count       integer,
  pride_count       integer,
  next_event_at     timestamptz,
  next_event_title  text,
  event_months      text[],
  village_count     integer,
  village_name      text
)
language sql
stable
security invoker
set search_path = 'public'
as $$
  with v as (
    select v.city_id,
           count(*)::int                                                    as venue_count,
           count(*) filter (where v.category in ('bar', 'club'))::int        as nightlife_count,
           count(*) filter (where v.category = 'sauna')::int                 as sauna_count,
           count(*) filter (where v.category in ('cafe', 'restaurant'))::int as cafe_count,
           count(*) filter (where v.category = 'community_center')::int      as community_count,
           count(*) filter (where v.category = 'outdoor')::int               as outdoor_count,
           count(*) filter (where v.category = 'shop')::int                  as shop_count
    from venues v
    where v.city_id is not null
      and v.duplicate_of_id is null
      and v.closed_at is null
    group by v.city_id
    having count(*) >= 10
  ), e as (
    select e.city_id,
           count(*)::int                                             as event_count,
           count(*) filter (where e.event_type ilike '%pride%')::int  as pride_count,
           min(e.start_date)                                          as next_event_at,
           (array_agg(e.title order by e.start_date))[1]              as next_event_title,
           array_agg(distinct to_char(e.start_date at time zone 'UTC', 'YYYY-MM')) as event_months
    from events e
    where e.city_id is not null
      and e.duplicate_of_id is null
      and e.start_date >= now()
    group by e.city_id
  ), q as (
    select qv.city_id,
           count(*)::int                                              as village_count,
           (array_agg(qv.name order by qv.featured desc nulls last))[1] as village_name
    from queer_villages qv
    where qv.city_id is not null
      and qv.duplicate_of_id is null
    group by qv.city_id
  )
  select c.id,
         c.name,
         c.slug,
         c.image_url,
         c.description,
         c.safety_notes,
         c.editorial_hook,
         c.latitude::double precision,
         c.longitude::double precision,
         c.timezone,
         c.population,
         c.lgbt_friendly_rating,
         co.id,
         co.name,
         co.code,
         co.currency,
         co.equality_score,
         co.lgbti_criminalization,
         v.venue_count,
         v.nightlife_count,
         v.sauna_count,
         v.cafe_count,
         v.community_count,
         v.outdoor_count,
         v.shop_count,
         coalesce(e.event_count, 0),
         coalesce(e.pride_count, 0),
         e.next_event_at,
         e.next_event_title,
         e.event_months,
         coalesce(q.village_count, 0),
         q.village_name
  from cities c
  join countries co on co.id = c.country_id
  join v on v.city_id = c.id
  left join e on e.city_id = c.id
  left join q on q.city_id = c.id
  where c.duplicate_of_id is null
    and c.image_url is not null
    and c.description is not null
    and c.safety_notes is not null
    and c.latitude is not null
    and c.longitude is not null;
$$;

comment on function public.line_station_pool() is
  'Station pool for the /trips/discover line generator: cities with an image, '
  'prose, safety notes, coordinates and >= 10 live venues, plus per-category '
  'venue counts, upcoming events and queer-village presence. SECURITY INVOKER '
  'so the venue/event RLS safety gate flows through the aggregate — a DEFINER '
  'version would expose criminalising-country cities to anonymous readers.';

-- This project has DEFAULT PRIVILEGES that grant EXECUTE on new functions to
-- PUBLIC, so state the intent explicitly rather than inheriting it: revoke the
-- blanket grant, then hand it to the two API roles that should have it. The
-- function is safe for anon precisely because it is SECURITY INVOKER.
revoke all on function public.line_station_pool() from public;
grant execute on function public.line_station_pool() to anon, authenticated, service_role;
