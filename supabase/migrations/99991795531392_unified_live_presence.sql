-- One live switch for Nearby and Dating (phase 5 of
-- docs/plans/2026-11-24-meet-dating-identity-design.md).
--
-- Before: Nearby wrote user_presence_location (per person, snapped 750 m /
-- 2 km high-risk, TTL 60 min); the dating map read intimate_cruising_mode
-- (city only, 15-240 min, safety acknowledgement). Two switches, two stores.
-- After: one row in user_presence_location with an audience:
--   Everyone     -> visibility 'discovery'
--   Friends      -> visibility 'friends_only'
--   Dating only  -> visibility 'off', dating_visible = true
--
-- SAFETY RULES THIS FILE ENFORCES
-- 1. A dating-only presence never reaches the social Nearby list.
--    people_discovery selects `visibility <> 'off'`, so dating presence must
--    carry visibility 'off'. A CHECK makes any other combination impossible.
-- 2. The dating map stays aggregate-only: cruising_presence_areas returns a
--    count per city, never a person or a point. Same eligibility, approval,
--    block and test-account filters as before.
-- 3. Writes go through presence_upsert only. authenticated could write its
--    own row directly (RLS presence_self_all), which skipped the server snap
--    and would skip the dating eligibility and safety checks. Only the
--    client's own SELECT is kept (verified: no client or function writes the
--    table directly).
--
-- intimate_cruising_mode stays readable for one transition step: the map
-- counts both stores until phase 6 drops the old one.

alter table public.user_presence_location
  add column if not exists dating_visible boolean not null default false;

alter table public.user_presence_location
  drop constraint if exists user_presence_location_dating_only;
alter table public.user_presence_location
  add constraint user_presence_location_dating_only
  check (not dating_visible or visibility = 'off');

alter table public.intimate_profiles
  add column if not exists presence_safety_acknowledged_at timestamptz;

comment on column public.intimate_profiles.presence_safety_acknowledged_at is
  'When the member accepted the cruising/dating presence safety notice. Required before a dating presence is written.';

-- Carry over the acknowledgements given in the old cruising control.
update public.intimate_profiles ip
set presence_safety_acknowledged_at = cm.safety_acknowledged_at
from public.intimate_cruising_mode cm
join public.profiles p on p.id = cm.user_id
where ip.id = p.user_id
  and cm.safety_acknowledged_at is not null
  and ip.presence_safety_acknowledged_at is null;

revoke insert, update, delete on public.user_presence_location from authenticated, anon;

-- presence_upsert gains audience, duration and a city fallback. Replaced, not
-- overloaded: PostgREST resolves by argument name and a surviving 4-arg twin
-- would make named calls ambiguous (42725). New arguments all have defaults,
-- so the existing 4-argument call keeps working.
drop function if exists public.presence_upsert(double precision, double precision, text, text);
drop function if exists api_private.presence_upsert(double precision, double precision, text, text);

create function api_private.presence_upsert(
  p_lat double precision default null,
  p_lng double precision default null,
  p_source text default 'go_live',
  p_visibility text default 'discovery',
  p_dating boolean default false,
  p_duration_minutes integer default null,
  p_city_id uuid default null,
  p_safety_acknowledged boolean default false
)
returns table(city_id uuid, precision_m integer, is_high_risk boolean, expires_at timestamptz, written boolean)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_raw extensions.geography;
  v_city uuid; v_country uuid;
  v_hr boolean; v_cell double precision; v_prec int;
  v_slat double precision; v_slng double precision;
  v_geog extensions.geography; v_ttl interval;
  v_ack timestamptz;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_source not in ('go_live', 'app_open') then p_source := 'go_live'; end if;
  if p_visibility not in ('off', 'discovery', 'friends_only') then p_visibility := 'discovery'; end if;

  if p_dating then
    if not public.is_intimate_eligible(v_uid) then
      raise exception 'an eligible intimate profile is required' using errcode = '42501';
    end if;
    select ip.presence_safety_acknowledged_at into v_ack
    from public.intimate_profiles ip where ip.id = v_uid;
    if v_ack is null then
      if not p_safety_acknowledged then
        raise exception 'safety acknowledgement required' using errcode = '22023';
      end if;
      update public.intimate_profiles set presence_safety_acknowledged_at = now() where id = v_uid;
    end if;
    -- Rule 1: dating presence never joins the social Nearby list.
    p_visibility := 'off';
  end if;

  if p_lat is not null and p_lng is not null then
    if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
      raise exception 'invalid coordinates' using errcode = '22023';
    end if;
    v_raw := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
    select c.id, c.country_id into v_city, v_country
    from public.cities c
    where c.latitude between p_lat - 1 and p_lat + 1
      and c.longitude between p_lng - 1 and p_lng + 1
    order by st_distance(st_setsrid(st_makepoint(c.longitude, c.latitude), 4326)::geography, v_raw) asc
    limit 1;
  elsif p_city_id is not null then
    -- No device location: the city centroid, at city precision.
    select c.id, c.country_id, c.latitude, c.longitude into v_city, v_country, v_slat, v_slng
    from public.cities c
    where c.id = p_city_id and c.latitude is not null and c.longitude is not null;
    if v_city is null then
      raise exception 'a valid city is required' using errcode = '22023';
    end if;
  else
    raise exception 'a location or a city is required' using errcode = '22023';
  end if;

  v_hr := case when v_country is null then true
               else public.location_is_high_risk(v_country, v_city) end;

  if v_hr and p_source <> 'go_live' then
    return query select v_city, null::int, true, null::timestamptz, false;
    return;
  end if;

  if v_raw is not null then
    v_cell := case when v_hr then 0.02 else 0.0075 end;
    v_prec := case when v_hr then 2000 else 750 end;
    v_slat := floor(p_lat / v_cell) * v_cell + v_cell / 2;
    v_slng := floor(p_lng / v_cell) * v_cell + v_cell / 2;
  else
    v_prec := 10000;
  end if;
  v_geog := st_setsrid(st_makepoint(v_slng, v_slat), 4326)::geography;
  v_ttl := case when p_source = 'go_live'
                then make_interval(mins => greatest(15, least(coalesce(p_duration_minutes, 60), 240)))
                else interval '20 minutes' end;

  insert into public.user_presence_location as up
    (user_id, geog, precision_m, city_id, country_id, visibility, dating_visible, is_high_risk, source, refreshed_at, expires_at)
  values (v_uid, v_geog, v_prec, v_city, v_country, p_visibility, p_dating, v_hr, p_source, now(), now() + v_ttl)
  on conflict (user_id) do update set
    geog = excluded.geog, precision_m = excluded.precision_m, city_id = excluded.city_id,
    country_id = excluded.country_id, visibility = excluded.visibility,
    dating_visible = excluded.dating_visible,
    is_high_risk = excluded.is_high_risk, source = excluded.source,
    refreshed_at = now(), expires_at = excluded.expires_at;

  return query select v_city, v_prec, v_hr, now() + v_ttl, true;
end
$function$;

create function public.presence_upsert(
  p_lat double precision default null,
  p_lng double precision default null,
  p_source text default 'go_live',
  p_visibility text default 'discovery',
  p_dating boolean default false,
  p_duration_minutes integer default null,
  p_city_id uuid default null,
  p_safety_acknowledged boolean default false
)
returns table(city_id uuid, precision_m integer, is_high_risk boolean, expires_at timestamptz, written boolean)
language sql
set search_path to ''
as $function$
  select * from api_private.presence_upsert(
    p_lat => $1, p_lng => $2, p_source => $3, p_visibility => $4,
    p_dating => $5, p_duration_minutes => $6, p_city_id => $7, p_safety_acknowledged => $8)
$function$;

revoke all on function api_private.presence_upsert(double precision, double precision, text, text, boolean, integer, uuid, boolean) from public, anon;
revoke all on function public.presence_upsert(double precision, double precision, text, text, boolean, integer, uuid, boolean) from public, anon;
grant execute on function api_private.presence_upsert(double precision, double precision, text, text, boolean, integer, uuid, boolean) to authenticated, service_role;
grant execute on function public.presence_upsert(double precision, double precision, text, text, boolean, integer, uuid, boolean) to authenticated, service_role;

-- Rule 2: per-city counts only, from both stores during the transition.
create or replace function api_private.cruising_presence_areas()
returns table(city_id uuid, city_name text, city_slug text, latitude double precision, longitude double precision, active_count bigint)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.is_intimate_eligible(v_uid) then
    return;
  end if;

  return query
  with live as (
    select upl.user_id, upl.city_id
    from public.user_presence_location upl
    where upl.dating_visible
      and upl.expires_at > now()
    union
    select p.user_id, cm.city_id
    from public.intimate_cruising_mode cm
    join public.profiles p on p.id = cm.user_id
    where cm.enabled_at is not null
      and cm.safety_acknowledged_at is not null
      and cm.expires_at > now()
  )
  select
    c.id,
    c.name,
    c.slug,
    c.latitude::double precision,
    c.longitude::double precision,
    count(distinct l.user_id)::bigint
  from live l
  join public.intimate_profiles ip on ip.id = l.user_id
  join public.cities c on c.id = l.city_id
  where ip.opted_in_at is not null
    and ip.moderation_status = 'approved'
    and c.latitude is not null
    and c.longitude is not null
    and l.user_id <> v_uid
    and not public.intimate_is_blocked(v_uid, l.user_id)
    and not api_private.test_account_hidden(l.user_id)
  group by c.id, c.name, c.slug, c.latitude, c.longitude
  order by count(distinct l.user_id) desc, c.name;
end
$function$;

do $verify$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'user_presence_location_dating_only'
                   and conrelid = 'public.user_presence_location'::regclass) then
    raise exception 'dating-only constraint missing';
  end if;
  if has_table_privilege('authenticated', 'public.user_presence_location', 'insert')
     or has_table_privilege('authenticated', 'public.user_presence_location', 'update')
     or has_table_privilege('authenticated', 'public.user_presence_location', 'delete') then
    raise exception 'authenticated can still write user_presence_location directly';
  end if;
  if not has_table_privilege('authenticated', 'public.user_presence_location', 'select') then
    raise exception 'authenticated lost its own-row read of user_presence_location';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.proname = 'presence_upsert' and n.nspname in ('public', 'api_private')) <> 2 then
    raise exception 'presence_upsert must exist exactly once per schema';
  end if;
  if has_function_privilege('anon', 'public.presence_upsert(double precision, double precision, text, text, boolean, integer, uuid, boolean)', 'execute') then
    raise exception 'anon can execute presence_upsert';
  end if;
  if not has_function_privilege('authenticated', 'public.presence_upsert(double precision, double precision, text, text, boolean, integer, uuid, boolean)', 'execute') then
    raise exception 'authenticated cannot execute presence_upsert';
  end if;
end
$verify$;
