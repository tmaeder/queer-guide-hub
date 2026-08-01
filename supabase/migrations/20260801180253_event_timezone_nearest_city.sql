-- Timezone fill by nearest timezone-bearing city, plus the Canadian half of the
-- state-code repair.
--
-- run_event_geo_fill only reaches events that have a city_id, and it deliberately
-- refuses to fall back to countries.timezone for multi-zone countries (that column is
-- 'America/New_York' for the US, so a blanket fallback would mislabel every LA event).
-- That left 4,206 events without a timezone, 3,745 of them in the US.
--
-- Nearest-city is a better proxy than any state table because timezone boundaries
-- follow geography and it self-corrects for the split states (FL, IN, KY, MI, TN, TX,
-- ND, SD, NE, KS, OR, ID). Validated against the 35,332 events whose timezone is
-- already known:
--
--     nearest tz-bearing city within 250 km : 99.71% agreement (34,865 events)
--     nearest tz-bearing city beyond 250 km : 96.79% agreement (467 events)
--
-- Hence the 250 km cap. Without it the method reaches absurdly far and guesses wrong:
-- no Alaskan city in `cities` carries a timezone, so Anchorage matched Bellingham WA
-- ~2,200 km away and would have been labelled America/Los_Angeles. Beyond the cap we
-- decline rather than guess.
--
-- (Several apparent "disagreements" in that validation are the STORED value being wrong
-- and this method being right — e.g. Portland, Oregon events stamped America/New_York.
-- Those are left alone here; this function only fills NULLs, it never overwrites.)

create or replace function public.run_event_timezone_fill(
  p_batch integer default 300,
  p_force boolean default false
)
returns table(processed integer, by_city integer, by_country integer)
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  r           record;
  v_proc      integer := 0;
  v_city      integer := 0;
  v_country   integer := 0;
  v_tz        text;
  -- Countries spanning more than one IANA zone: never fall back to countries.timezone
  -- for these. Same list as run_event_geo_fill.
  c_multizone constant text[] := array[
    'US','CA','AU','BR','RU','MX','ID','KZ','CD','CL','EC','ES','PT','FR','NZ',
    'MN','CN','GL','KI','PF','UM','AQ','PG','MH','FM','GB','NL','DK','PS'
  ];
begin
  for r in
    select e.id, e.country_id, e.latitude, e.longitude, co.timezone co_tz, co.code co_code
    from public.events e
    left join public.countries co on co.id = e.country_id
    where e.duplicate_of_id is null
      and e.timezone is null
      and (p_force or not (coalesce(e.enrichment_status, '{}'::jsonb) ? 'event_tz_fill'))
    order by (e.start_date >= now()) desc nulls last, e.start_date desc nulls last, e.id
    limit greatest(p_batch, 1)
  loop
    v_proc := v_proc + 1;
    v_tz := null;

    if r.latitude is not null and r.longitude is not null and r.country_id is not null then
      select c.timezone into v_tz
      from public.cities c
      where c.duplicate_of_id is null
        and c.country_id = r.country_id
        and c.timezone is not null
        and c.latitude is not null and c.longitude is not null
        and extensions.st_dwithin(
              extensions.st_setsrid(extensions.st_makepoint(r.longitude::float8, r.latitude::float8), 4326)::extensions.geography,
              extensions.st_setsrid(extensions.st_makepoint(c.longitude::float8, c.latitude::float8), 4326)::extensions.geography,
              250000)
      order by extensions.st_distance(
              extensions.st_setsrid(extensions.st_makepoint(r.longitude::float8, r.latitude::float8), 4326)::extensions.geography,
              extensions.st_setsrid(extensions.st_makepoint(c.longitude::float8, c.latitude::float8), 4326)::extensions.geography)
      limit 1;

      if v_tz is not null then v_city := v_city + 1; end if;
    end if;

    -- Only for genuinely single-zone countries, and only when geography gave nothing.
    if v_tz is null
       and nullif(btrim(r.co_tz), '') is not null
       and not (r.co_code = any (c_multizone)) then
      v_tz := r.co_tz;
      v_country := v_country + 1;
    end if;

    update public.events set
      timezone = coalesce(timezone, v_tz),
      enrichment_status = jsonb_set(
        coalesce(enrichment_status, '{}'::jsonb), '{event_tz_fill}',
        jsonb_build_object('at', now(), 'filled', v_tz is not null), true)
    where id = r.id;
  end loop;

  processed := v_proc; by_city := v_city; by_country := v_country; return next;
end;
$$;

revoke all on function public.run_event_timezone_fill(integer, boolean) from public, anon, authenticated;
grant execute on function public.run_event_timezone_fill(integer, boolean) to service_role;

comment on function public.run_event_timezone_fill(integer, boolean) is
  'Batched: fills events.timezone from the nearest timezone-bearing city in the same country within 250km (99.7% agreement against known-timezone events), falling back to countries.timezone only for single-timezone countries. Never overwrites an existing value.';

-- Canadian half of the state-code repair. `20260801142627` covered the 51 US state
-- codes; ON (Collingwood, Vaughan, Windsor, St Catharines, The Blue Mountains) and
-- BC (Birken) are Canadian provinces sitting in events.country and never resolved.
-- NL/PE/SK are left alone: they resolve correctly as Netherlands / Peru / Slovakia.
update public.events e
   set country = 'CA'
 where e.duplicate_of_id is null
   and e.country_id is null
   and upper(btrim(e.country)) in ('ON', 'BC');
