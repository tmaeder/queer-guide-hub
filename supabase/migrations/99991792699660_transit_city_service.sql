-- Transit Phase 4a: "last departure tonight" as a city fact.
-- Design: docs/plans/2026-10-22-zurich-late-night-mobility-design.md
--         docs/plans/2026-08-30-transit-mobility-phase-4-design.md §5.1
--
-- Two tables. Written ONLY by a GitHub Action (scripts/transit/build-city-service.mjs)
-- through commit_city_transit_service(); read by anon through get_city_transit_service().
-- Deliberately NOT search-indexed and never writes `cities` (a cities UPDATE fans out
-- through trg_sync_geo_spine into the search reindex queue).
--
-- Deviations from the phase-4 sketch, each measured on the Swiss feed (2026-10-22):
--  * buses are INCLUDED: Zürich's night network is 21 night-bus lines (BN) against
--    8 night S-Bahn lines; excluding buses hides the service this exists to publish.
--  * route_ref is NOT NULL and part of a plain PRIMARY KEY (no mode roll-up rows;
--    the UI aggregates). An expression cannot sit in a PRIMARY KEY anyway.
--  * is_night_line from the feed's own line class (BN/SN, type 705).
--  * reliability (VBZ SOLL/IST backfill) and observed_* (own OpenTrafficMap receiver)
--    live on the same row and are NEVER touched by the timetable commit.

create table if not exists public.transit_feeds (
  feed_key        text primary key,
  provider        text not null,
  country_code    text not null check (country_code ~ '^[A-Z]{2}$'),
  source_url      text not null,
  licence         text,
  attribution     text not null,
  feed_version    text,
  feed_start_date date,
  feed_end_date   date,
  parse_status    text not null check (parse_status in
                    ('ok','fetch_failed','unparseable','auth_required','no_stops')),
  parse_note      text,
  stop_count      integer,
  fetched_at      timestamptz,
  parsed_at       timestamptz
);

create table if not exists public.city_transit_service (
  city_id              uuid not null references public.cities(id) on delete cascade,
  feed_key             text not null references public.transit_feeds(feed_key) on delete cascade,
  mode                 text not null check (mode in ('metro','tram','rail','ferry','bus')),
  route_ref            text not null,
  is_night_line        boolean not null default false,
  day_class            text not null check (day_class in ('weekday','friday','saturday','sunday')),
  -- Seconds since service-day start, never `time`: departures run past 24:00.
  first_departure_s    integer not null check (first_departure_s >= 0),
  last_departure_s     integer not null check (last_departure_s >= 0),
  runs_all_night       boolean not null default false,
  trip_count           integer not null check (trip_count >= 0),
  service_scope        text not null check (service_scope in ('local','regional')),
  derived_at           timestamptz not null default now(),
  -- VBZ scheduled-vs-actual backfill (Stadt Zürich OGD, CC0). Period is shown in the UI.
  on_time_share        numeric(4,3) check (on_time_share between 0 and 1),
  reliability_period   text,
  -- Own OpenTrafficMap receiver (design Step 3, Branch A). Null until measured.
  observed_last_seen_s integer check (observed_last_seen_s >= 0),
  observed_nights      integer check (observed_nights >= 0),
  primary key (city_id, feed_key, mode, route_ref, day_class)
);

alter table public.transit_feeds enable row level security;
alter table public.city_transit_service enable row level security;
drop policy if exists transit_feeds_select on public.transit_feeds;
create policy transit_feeds_select on public.transit_feeds for select using (true);
drop policy if exists city_transit_service_select on public.city_transit_service;
create policy city_transit_service_select on public.city_transit_service for select using (true);
revoke all on public.transit_feeds, public.city_transit_service from anon, authenticated;
grant select on public.transit_feeds, public.city_transit_service to anon, authenticated;
grant all on public.transit_feeds, public.city_transit_service to service_role;

-- Writer. One feed, its rows for any number of cities. Upserts schedule columns,
-- deletes this feed's rows for those cities that were not re-derived (route retired),
-- and leaves reliability/observed columns alone.
create or replace function public.commit_city_transit_service(p_feed jsonb, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := p_feed->>'feed_key';
  v_upserted int;
  v_deleted int;
begin
  if v_key is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'commit_city_transit_service: feed_key and rows[] required' using errcode = '22023';
  end if;

  -- A failed run records WHY and touches nothing else: the dates and rows of the last
  -- good run keep serving until the feed itself expires (the reader's only gate).
  if coalesce(p_feed->>'parse_status','ok') <> 'ok' then
    insert into transit_feeds (feed_key, provider, country_code, source_url, attribution, parse_status, parse_note, fetched_at)
    values (v_key, coalesce(p_feed->>'provider','?'), coalesce(p_feed->>'country_code','XX'),
            coalesce(p_feed->>'source_url','?'), coalesce(p_feed->>'attribution','?'),
            p_feed->>'parse_status', p_feed->>'parse_note', now())
    on conflict (feed_key) do update set parse_status = excluded.parse_status,
      parse_note = excluded.parse_note, fetched_at = excluded.fetched_at;
    return jsonb_build_object('feed_key', v_key, 'upserted', 0, 'deleted', 0);
  end if;

  insert into transit_feeds as f (feed_key, provider, country_code, source_url, licence, attribution,
                                  feed_version, feed_start_date, feed_end_date, parse_status, parse_note,
                                  stop_count, fetched_at, parsed_at)
  values (v_key, p_feed->>'provider', p_feed->>'country_code', p_feed->>'source_url', p_feed->>'licence',
          p_feed->>'attribution', p_feed->>'feed_version', (p_feed->>'feed_start_date')::date,
          (p_feed->>'feed_end_date')::date, coalesce(p_feed->>'parse_status','ok'), p_feed->>'parse_note',
          (p_feed->>'stop_count')::int, now(), now())
  on conflict (feed_key) do update set
    provider = excluded.provider, country_code = excluded.country_code, source_url = excluded.source_url,
    licence = excluded.licence, attribution = excluded.attribution, feed_version = excluded.feed_version,
    feed_start_date = excluded.feed_start_date, feed_end_date = excluded.feed_end_date,
    parse_status = excluded.parse_status, parse_note = excluded.parse_note, stop_count = excluded.stop_count,
    fetched_at = excluded.fetched_at, parsed_at = excluded.parsed_at;

  create temp table _cts on commit drop as
  select * from jsonb_to_recordset(p_rows) as r(
    city_id uuid, mode text, route_ref text, is_night_line boolean, day_class text,
    first_departure_s int, last_departure_s int, runs_all_night boolean, trip_count int, service_scope text);

  insert into city_transit_service as c (city_id, feed_key, mode, route_ref, is_night_line, day_class,
         first_departure_s, last_departure_s, runs_all_night, trip_count, service_scope, derived_at)
  select city_id, v_key, mode, route_ref, coalesce(is_night_line,false), day_class,
         first_departure_s, last_departure_s, coalesce(runs_all_night,false), trip_count,
         coalesce(service_scope,'local'), now()
  from _cts
  on conflict (city_id, feed_key, mode, route_ref, day_class) do update set
    is_night_line = excluded.is_night_line, first_departure_s = excluded.first_departure_s,
    last_departure_s = excluded.last_departure_s, runs_all_night = excluded.runs_all_night,
    trip_count = excluded.trip_count, service_scope = excluded.service_scope, derived_at = excluded.derived_at;
  get diagnostics v_upserted = row_count;

  delete from city_transit_service c
  where c.feed_key = v_key
    and c.city_id in (select distinct city_id from _cts)
    and not exists (select 1 from _cts r where r.city_id = c.city_id and r.mode = c.mode
                    and r.route_ref = c.route_ref and r.day_class = c.day_class);
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('feed_key', v_key, 'upserted', v_upserted, 'deleted', v_deleted);
end
$$;
revoke all on function public.commit_city_transit_service(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_city_transit_service(jsonb, jsonb) to service_role;

-- Reader. Returns nothing for a city whose feed has expired: a timetable from an
-- expired feed is not stale, it is wrong (phase-4 design §6 sentinel). parse_status is
-- deliberately NOT a gate: one failed weekly fetch must not blank a valid timetable.
create or replace function public.get_city_transit_service(p_city_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'feed_key', f.feed_key, 'attribution', f.attribution, 'source_url', f.source_url,
           'licence', f.licence, 'feed_end_date', f.feed_end_date, 'derived_at', c.derived_at,
           'mode', c.mode, 'route_ref', c.route_ref, 'is_night_line', c.is_night_line,
           'day_class', c.day_class, 'first_departure_s', c.first_departure_s,
           'last_departure_s', c.last_departure_s, 'runs_all_night', c.runs_all_night,
           'trip_count', c.trip_count, 'service_scope', c.service_scope,
           'on_time_share', c.on_time_share, 'reliability_period', c.reliability_period,
           'observed_last_seen_s', c.observed_last_seen_s, 'observed_nights', c.observed_nights)
         order by c.mode, c.route_ref, c.day_class), '[]'::jsonb)
  from city_transit_service c
  join transit_feeds f on f.feed_key = c.feed_key
  where c.city_id = p_city_id
    and f.feed_end_date >= current_date;
$$;
revoke all on function public.get_city_transit_service(uuid) from public;
grant execute on function public.get_city_transit_service(uuid) to anon, authenticated, service_role;

do $verify$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.city_transit_service'::regclass) then
    raise exception 'city_transit_service: RLS not enabled';
  end if;
  if has_function_privilege('anon', 'public.commit_city_transit_service(jsonb, jsonb)', 'EXECUTE') then
    raise exception 'commit_city_transit_service must not be executable by anon';
  end if;
  if not has_function_privilege('anon', 'public.get_city_transit_service(uuid)', 'EXECUTE') then
    raise exception 'get_city_transit_service must be executable by anon';
  end if;
  if has_table_privilege('anon', 'public.city_transit_service', 'INSERT') then
    raise exception 'anon must not write city_transit_service';
  end if;
end
$verify$;
