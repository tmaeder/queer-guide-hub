-- Profiles are visible to signed-in members by default.
--
-- Signup wrote profile_visibility = false (private), so 26 of 28 members were
-- invisible to each other and every social surface (directory, profiles,
-- people matching) came up empty. Owner decision, 2026-11-23: members see
-- each other. The default and every member still on a private default move to
-- 'community' = signed-in members only. Signed-out visitors and crawlers still
-- see nothing (that would be 'public'); per-field defaults for identity,
-- relationships and contact stay friends-only. Private stays selectable in
-- Settings, and a private member still shows the basic card
-- (99991795467849_member_basic_cards).
--
-- No row history exists to tell a chosen 'private' from the signup default:
-- the 11 rows holding JSON `false` are the current handle_new_user default
-- verbatim, the 15 holding 'private' are the previous one.

-- 1. New signups.
do $patch$
declare
  v_src  text := pg_get_functiondef('public.handle_new_user()'::regprocedure);
  v_from text := $a$jsonb_build_object('profile_visibility', false)$a$;
  v_to   text := $b$jsonb_build_object('profile_visibility', 'community')$b$;
  v_n int := (length(v_src) - length(replace(v_src, v_from, ''))) / length(v_from);
begin
  if position(v_to in v_src) > 0 and v_n = 0 then
    raise notice 'handle_new_user already defaults to community; skipping';
  elsif v_n <> 1 then
    raise exception 'expected exactly one profile_visibility default in handle_new_user, found %', v_n;
  else
    execute replace(v_src, v_from, v_to);
  end if;
end
$patch$;

-- 2. Existing members on a private default.
select set_config('app.actor', 'migration:profiles_community_by_default', true);
update public.profiles
set privacy_settings = coalesce(privacy_settings, '{}'::jsonb)
                       || jsonb_build_object('profile_visibility', 'community')
where coalesce(privacy_settings ->> 'profile_visibility', 'public') in ('private', 'false');

-- Postconditions.
do $verify$
begin
  if exists (select 1 from public.profiles
             where privacy_settings ->> 'profile_visibility' in ('private', 'false')) then
    raise exception 'profiles still on a private default';
  end if;
  if position($q$'profile_visibility', 'community'$q$
              in pg_get_functiondef('public.handle_new_user()'::regprocedure)) = 0 then
    raise exception 'handle_new_user does not default to community';
  end if;
end
$verify$;
