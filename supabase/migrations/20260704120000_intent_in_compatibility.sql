-- Unified status: profiles.looking_for gets its first real consumer.
-- Mutual "looking for" overlap now adds a small boost (max +4) to
-- compute_compatibility. Display of intent remains owner-only — the boost is
-- one of ~14 aggregate factors and is not invertible to a specific selection,
-- so this leaks nothing about any single user's intent (outing safety).
-- Function body otherwise identical to 20260624090000_people_match_engine.sql.

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
  v_intent       int := 0;
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
    coalesce(cardinality(array(select unnest(pv.looking_for)      intersect select unnest(pc.looking_for))), 0),
    (pv.gender_identity is not null and pv.gender_identity = pc.gender_identity),
    (pv.pronouns is not null and pv.pronouns = pc.pronouns)
  into v_hobbies, v_causes, v_roles, v_intent, v_gender_match, v_pron_match
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
    + least(coalesce(v_intent,0)    * 2, 4)    -- mutual intent (looking_for overlap)
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
