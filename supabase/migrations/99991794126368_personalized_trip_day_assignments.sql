alter table public.trips
  add column adult_count smallint check (adult_count between 1 and 9);

-- A distinct endpoint prevents an updated client from writing through the
-- old RPC before the migration lands and silently losing day assignments.
create function public.create_personalized_trip(p_id uuid, p_trip jsonb, p_stops jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_input public.trips;
  v_created uuid;
begin
  if v_user is null or p_id is null then
    raise exception 'Trip creation requires an account and a request ID' using errcode = '42501';
  end if;

  v_input := jsonb_populate_record(null::public.trips, p_trip);
  insert into public.trips (
    id, owner_id, title, description, start_date, end_date, currency, cover_image_url,
    primary_city_id, primary_country_id, primary_city_name, primary_country_code,
    timezone, vibe_tags, traveler_type, adult_count
  ) values (
    p_id, v_user, v_input.title, v_input.description, v_input.start_date, v_input.end_date,
    coalesce(v_input.currency, 'USD'), v_input.cover_image_url, v_input.primary_city_id,
    v_input.primary_country_id, v_input.primary_city_name, v_input.primary_country_code,
    v_input.timezone, coalesce(v_input.vibe_tags, '{}'), v_input.traveler_type, v_input.adult_count
  ) on conflict (id) do nothing
  returning id into v_created;

  if v_created is null then
    if exists (select 1 from public.trips where id = p_id and owner_id = v_user) then
      return p_id;
    end if;
    raise exception 'Trip ID is unavailable' using errcode = '42501';
  end if;

  -- The trips insert trigger has already created the calendar days.
  -- Reject a dated stop outside that calendar so nothing gets silently unassigned.
  if exists (
    select 1
    from jsonb_to_recordset(p_stops) as stop(day_date date)
    where stop.day_date is not null
      and not exists (
        select 1 from public.trip_days d where d.trip_id = p_id and d.date = stop.day_date
      )
  ) then
    raise exception 'A stop date is outside the trip' using errcode = '22023';
  end if;

  insert into public.trip_places (
    trip_id, created_by, day_id, venue_id, event_id, hotel_id, custom_name, custom_address,
    latitude, longitude, city_id, country_id, start_time, end_time, duration_minutes,
    notes, category, sort_order, icon, arrive_mode
  )
  select
    p_id, v_user, d.id, s.venue_id, s.event_id, s.hotel_id, s.custom_name, s.custom_address,
    s.latitude, s.longitude, s.city_id, s.country_id, s.start_time, s.end_time,
    s.duration_minutes, s.notes, s.category, coalesce(s.sort_order, 0), s.icon, s.arrive_mode
  from jsonb_array_elements(p_stops) as stop(value)
  cross join lateral jsonb_populate_record(null::public.trip_places, stop.value) s
  left join public.trip_days d on d.trip_id = p_id and d.date = (stop.value->>'day_date')::date;

  return p_id;
end;
$$;

revoke all on function public.create_personalized_trip(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_personalized_trip(uuid, jsonb, jsonb) to authenticated;
