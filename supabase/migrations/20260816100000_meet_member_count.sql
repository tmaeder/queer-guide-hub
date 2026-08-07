-- Anon-safe member counts for the "Meet people" hub.
--
-- /people is a top-level nav intent whose signed-out state was a single line of
-- grey text, because there is no way to show an anonymous visitor a person:
-- `people_discovery` is `revoke all ... from public, anon`, and that is correct
-- and stays that way. What an anonymous visitor CAN honestly be told is how
-- many members exist, which is what `gated_content_notice` already does for
-- venues/events/organizations via `gated_count_for_location`. That function
-- does not touch `profiles`, so this is its counterpart.
--
-- Counts only. Never rows. That is the whole safety argument for granting it to
-- anon, and it is why the return type is a scalar object rather than a setof.
--
-- Returns BOTH numbers deliberately:
--   here  - members whose home city/country matches the page scope
--   total - members discoverable at all, ignoring location
-- because `user_travel_preferences` holds 0 rows today and
-- `profiles.travel_mode->>'city_id'` is null on every row, so `here` is 0 in
-- every city on the site. A caller that only had `here` would render "0 members
-- in Zurich" and imply the community is empty there specifically; with both, the
-- UI can fall back to the honest global phrasing until home-city capture exists.
-- When that data starts arriving, `here` becomes meaningful with no code change.
--
-- "Discoverable" mirrors the pool `people_discovery` actually draws from in its
-- friends/locals branches -- `profile_visibility in ('public','community')` --
-- so this count can never promise more people than the product could show.

create or replace function public.meet_member_count_for_location(
  p_country_id uuid default null,
  p_city_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'here', (
      select count(*)
      from public.profiles p
      left join public.user_travel_preferences utp on utp.user_id = p.user_id
      where coalesce(p.privacy_settings ->> 'profile_visibility', '') in ('public', 'community')
        and (
          p_city_id is null
          or utp.home_city_id = p_city_id
          -- Compared as text, never cast to uuid: travel_mode is user-written
          -- jsonb, and `(... ->> 'city_id')::uuid` throws for the whole query on
          -- a single malformed value rather than just not matching.
          or p.travel_mode ->> 'city_id' = p_city_id::text
        )
        and (p_country_id is null or utp.home_country_id = p_country_id)
    ),
    'total', (
      select count(*)
      from public.profiles p
      where coalesce(p.privacy_settings ->> 'profile_visibility', '') in ('public', 'community')
    )
  );
$function$;

comment on function public.meet_member_count_for_location(uuid, uuid) is
  'Counts of discoverable members, scoped and global. Counts only, never rows -- safe for anon.';

revoke all on function public.meet_member_count_for_location(uuid, uuid) from public;
grant execute on function public.meet_member_count_for_location(uuid, uuid) to anon, authenticated;
