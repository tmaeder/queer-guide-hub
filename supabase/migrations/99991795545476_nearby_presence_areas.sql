-- Nearby becomes the one live map (2026-11-24). Its People layer needs the
-- same per-city aggregate the dating map already has, but for members live to
-- Everyone or Friends.
--
-- Visibility follows people_discovery's nearby branch, with one deliberate
-- difference: high-risk presences are NEVER counted. The list may show a
-- 'discovery' presence in a high-risk place to someone already within a few
-- km; a city-level count on a world map is visible from anywhere, so it
-- would advertise that queer members are live in a criminalising city.
-- Counts only, never ids or coordinates finer than the city centroid.

create or replace function api_private.nearby_presence_areas()
returns table(city_id uuid, city_name text, city_slug text, latitude double precision, longitude double precision, active_count bigint)
language plpgsql
stable security definer
set search_path to ''
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.name,
    c.slug,
    c.latitude::double precision,
    c.longitude::double precision,
    count(distinct upl.user_id)::bigint
  from public.user_presence_location upl
  join public.cities c on c.id = upl.city_id
  where upl.expires_at > now()
    and upl.visibility <> 'off'
    and not upl.is_high_risk
    and (upl.visibility <> 'friends_only' or exists (
          select 1 from public.user_relationships r
          where r.relationship_type = 'friend' and r.status = 'accepted'
            and ((r.user_id = v_uid and r.target_user_id = upl.user_id)
              or (r.user_id = upl.user_id and r.target_user_id = v_uid))))
    and c.latitude is not null
    and c.longitude is not null
    and upl.user_id <> v_uid
    and not public.intimate_is_blocked(v_uid, upl.user_id)
    and not api_private.test_account_hidden(upl.user_id)
  group by c.id, c.name, c.slug, c.latitude, c.longitude
  order by count(distinct upl.user_id) desc, c.name;
end
$fn$;

create or replace function public.nearby_presence_areas()
returns table(city_id uuid, city_name text, city_slug text, latitude double precision, longitude double precision, active_count bigint)
language sql
stable
set search_path to ''
as $fn$select * from api_private.nearby_presence_areas()$fn$;

revoke all on function api_private.nearby_presence_areas() from public, anon;
revoke all on function public.nearby_presence_areas() from public, anon;
grant execute on function api_private.nearby_presence_areas() to authenticated, service_role;
grant execute on function public.nearby_presence_areas() to authenticated, service_role;

do $verify$
declare
  v_src text := regexp_replace(
    pg_get_functiondef('api_private.nearby_presence_areas()'::regprocedure),
    '--[^' || chr(10) || ']*', '', 'g');
begin
  if position('not upl.is_high_risk' in v_src) = 0 then
    raise exception 'nearby_presence_areas must never count high-risk presences';
  end if;
  if has_function_privilege('anon', 'public.nearby_presence_areas()', 'execute') then
    raise exception 'nearby_presence_areas must not be callable by anon';
  end if;
end
$verify$;
