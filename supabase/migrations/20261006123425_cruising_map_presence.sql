-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261006123425 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Authenticated cruising-map presence. Exact venue coordinates remain governed
-- by the existing safety_gated venue RLS policy; people are exposed only as
-- city-level aggregate bubbles after an explicit, expiring opt-in.

drop policy if exists intimate_cruising_mode_self_select on public.intimate_cruising_mode;
create policy intimate_cruising_mode_self_select on public.intimate_cruising_mode
  for select to authenticated
  using (user_id = (select p.id from public.profiles p where p.user_id = (select auth.uid())));

drop policy if exists intimate_cruising_mode_self_insert on public.intimate_cruising_mode;
create policy intimate_cruising_mode_self_insert on public.intimate_cruising_mode
  for insert to authenticated
  with check (
    user_id = (select p.id from public.profiles p where p.user_id = (select auth.uid()))
  );

drop policy if exists intimate_cruising_mode_self_update on public.intimate_cruising_mode;
create policy intimate_cruising_mode_self_update on public.intimate_cruising_mode
  for update to authenticated
  using (user_id = (select p.id from public.profiles p where p.user_id = (select auth.uid())))
  with check (
    user_id = (select p.id from public.profiles p where p.user_id = (select auth.uid()))
  );

create or replace function public.cruising_spots_search(
  p_search text default null,
  p_west double precision default null,
  p_south double precision default null,
  p_east double precision default null,
  p_north double precision default null,
  p_mapped_only boolean default false,
  p_limit integer default 40,
  p_offset integer default 0
) returns table(
  id uuid,
  slug text,
  name text,
  description text,
  address text,
  city text,
  state text,
  country text,
  latitude double precision,
  longitude double precision,
  verified boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(pg_catalog.btrim(p_search), '');
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
  select
    v.id,
    v.slug,
    v.name,
    v.description,
    v.address,
    v.city,
    v.state,
    v.country,
    v.latitude::double precision,
    v.longitude::double precision,
    v.verified,
    count(*) over()::bigint
  from public.venue_catalog_public v
  where v.category = 'cruising'
    and (
      v_search is null
      or v.name ilike '%' || v_search || '%'
      or v.city ilike '%' || v_search || '%'
      or v.state ilike '%' || v_search || '%'
      or v.country ilike '%' || v_search || '%'
    )
    and (
      not coalesce(p_mapped_only, false)
      or (v.latitude is not null and v.longitude is not null)
    )
    and (p_south is null or v.latitude >= p_south)
    and (p_north is null or v.latitude <= p_north)
    and (
      p_west is null
      or p_east is null
      or (p_west <= p_east and v.longitude between p_west and p_east)
      or (p_west > p_east and (v.longitude >= p_west or v.longitude <= p_east))
    )
  order by v.name, v.id
  limit greatest(1, least(coalesce(p_limit, 40), 1200))
  offset greatest(coalesce(p_offset, 0), 0);
end
$$;

create or replace function public.cruising_presence_set(
  p_enabled boolean,
  p_city_id uuid default null,
  p_duration_minutes integer default 60,
  p_safety_acknowledged boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_existing public.intimate_cruising_mode;
  v_row public.intimate_cruising_mode;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select p.id into v_profile_id
  from public.profiles p
  where p.user_id = v_uid;
  if v_profile_id is null then
    raise exception 'profile required' using errcode = '42501';
  end if;

  select * into v_existing
    from public.intimate_cruising_mode
   where user_id = v_profile_id;

  if not p_enabled then
    insert into public.intimate_cruising_mode (
      user_id, enabled_at, safety_acknowledged_at, city_id, radius_km, expires_at, updated_at
    ) values (
      v_profile_id, null, v_existing.safety_acknowledged_at,
      coalesce(p_city_id, v_existing.city_id), coalesce(v_existing.radius_km, 25), null, now()
    )
    on conflict (user_id) do update set
      enabled_at = null,
      expires_at = null,
      updated_at = now()
    returning * into v_row;
    return jsonb_build_object('enabled', false, 'expires_at', null, 'city_id', v_row.city_id);
  end if;

  if not public.is_intimate_eligible(v_uid) then
    raise exception 'an eligible intimate profile is required' using errcode = '42501';
  end if;
  if p_city_id is null or not exists (
    select 1 from public.geo_city_profiles where place_id = p_city_id
  ) then
    raise exception 'a valid discovery city is required' using errcode = '22023';
  end if;
  if not p_safety_acknowledged and v_existing.safety_acknowledged_at is null then
    raise exception 'safety acknowledgement required' using errcode = '22023';
  end if;

  insert into public.intimate_cruising_mode (
    user_id, enabled_at, safety_acknowledged_at, city_id, radius_km, expires_at, updated_at
  ) values (
    v_profile_id,
    now(),
    coalesce(v_existing.safety_acknowledged_at, now()),
    p_city_id,
    coalesce(v_existing.radius_km, 25),
    now() + make_interval(mins => greatest(15, least(coalesce(p_duration_minutes, 60), 240))),
    now()
  )
  on conflict (user_id) do update set
    enabled_at = excluded.enabled_at,
    safety_acknowledged_at = coalesce(
      intimate_cruising_mode.safety_acknowledged_at,
      excluded.safety_acknowledged_at
    ),
    city_id = excluded.city_id,
    expires_at = excluded.expires_at,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'enabled', true,
    'expires_at', v_row.expires_at,
    'city_id', v_row.city_id
  );
end
$$;

create or replace function public.cruising_presence_areas()
returns table(
  city_id uuid,
  city_name text,
  city_slug text,
  latitude double precision,
  longitude double precision,
  active_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_viewer_profile uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.is_intimate_eligible(v_uid) then
    return;
  end if;

  select p.id into v_viewer_profile
  from public.profiles p
  where p.user_id = v_uid;
  if v_viewer_profile is null then
    return;
  end if;
  return query
  select
    c.id,
    c.name,
    c.slug,
    c.latitude::double precision,
    c.longitude::double precision,
    count(*)::bigint
  from public.intimate_cruising_mode cm
  join public.profiles p on p.id = cm.user_id
  join public.intimate_profiles ip on ip.id = p.user_id
  join public.cities c on c.id = cm.city_id
  where cm.enabled_at is not null
    and cm.safety_acknowledged_at is not null
    and cm.expires_at > now()
    and ip.opted_in_at is not null
    and ip.moderation_status = 'approved'
    and c.latitude is not null
    and c.longitude is not null
    and cm.user_id <> v_viewer_profile
    and not public.intimate_is_blocked(v_uid, p.user_id)
  group by c.id, c.name, c.slug, c.latitude, c.longitude
  order by count(*) desc, c.name;
end
$$;

revoke all on function public.cruising_presence_set(boolean, uuid, integer, boolean)
  from public, anon;
grant execute on function public.cruising_presence_set(boolean, uuid, integer, boolean)
  to authenticated;

revoke all on function public.cruising_presence_areas() from public, anon;
grant execute on function public.cruising_presence_areas() to authenticated;

revoke all on function public.cruising_spots_search(
  text, double precision, double precision, double precision, double precision,
  boolean, integer, integer
) from public, anon;
grant execute on function public.cruising_spots_search(
  text, double precision, double precision, double precision, double precision,
  boolean, integer, integer
) to authenticated;

comment on function public.cruising_presence_areas() is
  'Authenticated intimate-discovery API. Returns active cruisers only as city-level aggregate counts; never user ids or person coordinates.';

do $$
begin
  if has_function_privilege('anon', 'public.cruising_presence_areas()', 'execute') then
    raise exception 'anonymous role can execute cruising_presence_areas';
  end if;
  if has_function_privilege(
    'anon',
    'public.cruising_spots_search(text,double precision,double precision,double precision,double precision,boolean,integer,integer)',
    'execute'
  ) then
    raise exception 'anonymous role can execute cruising_spots_search';
  end if;
  if has_function_privilege(
    'anon',
    'public.cruising_presence_set(boolean,uuid,integer,boolean)',
    'execute'
  ) then
    raise exception 'anonymous role can execute cruising_presence_set';
  end if;
end
$$;
;
