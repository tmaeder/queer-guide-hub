-- §14.6 trip-window events: "what's on during my trip" — events overlapping a
-- date range, optionally city/country scoped. Complements search_hybrid (which
-- only hides past events, no window). Reads search_documents (events), live-filtered.
-- Overlap rule (start <= window_end AND end >= window_start) correctly includes
-- ongoing multi-day events (e.g. a months-long exhibition during a summer trip).
create or replace function public.events_in_window(
  p_start   timestamptz,
  p_end     timestamptz,
  p_city    text default null,
  p_country text default null,
  p_limit   int  default 50
) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'objectID', entity_id, 'type', 'event', 'title', title,
    'description', left(description, 200), 'city', city, 'country', country,
    'slug', slug, 'imageUrl', image_url,
    'start_date', extract(epoch from start_date), 'end_date', extract(epoch from end_date),
    'is_free', is_free, 'price_min', price_min, 'price_max', price_max,
    'featured', is_featured,
    '_geoloc', case when geog is not null then jsonb_build_object('lat', st_y(geog::geometry), 'lng', st_x(geog::geometry)) end
  ) order by start_date), '[]'::jsonb)
  from (
    select entity_id, title, description, city, country, slug, image_url,
           start_date, end_date, is_free, price_min, price_max, is_featured, geog
    from public.search_documents
    where entity_type = 'event'
      and start_date is not null
      and start_date <= p_end
      and coalesce(end_date, start_date) >= p_start
      and (p_city    is null or lower(city)    = lower(p_city))
      and (p_country is null or lower(country) = lower(p_country))
      and coalesce(liveness_status,'') not in ('dead','cancelled','dead_link')
    order by start_date
    limit greatest(p_limit, 0)
  ) e;
$$;

grant execute on function public.events_in_window(timestamptz, timestamptz, text, text, int) to anon, authenticated, service_role;
