-- Every member gets a basic card that other SIGNED-IN members can see.
--
-- Signup sets profile_visibility to private (handle_new_user writes `false`),
-- so 26 of 28 members were invisible to everyone but admins: the directory
-- (RLS) hid them, and get_public_profile_safe returned NULL, so a link to one
-- rendered "Profile not found — doesn't exist or has been removed".
--
-- Decision (owner, 2026-11-23): a private member still shows a basic card to
-- signed-in members — username, display name, generated/uploaded avatar,
-- mode and join date. Nothing else. Signed-out visitors still get nothing,
-- and a block in either direction still hides the member entirely. The full
-- profile stays governed by profile_visibility exactly as before.
--
-- RLS is deliberately NOT widened: `authenticated` holds SELECT on 38 profile
-- columns, so making private rows readable would expose bio, location,
-- pronouns and more. The card is served only through the two definer
-- functions below, which return the six fields and nothing else.

-- 1. get_public_profile_safe: private + signed-in viewer -> locked basic card.
--    Patched from the live definition (exactly-once anchor), not restated.
do $patch$
declare
  v_src  text := pg_get_functiondef('api_private.get_public_profile_safe(uuid)'::regprocedure);
  v_from text := $a$  IF visibility = 'private' AND NOT is_owner AND NOT is_admin THEN
    RETURN NULL;
  END IF;$a$;
  v_to   text := $b$  IF visibility = 'private' AND NOT is_owner AND NOT is_admin THEN
    IF viewer IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object(
      'user_id', profile_record.user_id,
      'display_name', profile_record.display_name,
      'username', profile_record.username,
      'avatar_url', profile_record.avatar_url,
      'user_mode', profile_record.user_mode,
      'created_at', profile_record.created_at,
      'profile_visibility', 'private',
      'locked', true
    );
  END IF;$b$;
  v_n int := (length(v_src) - length(replace(v_src, v_from, ''))) / length(v_from);
begin
  if position(v_to in v_src) > 0 then
    raise notice 'get_public_profile_safe already returns the basic card; skipping';
  elsif v_n <> 1 then
    raise exception 'expected exactly one private-branch anchor in get_public_profile_safe, found %', v_n;
  else
    execute replace(v_src, v_from, v_to);
  end if;
end
$patch$;

-- 2. member_cards: the basic cards the directory cannot read through RLS.
create or replace function api_private.member_cards(p_search text default null, p_limit int default 60)
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  user_mode text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $fn$
  select p.user_id, p.display_name::text, p.username::text, p.avatar_url::text,
         p.user_mode::text, p.created_at
  from public.profiles p
  where (select auth.uid()) is not null
    and p.user_id <> (select auth.uid())
    and coalesce(p.privacy_settings ->> 'profile_visibility', 'public')
        not in ('public', 'community', 'true')
    and not exists (
      select 1 from public.user_relationships ur
      where ur.relationship_type = 'block' and ur.status = 'accepted'
        and ((ur.user_id = p.user_id and ur.target_user_id = (select auth.uid()))
          or (ur.user_id = (select auth.uid()) and ur.target_user_id = p.user_id))
    )
    and (
      nullif(btrim(p_search), '') is null
      or p.display_name ilike '%' || btrim(p_search) || '%'
      or p.username ilike '%' || btrim(p_search) || '%'
    )
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$fn$;

create or replace function public.member_cards(p_search text default null, p_limit int default 60)
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  user_mode text,
  created_at timestamptz
)
language sql
stable
set search_path to ''
as $fn$ select * from api_private.member_cards(p_search => $1, p_limit => $2) $fn$;

revoke all on function api_private.member_cards(text, int) from public, anon;
revoke all on function public.member_cards(text, int) from public, anon;
grant execute on function api_private.member_cards(text, int) to authenticated;
grant execute on function public.member_cards(text, int) to authenticated;

-- Postconditions.
do $verify$
declare
  v_src text := pg_get_functiondef('api_private.get_public_profile_safe(uuid)'::regprocedure);
begin
  if position($q$'locked', true$q$ in substr(v_src, position($q$visibility = 'private' AND NOT is_owner$q$ in v_src), 900)) = 0 then
    raise exception 'get_public_profile_safe private branch does not return the basic card';
  end if;
  if has_function_privilege('anon', 'public.member_cards(text, int)', 'EXECUTE') then
    raise exception 'member_cards must not be executable by anon';
  end if;
  if not has_function_privilege('authenticated', 'public.member_cards(text, int)', 'EXECUTE') then
    raise exception 'member_cards must be executable by authenticated';
  end if;
end
$verify$;
