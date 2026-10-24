-- get_shared_trip_view: the payload /trips/shared/:token actually renders.
--
-- SharedTripPage has read data.trip / data.days / data.places / ... since the
-- trip planner shipped, while get_shared_trip RETURNS TABLE of flat rows — so
-- data.trip was always undefined and every shared link rendered "Trip not
-- found". get_shared_trip is left unchanged (trip-ical / trip-og-image and the
-- definer-isolation test reference it); this is a separate read model.
--
-- PRIVACY (load-bearing): a shared trip can reveal travel to a criminalizing
-- country, so section permissions are enforced HERE, never by the client:
--   days + places  only when permissions.itinerary
--   budget_items   only when permissions.budget
--   notes          only when permissions.notes
--   packing_items  only when permissions.packing
-- A withheld section is ABSENT from the payload, not an empty array. Missing
-- or non-boolean permission keys read as false. No owner/user ids, emails,
-- paid_by/split_among, receipts or author ids are returned. The names of
-- linked venues/events/hotels that are safety_gated are withheld from
-- anonymous viewers, matching the platform's RLS gate on those tables.
--
-- Isolation follows 20261021174528: SECURITY DEFINER implementation in
-- api_private (outside the Data API, revoked from PUBLIC), thin SECURITY
-- INVOKER wrapper in public granted to anon + authenticated.

create or replace function api_private.get_shared_trip_view(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  v_trip   public.trips%rowtype;
  v_trip_id uuid;
  v_perm   jsonb;
  v_itin   boolean;
  v_budget boolean;
  v_notes  boolean;
  v_pack   boolean;
  v_anon   boolean := auth.uid() is null;
  v_out    jsonb;
begin
  if p_token is null or p_token = '' then
    return null;
  end if;

  select s.trip_id, s.permissions
    into v_trip_id, v_perm
  from public.trip_shares s
  where s.token = p_token
    and (s.expires_at is null or s.expires_at > now())
  limit 1;

  if v_trip_id is null then
    return null;
  end if;

  select * into v_trip from public.trips t where t.id = v_trip_id;
  if not found then
    return null;
  end if;

  v_itin   := coalesce(v_perm->'itinerary' = 'true'::jsonb, false);
  v_budget := coalesce(v_perm->'budget'    = 'true'::jsonb, false);
  v_notes  := coalesce(v_perm->'notes'     = 'true'::jsonb, false);
  v_pack   := coalesce(v_perm->'packing'   = 'true'::jsonb, false);

  v_out := jsonb_build_object(
    'trip', jsonb_build_object(
      'id', v_trip.id,
      'title', v_trip.title,
      'description', v_trip.description,
      'start_date', v_trip.start_date,
      'end_date', v_trip.end_date,
      'currency', v_trip.currency,
      'cover_image_url', v_trip.cover_image_url
    ),
    'permissions', jsonb_build_object(
      'itinerary', v_itin, 'budget', v_budget, 'notes', v_notes, 'packing', v_pack
    )
  );

  if v_itin then
    v_out := v_out || jsonb_build_object(
      'days', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', d.id, 'date', d.date, 'title', d.title,
          'notes', d.notes, 'sort_order', d.sort_order
        ) order by d.date, d.sort_order)
        from public.trip_days d
        where d.trip_id = v_trip.id
      ), '[]'::jsonb),
      'places', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'day_id', p.day_id,
          'custom_name', p.custom_name,
          'custom_address', p.custom_address,
          'latitude', p.latitude,
          'longitude', p.longitude,
          'category', p.category,
          'sort_order', p.sort_order,
          'start_time', p.start_time,
          'end_time', p.end_time,
          'venue_name', case when v.safety_gated and v_anon then null else v.name end,
          'event_title', case when e.safety_gated and v_anon then null else e.title end,
          'hotel_name', case when h.safety_gated and v_anon then null else h.name end,
          'country_name', c.name,
          'country_code', c.code,
          'equality_score', c.equality_score
        ) order by p.sort_order, p.created_at)
        from public.trip_places p
        left join public.venues v on v.id = p.venue_id
        left join public.events e on e.id = p.event_id
        left join public.hotels h on h.id = p.hotel_id
        left join public.countries c on c.id = p.country_id
        where p.trip_id = v_trip.id
      ), '[]'::jsonb)
    );
  end if;

  if v_budget then
    v_out := v_out || jsonb_build_object('budget_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', b.title, 'amount', b.amount, 'currency', b.currency,
        'category', b.category, 'date', b.date
      ) order by b.date nulls last, b.created_at)
      from public.trip_budget_items b
      where b.trip_id = v_trip.id
    ), '[]'::jsonb));
  end if;

  if v_notes then
    v_out := v_out || jsonb_build_object('notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', n.title, 'content', n.content,
        'category', n.category, 'is_pinned', n.is_pinned
      ) order by n.is_pinned desc, n.created_at)
      from public.trip_notes n
      where n.trip_id = v_trip.id
    ), '[]'::jsonb));
  end if;

  if v_pack then
    v_out := v_out || jsonb_build_object('packing_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', k.name, 'category', k.category,
        'quantity', k.quantity, 'is_checked', k.is_checked
      ) order by k.sort_order, k.created_at)
      from public.trip_packing_items k
      where k.trip_id = v_trip.id
    ), '[]'::jsonb));
  end if;

  return v_out;
end;
$fn$;


create or replace function public.get_shared_trip_view(p_token text)
returns jsonb
language sql
stable
set search_path to ''
as $fn$select api_private.get_shared_trip_view(p_token => $1)$fn$;

-- The invoker wrapper calls the definer as the CALLER, so anon/authenticated
-- need EXECUTE on the implementation too — exactly as for get_shared_trip in
-- 20261021174528 (schema USAGE is granted there; the Data API never exposes
-- api_private, so this grant is reachable only through the wrapper).
revoke all on function api_private.get_shared_trip_view(text) from public;
grant execute on function api_private.get_shared_trip_view(text) to anon, authenticated, service_role;
revoke all on function public.get_shared_trip_view(text) from public;
grant execute on function public.get_shared_trip_view(text) to anon, authenticated, service_role;

comment on function public.get_shared_trip_view(text) is
  'Shared-trip page payload. Sections are present only when the share grants them (itinerary/budget/notes/packing). Never returns user ids.';

-- Postconditions: exercise the gating against a throwaway trip inside a
-- subtransaction that is always rolled back. Skipped (with a notice) on a
-- database with no auth user or city, e.g. a rebuild from zero.
do $verify$
declare
  v_user uuid;
  v_city uuid;
  v_trip uuid;
  v_out  jsonb;
  v_tok  text := 'migration-probe-' || md5(random()::text);
begin
  select id into v_user from auth.users limit 1;
  select id into v_city from public.cities where duplicate_of_id is null limit 1;
  if v_user is null or v_city is null then
    raise notice 'get_shared_trip_view postconditions skipped: no user/city';
    return;
  end if;

  begin
    insert into public.trips (owner_id, title, primary_city_id, currency)
    values (v_user, 'probe', v_city, 'EUR') returning id into v_trip;
    insert into public.trip_budget_items (trip_id, title, amount, currency, paid_by, split_among)
    values (v_trip, 'probe', 1, 'EUR', v_user, array[v_user]);
    insert into public.trip_shares (trip_id, token, permissions, created_by)
    values (v_trip, v_tok,
      '{"itinerary":true,"budget":false,"notes":false,"packing":true}', v_user);

    v_out := public.get_shared_trip_view(v_tok);
    if v_out is null or v_out->'trip'->>'id' <> v_trip::text then
      raise exception 'P1 failed: valid token did not return the trip: %', v_out;
    end if;
    if v_out ? 'budget_items' or v_out ? 'notes' then
      raise exception 'P2 failed: withheld section present: %', v_out;
    end if;
    if not (v_out ? 'days' and v_out ? 'places' and v_out ? 'packing_items') then
      raise exception 'P3 failed: granted section missing: %', v_out;
    end if;
    if v_out::text ilike '%' || v_user::text || '%' then
      raise exception 'P4 failed: payload contains the owner id';
    end if;

    -- Inverse grant: budget only. Itinerary must now be absent too.
    update public.trip_shares set permissions = '{"budget":true}' where token = v_tok;
    v_out := public.get_shared_trip_view(v_tok);
    if not (v_out ? 'budget_items') or v_out ? 'days' or v_out ? 'places' or v_out ? 'packing_items' then
      raise exception 'P2b failed: gating does not follow the grant: %', v_out;
    end if;
    if v_out::text ilike '%' || v_user::text || '%' then
      raise exception 'P4b failed: budget payload contains a user id';
    end if;

    update public.trip_shares set expires_at = now() - interval '1 minute' where token = v_tok;
    if public.get_shared_trip_view(v_tok) is not null then
      raise exception 'P5 failed: expired token still returns data';
    end if;
    if public.get_shared_trip_view('no-such-token') is not null then
      raise exception 'P6 failed: unknown token returns data';
    end if;

    raise exception using errcode = 'P0099', message = 'rollback probe';
  exception when sqlstate 'P0099' then
    null;
  end;
end
$verify$;
