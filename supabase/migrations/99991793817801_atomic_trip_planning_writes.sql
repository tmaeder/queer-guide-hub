-- An explicit client-generated trip ID makes an ambiguous network retry safe.
-- Both functions run as the caller so table permissions and RLS still apply.
create function public.create_trip_with_stops(p_id uuid, p_trip jsonb, p_stops jsonb)
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
    timezone, vibe_tags, traveler_type
  ) values (
    p_id, v_user, v_input.title, v_input.description, v_input.start_date, v_input.end_date,
    coalesce(v_input.currency, 'USD'), v_input.cover_image_url, v_input.primary_city_id,
    v_input.primary_country_id, v_input.primary_city_name, v_input.primary_country_code,
    v_input.timezone, coalesce(v_input.vibe_tags, '{}'), v_input.traveler_type
  ) on conflict (id) do nothing
  returning id into v_created;

  if v_created is null then
    if exists (select 1 from public.trips where id = p_id and owner_id = v_user) then
      return p_id;
    end if;
    raise exception 'Trip ID is unavailable' using errcode = '42501';
  end if;

  insert into public.trip_places (
    trip_id, created_by, venue_id, event_id, hotel_id, custom_name, custom_address,
    latitude, longitude, city_id, country_id, start_time, end_time, duration_minutes,
    notes, category, sort_order, icon, arrive_mode
  )
  select
    p_id, v_user, s.venue_id, s.event_id, s.hotel_id, s.custom_name, s.custom_address,
    s.latitude, s.longitude, s.city_id, s.country_id, s.start_time, s.end_time,
    s.duration_minutes, s.notes, s.category, coalesce(s.sort_order, 0), s.icon, s.arrive_mode
  from jsonb_populate_recordset(null::public.trip_places, p_stops) s;

  return p_id;
end;
$$;

create function public.reorder_trip_stops(p_trip uuid, p_changes jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null or public.can_edit_trip(p_trip, auth.uid()) is not true then
    raise exception 'Trip editing permission required' using errcode = '42501';
  end if;

  -- Serialize reorder requests for this trip. Expected positions reject stale edits.
  perform pg_advisory_xact_lock(hashtextextended(p_trip::text, 0));

  with changes as (
    select * from jsonb_to_recordset(p_changes) as c(
      id uuid, old_day_id uuid, old_sort_order integer, day_id uuid, sort_order integer
    )
  )
  update public.trip_places p
  set day_id = c.day_id, sort_order = c.sort_order
  from changes c
  where p.trip_id = p_trip and p.id = c.id
    and p.day_id is not distinct from c.old_day_id and p.sort_order = c.old_sort_order
    and c.sort_order >= 0
    and (c.day_id is null or exists (
      select 1 from public.trip_days d where d.id = c.day_id and d.trip_id = p_trip
    ));

  get diagnostics v_updated = row_count;
  if v_updated <> jsonb_array_length(p_changes) then
    raise exception 'The itinerary changed. Reload it and try again.' using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.create_trip_with_stops(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.reorder_trip_stops(uuid, jsonb) from public, anon;
grant execute on function public.create_trip_with_stops(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.reorder_trip_stops(uuid, jsonb) to authenticated;
