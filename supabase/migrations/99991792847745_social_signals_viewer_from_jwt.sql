-- Social-signal RPCs: take the viewer from the JWT, never from the caller.
--
-- api_private.get_venue_social_signals / get_event_social_signals are
-- SECURITY DEFINER and computed "friends" from p_viewer_id, a caller-supplied
-- argument. Any signed-in user could pass someone else's uuid and learn how
-- many of THAT person's friends saved a venue or are going to an event — a
-- read of another user's social graph. The viewer is now auth.uid(); the
-- parameter is kept (and ignored) so the public wrappers, the generated types
-- and every client call keep working unchanged.
--
-- No server-side caller passes a viewer (grep of supabase/functions, workers,
-- functions, scripts finds none), and service_role has no auth.uid(), so a
-- service call now gets friend counts of 0 — the same answer anon gets.

create or replace function api_private.get_venue_social_signals(
  p_venue_ids uuid[],
  p_viewer_id uuid default null
) returns table(venue_id uuid, friends_saved integer, trip_usage integer)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as id
  ),
  friends as (
    select case when ur.user_id = me.id then ur.target_user_id else ur.user_id end as friend_id
    from public.user_relationships ur, me
    where me.id is not null
      and ur.relationship_type = 'friend'
      and ur.status = 'accepted'
      and (ur.user_id = me.id or ur.target_user_id = me.id)
    union
    select f1.following_id as friend_id
    from public.user_follows f1
    join public.user_follows f2
      on f1.following_id = f2.follower_id
     and f1.follower_id = f2.following_id
    cross join me
    where me.id is not null
      and f1.follower_id = me.id
  )
  select
    v.id as venue_id,
    coalesce(fs.c, 0)::integer as friends_saved,
    coalesce(tu.c, 0)::integer as trip_usage
  from unnest(p_venue_ids) as v(id)
  left join lateral (
    select count(*)::int as c
    from public.venue_favorites vf
    where vf.venue_id = v.id
      and vf.user_id in (select friend_id from friends)
  ) fs on true
  left join lateral (
    select count(*)::int as c
    from public.trip_places tp
    join public.trips t on t.id = tp.trip_id
    where tp.venue_id = v.id
      and t.is_public = true
  ) tu on true;
$$;

create or replace function api_private.get_event_social_signals(
  p_event_ids uuid[],
  p_viewer_id uuid default null
) returns table(event_id uuid, friends_going integer, attending_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select auth.uid() as id
  ),
  friends as (
    select case when ur.user_id = me.id then ur.target_user_id else ur.user_id end as friend_id
      from public.user_relationships ur, me
     where me.id is not null and ur.relationship_type = 'friend' and ur.status = 'accepted'
       and (ur.user_id = me.id or ur.target_user_id = me.id)
    union
    select f1.following_id as friend_id
      from public.user_follows f1
      join public.user_follows f2 on f1.following_id = f2.follower_id and f1.follower_id = f2.following_id
      cross join me
     where me.id is not null and f1.follower_id = me.id
  )
  select e.id as event_id,
         coalesce(fg.c, 0)::integer as friends_going,
         coalesce(ac.c, 0)::integer as attending_count
  from unnest(p_event_ids) as e(id)
  left join lateral (
    select count(*)::int as c from public.event_attendees ea
     where ea.event_id = e.id and ea.status in ('going','interested')
       and ea.user_id in (select friend_id from friends)
  ) fg on true
  left join lateral (
    select count(*)::int as c from public.event_attendees ea
     where ea.event_id = e.id and ea.status in ('going','interested')
  ) ac on true;
$$;

-- CREATE OR REPLACE keeps existing grants; restate the intended set anyway so
-- a rebuild from zero cannot leave these executable by anon or PUBLIC.
revoke all on function api_private.get_venue_social_signals(uuid[], uuid) from public, anon;
revoke all on function api_private.get_event_social_signals(uuid[], uuid) from public, anon;
grant execute on function api_private.get_venue_social_signals(uuid[], uuid) to authenticated, service_role;
grant execute on function api_private.get_event_social_signals(uuid[], uuid) to authenticated, service_role;

do $verify$
declare
  v_src text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'api_private.get_venue_social_signals(uuid[],uuid)'::regprocedure;
  if position('p_viewer_id' in v_src) > 0 or position('auth.uid()' in v_src) = 0 then
    raise exception 'venue social signals still reads p_viewer_id';
  end if;
  select prosrc into v_src from pg_proc
   where oid = 'api_private.get_event_social_signals(uuid[],uuid)'::regprocedure;
  if position('p_viewer_id' in v_src) > 0 or position('auth.uid()' in v_src) = 0 then
    raise exception 'event social signals still reads p_viewer_id';
  end if;
  if has_function_privilege('anon', 'public.get_venue_social_signals(uuid[],uuid)', 'execute')
     or has_function_privilege('anon', 'public.get_event_social_signals(uuid[],uuid)', 'execute') then
    raise exception 'social signal wrappers must not be executable by anon';
  end if;
end
$verify$;
