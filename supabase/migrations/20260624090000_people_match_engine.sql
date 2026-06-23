-- People matching engine (slice 1 of the unified "People" surface).
--
-- Two compute-on-read, pure-function RPCs that rank people for a viewer using
-- the platform's existing profile + behavioral graph. No stored score column,
-- no trigger, no matview: a per-user score write would storm the
-- search_documents triggers that fire on profiles UPDATE (see CLAUDE.md).
--
-- AUTH-UID JOIN CONTRACT (load-bearing — verified against the live schema):
--   auth.uid() == profiles.user_id  (NOT profiles.id; the two differ per row).
--   Every social/behavioral table keys on the auth uid:
--     user_relationships.user_id/.target_user_id, event_attendees.user_id,
--     venue_favorites.user_id, city_favorites.user_id, venue_checkins.user_id,
--     group_memberships.user_id, trips.owner_id, trip_members.user_id,
--     user_travel_preferences.user_id, intimate_profiles.id,
--     intimate_likes/passes.actor_id/.target_id, intimate_discovery_v.user_id.
--   So both RPCs operate entirely in auth-uid space and join profile columns
--   via `profiles.user_id = <auth uid>`. Joining on profiles.id is the single
--   most likely bug here.

-- =============================================================================
-- compute_compatibility(viewer, candidate) -> 0..100
-- Canonical single-pair score. Used by people_discovery (below) and by detail
-- cards. Hard-zeroed on a block — the safety spine: a blocked pair can never
-- surface anywhere that reuses this function.
-- =============================================================================
create or replace function public.compute_compatibility(p_viewer uuid, p_candidate uuid)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_score        numeric := 0;
  v_interests    int := 0;
  v_hobbies      int := 0;
  v_causes       int := 0;
  v_roles        int := 0;
  v_places       int := 0;
  v_events       int := 0;
  v_trips        int := 0;
  v_friends      int := 0;
  v_groups       int := 0;
  v_home_match   boolean := false;
  v_same_country boolean := false;
  v_gender_match boolean := false;
  v_pron_match   boolean := false;
begin
  if p_viewer is null or p_candidate is null or p_viewer = p_candidate then
    return 0;
  end if;
  -- Block-scope guard: never let one user compute scores as another user.
  -- Internal calls from people_discovery preserve auth.uid(); service_role
  -- (auth.uid() null) is allowed for tests/jobs.
  if auth.uid() is not null and p_viewer is distinct from auth.uid() then
    return 0;
  end if;
  -- Safety spine: blocked pair -> 0.
  if public.intimate_is_blocked(p_viewer, p_candidate) then
    return 0;
  end if;

  -- Shared interests (jsonb array on profiles.interests).
  select count(*) into v_interests
  from (
    select jsonb_array_elements_text(
             case when jsonb_typeof(pv.interests) = 'array' then pv.interests else '[]'::jsonb end) e
    from profiles pv where pv.user_id = p_viewer
  ) a
  join (
    select jsonb_array_elements_text(
             case when jsonb_typeof(pc.interests) = 'array' then pc.interests else '[]'::jsonb end) e
    from profiles pc where pc.user_id = p_candidate
  ) b using (e);

  -- text[] overlaps + identity facets (single cross-row lookup).
  select
    coalesce(cardinality(array(select unnest(pv.hobbies)          intersect select unnest(pc.hobbies))), 0),
    coalesce(cardinality(array(select unnest(pv.causes_supported) intersect select unnest(pc.causes_supported))), 0),
    coalesce(cardinality(array(select unnest(pv.community_roles)  intersect select unnest(pc.community_roles))), 0),
    (pv.gender_identity is not null and pv.gender_identity = pc.gender_identity),
    (pv.pronouns is not null and pv.pronouns = pc.pronouns)
  into v_hobbies, v_causes, v_roles, v_gender_match, v_pron_match
  from profiles pv, profiles pc
  where pv.user_id = p_viewer and pc.user_id = p_candidate;

  -- Overlapping saved/visited places (favorites + checkins).
  select
    (select count(*) from (
        select venue_id from venue_favorites where user_id = p_viewer
        intersect select venue_id from venue_favorites where user_id = p_candidate) s)
  + (select count(*) from (
        select city_id from city_favorites where user_id = p_viewer
        intersect select city_id from city_favorites where user_id = p_candidate) s)
  + (select count(*) from (
        select venue_id from venue_checkins where user_id = p_viewer
        intersect select venue_id from venue_checkins where user_id = p_candidate) s)
  into v_places;

  -- Event co-attendance (going / interested).
  select count(*) into v_events from (
    select event_id from event_attendees where user_id = p_viewer     and status in ('going','interested')
    intersect
    select event_id from event_attendees where user_id = p_candidate and status in ('going','interested')
  ) s;

  -- Shared trip destinations.
  select count(distinct t1.primary_city_id) into v_trips
  from trips t1
  join trips t2 on t1.primary_city_id = t2.primary_city_id
  where t1.owner_id = p_viewer and t2.owner_id = p_candidate
    and t1.primary_city_id is not null;

  -- Mutual accepted friends (relationships are directed; treat as undirected).
  select count(*) into v_friends
  from (
    select target_user_id fid from user_relationships
      where user_id = p_viewer and relationship_type = 'friend' and status = 'accepted'
    union
    select user_id from user_relationships
      where target_user_id = p_viewer and relationship_type = 'friend' and status = 'accepted'
  ) vf
  join (
    select target_user_id fid from user_relationships
      where user_id = p_candidate and relationship_type = 'friend' and status = 'accepted'
    union
    select user_id from user_relationships
      where target_user_id = p_candidate and relationship_type = 'friend' and status = 'accepted'
  ) cf using (fid);

  -- Mutual groups.
  select count(*) into v_groups from (
    select group_id from group_memberships where user_id = p_viewer
    intersect select group_id from group_memberships where user_id = p_candidate
  ) s;

  -- Home city / country (travel style + geo proxy; profiles has no lat/long).
  select
    coalesce(uv.home_city_id    is not null and uv.home_city_id    = uc.home_city_id,    false),
    coalesce(uv.home_country_id is not null and uv.home_country_id = uc.home_country_id, false)
  into v_home_match, v_same_country
  from (select home_city_id, home_country_id from user_travel_preferences where user_id = p_viewer) uv
  full join (select home_city_id, home_country_id from user_travel_preferences where user_id = p_candidate) uc on true;

  v_score :=
      least(coalesce(v_interests,0) * 3, 12)   -- shared interests/hobbies/causes/roles ~30
    + least(coalesce(v_hobbies,0)   * 2, 8)
    + least(coalesce(v_causes,0)    * 2, 6)
    + least(coalesce(v_roles,0)     * 2, 4)
    + least(coalesce(v_places,0)    * 3, 15)   -- overlapping saved/visited places
    + least(coalesce(v_events,0)    * 5, 10)   -- event co-attendance
    + least(coalesce(v_trips,0)     * 5, 10)   -- trip/destination overlap
    + least(coalesce(v_friends,0)   * 2, 10)   -- mutual friends
    + (case when v_home_match then 10 else 0 end)               -- travel style / home
    + least(coalesce(v_groups,0)    * 2, 5)    -- mutual groups
    + (case when v_gender_match then 3 else 0 end)              -- identity affinity ~5
    + (case when v_pron_match then 2 else 0 end)
    + (case when v_home_match then 0 when v_same_country then 2 else 0 end); -- geo proximity

  return least(greatest(round(v_score)::int, 0), 100);
end;
$$;

revoke all on function public.compute_compatibility(uuid, uuid) from public, anon;
grant execute on function public.compute_compatibility(uuid, uuid) to authenticated;

-- =============================================================================
-- people_discovery(viewer, mode, [city], [event], [trip], [limit])
-- Ranked candidate list. Builds a cheap, gated, capped candidate pool per mode,
-- then orders by compute_compatibility (the single source of truth for score).
-- Slice-1 modes: 'dating' and 'locals'. 'shared' jsonb explains the ranking.
-- =============================================================================
create or replace function public.people_discovery(
  p_viewer   uuid,
  p_mode     text,
  p_city_id  uuid default null,
  p_event_id uuid default null,
  p_trip_id  uuid default null,
  p_limit    int  default 60
)
returns table(user_id uuid, score int, shared jsonb)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
-- OUT columns (user_id/score/shared) shadow table columns; bind bare
-- identifiers to columns so the in-query user_id refs aren't ambiguous.
#variable_conflict use_column
declare
  v_is_place boolean := (p_city_id is not null or p_event_id is not null);
begin
  if p_viewer is null then return; end if;
  -- Same impersonation guard as compute_compatibility.
  if auth.uid() is not null and p_viewer is distinct from auth.uid() then
    return;
  end if;

  if p_mode = 'dating' then
    -- Server-side age/opt-in wall — UI gating is not the only line of defense.
    if not public.is_intimate_eligible(p_viewer) then
      return;
    end if;
    return query
    with pool as (
      select dv.user_id as cand, dv.last_active_at
      from intimate_discovery_v dv
      where dv.user_id <> p_viewer
        and not public.intimate_is_blocked(p_viewer, dv.user_id)
        and not exists (
          select 1 from intimate_passes ip
          where ip.actor_id = p_viewer and ip.target_id = dv.user_id)
        and (p_city_id is null or dv.discovery_city_id = p_city_id)
      order by dv.last_active_at desc nulls last
      limit 300
    )
    select
      pool.cand,
      public.compute_compatibility(p_viewer, pool.cand) as score,
      jsonb_build_object(
        'shared_events', (select count(*) from event_attendees a
                            join event_attendees b on a.event_id = b.event_id
                            where a.user_id = p_viewer and b.user_id = pool.cand),
        'mutual_groups', (select count(*) from group_memberships g1
                            join group_memberships g2 on g1.group_id = g2.group_id
                            where g1.user_id = p_viewer and g2.user_id = pool.cand)
      )
    from pool
    order by score desc, pool.last_active_at desc nulls last, pool.cand
    limit greatest(p_limit, 1);
    return;
  end if;

  -- 'locals' (and default): public/community profiles, optionally scoped to a
  -- city (locals + travelers) or an event (attendees).
  return query
  with pool as (
    select p.user_id as cand, p.last_active_at
    from profiles p
    where p.user_id <> p_viewer
      and not public.intimate_is_blocked(p_viewer, p.user_id)
      and (
        case
          when p_event_id is not null then exists (
            select 1 from event_attendees ea
            where ea.event_id = p_event_id and ea.user_id = p.user_id
              and ea.status in ('going','interested'))
          when p_city_id is not null then (
            exists (select 1 from user_travel_preferences u
                    where u.user_id = p.user_id and u.home_city_id = p_city_id)
            or (p.travel_mode->>'city_id') = p_city_id::text)
          else true
        end
      )
      and (
        case
          -- Place rails require explicit opt-in to be shown in a place context.
          when v_is_place then coalesce(p.presence_visibility->>'in_discovery','false') = 'true'
          -- Global directory mirrors directory visibility (no presence leak).
          else coalesce(p.privacy_settings->>'profile_visibility','public') in ('public','community')
        end
      )
    order by p.last_active_at desc nulls last
    limit 300
  )
  select
    pool.cand,
    public.compute_compatibility(p_viewer, pool.cand) as score,
    jsonb_build_object(
      'shared_events',  (select count(*) from event_attendees a
                           join event_attendees b on a.event_id = b.event_id
                           where a.user_id = p_viewer and b.user_id = pool.cand),
      'mutual_groups',  (select count(*) from group_memberships g1
                           join group_memberships g2 on g1.group_id = g2.group_id
                           where g1.user_id = p_viewer and g2.user_id = pool.cand),
      'mutual_friends', (select count(*) from (
                            select target_user_id fid from user_relationships
                              where user_id = p_viewer and relationship_type='friend' and status='accepted'
                            union select user_id from user_relationships
                              where target_user_id = p_viewer and relationship_type='friend' and status='accepted') vf
                          join (
                            select target_user_id fid from user_relationships
                              where user_id = pool.cand and relationship_type='friend' and status='accepted'
                            union select user_id from user_relationships
                              where target_user_id = pool.cand and relationship_type='friend' and status='accepted') cf
                          using (fid))
    )
  from pool
  order by score desc, pool.last_active_at desc nulls last, pool.cand
  limit greatest(p_limit, 1);
end;
$$;

revoke all on function public.people_discovery(uuid, text, uuid, uuid, uuid, int) from public, anon;
grant execute on function public.people_discovery(uuid, text, uuid, uuid, uuid, int) to authenticated;
