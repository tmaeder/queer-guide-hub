-- The candidate pool behind the day-level itinerary generator.
--
-- Sibling of `line_station_pool` (20260901100000). That one answers "which
-- cities form a route"; this one answers "what happens inside one of them, on a
-- given day, at a given time of day". Same conventions on purpose: one RPC, one
-- fetch, cached on the client, SECURITY INVOKER so the safety layer flows
-- through for free.
--
-- WHY THE STORED `venues.day_part` COLUMN IS NOT SELECTED
--
-- `20260526000000_trip_suggest_foundation.sql` backfilled `venues.day_part`
-- from `venues.category` in May 2026 and nothing has recomputed it since.
-- `run_venue_category_reclassify` has been rewriting `venues.category` nightly
-- since 2026-08, so the derived column now contradicts the input it was derived
-- from. Measured on prod 2026-08-31, live venues only:
--
--     category      rows    day_part contradicts its own backfill rule
--     bar           8,526   4,375  (51%)
--     club          1,977   1,001  (51%)
--     restaurant    1,274     892  (70%)
--     hotel           534     203
--     cruising         97      67
--
-- Half the bars in the corpus are stored as a morning activity. A generator
-- slotting by that column builds evenings out of cafes and is most confidently
-- wrong on `nightlife`, the most-picked vibe. That backfill also ended with an
-- unconditional catch-all (`SET day_part = '{morning,afternoon}' WHERE day_part
-- = '{}'`), so 15,833 of 25,178 live rows carry the same value whether it was
-- inferred or merely unknown.
--
-- So the day part is derived HERE, from the current `category`, on every read.
-- It cannot go stale because it is never stored. Repairing the stored column is
-- worth doing separately; it needs a batched runner (a 15,833-row `venues`
-- UPDATE fans into the search sync) and it has no reader once this lands.
--
-- `day_part_known` is the honest half. It is false when `category` is null or
-- `'other'` — 5,409 live rows — where the returned array is a permissive
-- "any slot", not a claim. The generator ranks those below a known match and
-- never uses one to justify a slot on time-of-day grounds alone.
--
-- EVENTS ARE THE OPPOSITE CASE AND ARE TRUSTED
--
-- `events.start_date` is timestamptz and the time is real: of 3,335 future
-- events, 3,330 carry a timezone and only 14 sit at local midnight. So an
-- event's day part is read from its own local start hour, not guessed. That is
-- why a dated event wins its slot over any venue in the generator — it is the
-- day's fixed point rather than a ranked suggestion.
--
-- `toilet` is excluded from the pool entirely. 1,469 live rows, and a restroom
-- is infrastructure, not a stop on a plan. It stays discoverable on the map and
-- in search, which is where someone actually looks for one.

-- ---------------------------------------------------------------------------
-- Category -> day part. One object, so the rule is stated once.
-- ---------------------------------------------------------------------------
create or replace function public.venue_category_day_part(p_category text)
returns text[]
language sql
immutable
parallel safe
as $$
  select case p_category
    when 'cafe'             then array['morning','afternoon']
    when 'restaurant'       then array['afternoon','evening']
    when 'bar'              then array['evening','night']
    when 'club'             then array['night']
    when 'cruising'         then array['night']
    when 'sauna'            then array['afternoon','evening','night']
    when 'shop'             then array['morning','afternoon']
    when 'salon'            then array['morning','afternoon']
    when 'gallery'          then array['morning','afternoon']
    when 'theater'          then array['evening','night']
    when 'event-venue'      then array['evening','night']
    when 'community_center' then array['morning','afternoon','evening']
    when 'outdoor'          then array['morning','afternoon','evening']
    when 'gym'              then array['morning','afternoon','evening']
    when 'hotel'            then array['morning','afternoon','evening','night']
    -- 'other', 'toilet' and NULL fall through: permissive, and reported as
    -- not-known so the caller can tell a default from a signal.
    else array['morning','afternoon','evening','night']
  end;
$$;

comment on function public.venue_category_day_part(text) is
  'Day parts a venue category is plausibly visited in. Derived on read from the maintained `category` column; the stored `venues.day_part` is stale by up to 70% per category (see 20261117100000) and must not be used.';

-- ---------------------------------------------------------------------------
-- The pool
-- ---------------------------------------------------------------------------
create or replace function public.itinerary_candidate_pool(
  p_city_ids uuid[],
  p_from     date default null,
  p_to       date default null,
  p_per_bucket int default 25
)
returns table (
  kind             text,
  id               uuid,
  name             text,
  slug             text,
  city_id          uuid,
  country_id       uuid,
  latitude         double precision,
  longitude        double precision,
  category         text,
  subtype          text,
  day_part         text[],
  day_part_known   boolean,
  tags             text[],
  accessibility_attributes text[],
  amenities        text[],
  price_level      integer,
  is_free          boolean,
  quality_score    integer,
  rating           numeric,
  image_url        text,
  starts_at        timestamptz,
  ends_at          timestamptz,
  venue_id         uuid
)
language sql
stable
security invoker
set search_path = 'public'
as $$
  with venue_ranked as (
    select
      v.id, v.name, v.slug, v.city_id, v.country_id,
      v.latitude::double precision  as latitude,
      v.longitude::double precision as longitude,
      v.category, v.venue_subtype,
      coalesce(v.tags, '{}'::text[])                     as tags,
      coalesce(v.accessibility_attributes, '{}'::text[])  as accessibility_attributes,
      coalesce(v.amenities, '{}'::text[])                 as amenities,
      v.price_range, v.quality_score, v.foursquare_rating,
      v.images[1] as image_url,
      row_number() over (
        partition by v.city_id, v.category
        order by v.quality_score desc nulls last,
                 v.foursquare_rating desc nulls last,
                 v.is_featured desc,
                 v.id
      ) as rn
    from venues v
    where v.city_id = any(p_city_ids)
      and v.duplicate_of_id is null
      and v.closed_at is null
      and v.review_status is distinct from 'archived'
      and v.latitude is not null
      and v.longitude is not null
      -- Infrastructure, not an itinerary stop.
      and v.category is distinct from 'toilet'
  )
  select
    'venue'::text                                  as kind,
    r.id, r.name, r.slug, r.city_id, r.country_id,
    r.latitude, r.longitude,
    r.category,
    r.venue_subtype                                as subtype,
    public.venue_category_day_part(r.category)     as day_part,
    (r.category is not null and r.category <> 'other') as day_part_known,
    r.tags, r.accessibility_attributes, r.amenities,
    r.price_range                                  as price_level,
    null::boolean                                  as is_free,
    r.quality_score::integer,
    r.foursquare_rating                            as rating,
    r.image_url,
    null::timestamptz                              as starts_at,
    null::timestamptz                              as ends_at,
    null::uuid                                     as venue_id
  from venue_ranked r
  where r.rn <= greatest(p_per_bucket, 1)

  union all

  select
    'event'::text                                  as kind,
    -- Column order follows the RETURNS TABLE list: id, name, slug.
    e.id, e.title, e.slug, e.city_id, e.country_id,
    e.latitude::double precision, e.longitude::double precision,
    e.event_type                                   as category,
    null::text                                     as subtype,
    -- Real local start hour, not a guess. 3,330 of 3,335 future events carry a
    -- timezone; the 5 that do not fall back to UTC rather than to a default
    -- slot, so the value stays derived from the row's own data.
    array[
      case
        when extract(hour from e.start_date at time zone coalesce(e.timezone, 'UTC')) between 5  and 11 then 'morning'
        when extract(hour from e.start_date at time zone coalesce(e.timezone, 'UTC')) between 12 and 16 then 'afternoon'
        when extract(hour from e.start_date at time zone coalesce(e.timezone, 'UTC')) between 17 and 21 then 'evening'
        else 'night'
      end
    ]                                              as day_part,
    true                                           as day_part_known,
    coalesce(e.tags, '{}'::text[])                 as tags,
    coalesce(e.accessibility_attributes, '{}'::text[]) as accessibility_attributes,
    '{}'::text[]                                   as amenities,
    null::integer                                  as price_level,
    e.is_free,
    e.quality_score::integer,
    null::numeric                                  as rating,
    e.images[1]                                    as image_url,
    e.start_date                                   as starts_at,
    e.end_date                                     as ends_at,
    e.venue_id
  from events e
  where e.city_id = any(p_city_ids)
    and e.duplicate_of_id is null
    and e.latitude is not null
    and e.longitude is not null
    -- A cancelled event is not a plan. `liveness_status` is the Event Truth
    -- Loop's column; NULL means unchecked, which is not the same as dead.
    and coalesce(e.liveness_status, 'unknown') not in ('cancelled', 'dead_link')
    and (p_from is null or e.start_date >= p_from::timestamptz)
    and (p_to   is null or e.start_date <  (p_to + 1)::timestamptz);
$$;

comment on function public.itinerary_candidate_pool(uuid[], date, date, integer) is
  'Venues + dated events for a set of cities and a date window, carrying the signals the day-level itinerary generator scores on. SECURITY INVOKER: safety_gated rows drop out for anon exactly as they do everywhere else, so the same seed yields a different plan signed-out vs signed-in and !!user belongs in the React Query key.';

revoke all on function public.venue_category_day_part(text) from public;
grant execute on function public.venue_category_day_part(text) to anon, authenticated, service_role;

revoke all on function public.itinerary_candidate_pool(uuid[], date, date, integer) from public;
grant execute on function public.itinerary_candidate_pool(uuid[], date, date, integer) to anon, authenticated, service_role;
