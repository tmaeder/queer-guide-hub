-- growth_funnel_summary published a metric that could never be anything but 0.
--
-- `trip_adds` counted `user_activity_events` where event_type = 'trip.created'.
-- Measured on prod 2026-09-12, that table holds SIX rows in its entire history
-- — one `marketplace.favorite_added` and five `group.joined` — and
-- `trip.created` has never been written once. It also has no INSERT policy for
-- `authenticated` at all, so only a SECURITY DEFINER function could write it,
-- and none does.
--
-- So `trip_adds` was structurally 0, `save_to_trip_pct` was structurally 0, and
-- `trip_to_booking_pct` was structurally NULL — rendered on /admin/analytics as
-- if they were measurements. This is the class recorded in
-- docs/audits/2026-08-21-signup-consent-gap.md: an absence manufactured by a
-- writer that does not exist, presented as a fact about users.
--
-- FIX: count the artifact, not an event about the artifact. `public.trips` IS
-- the trip; `trips.created_at` is `timestamptz not null default now()`. A count
-- of rows in that table cannot drift from the thing it measures.
--
-- REJECTED: making `trip.created` writable. That is three new parts that can
-- each fail silently — an INSERT policy, a widened event vocabulary, and a new
-- writer in the trip-create path — added in order to re-derive a number we
-- already hold exactly. The value of an event log here would be knowing WHICH
-- trips came from a save; the event never carried that either.
--
-- `trip_adds_source` is returned so the dashboard can state its provenance
-- rather than the reader having to trust it.

create or replace function public.growth_funnel_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_since timestamptz;
  v_saves bigint;
  v_trip_adds bigint;
  v_booking_clicks bigint;
  v_impressions bigint;
begin
  if not has_role_jwt('admin'::app_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  p_days := greatest(1, least(coalesce(p_days, 30), 365));
  v_since := now() - make_interval(days => p_days);

  select
    (select count(*) from event_favorites      where created_at >= v_since)
  + (select count(*) from city_favorites        where created_at >= v_since)
  + (select count(*) from country_favorites     where created_at >= v_since)
  + (select count(*) from tag_favorites         where created_at >= v_since)
  + (select count(*) from marketplace_favorites where created_at >= v_since)
  + (select count(*) from news_favorites        where created_at >= v_since)
  into v_saves;

  -- Was: count(*) from user_activity_events where event_type = 'trip.created'.
  -- That event has never been written; see the header.
  select count(*) into v_trip_adds
  from public.trips
  where created_at >= v_since;

  select
    count(*) filter (where kind = 'click'),
    count(*) filter (where kind = 'impression')
  into v_booking_clicks, v_impressions
  from affiliate_clicks
  where clicked_at >= v_since;

  return jsonb_build_object(
    'window_days', p_days,
    'saves', v_saves,
    'trip_adds', v_trip_adds,
    'trip_adds_source', 'public.trips',
    'booking_clicks', v_booking_clicks,
    'impressions', v_impressions,
    'save_to_trip_pct',     round(100.0 * v_trip_adds      / nullif(v_saves, 0), 1),
    'trip_to_booking_pct',  round(100.0 * v_booking_clicks / nullif(v_trip_adds, 0), 1),
    'affiliate_ctr_pct',    round(100.0 * v_booking_clicks / nullif(v_impressions, 0), 1),
    'generated_at', now()
  );
end;
$function$;

comment on function public.growth_funnel_summary(integer) is
  'Admin-gated growth funnel. trip_adds counts public.trips directly: the previous source, user_activity_events.trip.created, has never been written (6 rows in that table ever, none of that type), so the metric was structurally zero while rendering as a measurement.';

do $verify$
declare
  v_events bigint;
  v_trips  bigint;
begin
  -- The premise, re-asserted rather than trusted: if `trip.created` has started
  -- being written since this was authored, the fix is still correct but its
  -- justification is not, and that is worth failing on so a human re-reads it.
  select count(*) into v_events
    from public.user_activity_events where event_type = 'trip.created';
  if v_events > 0 then
    raise exception
      'user_activity_events now has % trip.created rows — a writer appeared; re-read this migration before applying it',
      v_events;
  end if;

  -- And the replacement source is not itself empty-by-construction.
  select count(*) into v_trips from public.trips;
  if v_trips = 0 then
    raise exception 'public.trips is empty — repointing trip_adds at it would swap one structural zero for another';
  end if;

  raise notice 'growth_funnel_summary.trip_adds repointed at public.trips (% rows)', v_trips;
end
$verify$;
