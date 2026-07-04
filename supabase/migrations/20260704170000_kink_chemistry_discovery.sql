-- Chemistry: pre-consent compatibility bonus from kink-list overlap, fed into
-- dating discovery. Privacy stance: only categories BOTH users have already
-- set to 'matches' or 'members' tier participate (data each party has
-- consented to show matches); output to clients is a coarse band, never raw
-- counts, never item data. compute_compatibility itself is untouched — it
-- serves all people modes.

create or replace function public.compute_chemistry(p_viewer uuid, p_candidate uuid)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int := 0;
begin
  if p_viewer is null or p_candidate is null or p_viewer = p_candidate then
    return 0;
  end if;
  -- Same impersonation guard as compute_compatibility.
  if auth.uid() is not null and p_viewer is distinct from auth.uid() then
    return 0;
  end if;
  if public.intimate_is_blocked(p_viewer, p_candidate) then
    return 0;
  end if;
  if not public.is_intimate_eligible(p_viewer)
     or not public.is_intimate_eligible(p_candidate) then
    return 0;
  end if;

  with
  mine as (
    select kr.item_id, kr.side
    from public.kink_ratings kr
    join public.kink_items ki on ki.id = kr.item_id and ki.is_active
    join public.kink_category_visibility kv
      on kv.user_id = kr.user_id and kv.category_id = ki.category_id
    where kr.user_id = p_viewer
      and kr.rating in ('favorite','like','curious','maybe')
      and public.kink_tier_rank(kv.tier) <= 2
  ),
  theirs as (
    select kr.item_id, kr.side
    from public.kink_ratings kr
    join public.kink_items ki on ki.id = kr.item_id and ki.is_active
    join public.kink_category_visibility kv
      on kv.user_id = kr.user_id and kv.category_id = ki.category_id
    where kr.user_id = p_candidate
      and kr.rating in ('favorite','like','curious','maybe')
      and public.kink_tier_rank(kv.tier) <= 2
  ),
  vetoed as (
    select distinct kr.item_id
    from public.kink_ratings kr
    where kr.user_id in (p_viewer, p_candidate)
      and kr.rating in ('no','hard_limit')
  )
  select count(distinct m.item_id) into v_count
  from mine m
  join theirs t on t.item_id = m.item_id
    and ( (m.side = 'general'    and t.side = 'general')
       or (m.side = 'giving'     and t.side = 'receiving')
       or (m.side = 'receiving'  and t.side = 'giving')
       or (m.side = 'self'       and t.side = 'partner')
       or (m.side = 'partner'    and t.side = 'self')
       or (m.side = 'dominant'   and t.side = 'submissive')
       or (m.side = 'submissive' and t.side = 'dominant') )
  where not exists (select 1 from vetoed x where x.item_id = m.item_id);

  return least(v_count * 2, 15);
end;
$$;

revoke all on function public.compute_chemistry(uuid, uuid) from public, anon;
grant execute on function public.compute_chemistry(uuid, uuid) to authenticated;

-- Band for client display (never expose raw counts/points).
create or replace function public.kink_chemistry_band(p_points int)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_points, 0) <= 0 then 'none'
    when p_points <= 4 then 'low'
    when p_points <= 9 then 'medium'
    else 'high'
  end;
$$;

revoke all on function public.kink_chemistry_band(int) from public, anon;
grant execute on function public.kink_chemistry_band(int) to authenticated, service_role;

-- =============================================================================
-- people_discovery: recreate with chemistry folded into the DATING branch only.
-- Body copied from 20260624090000; 'locals' branch unchanged.
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
    ),
    scored as (
      select
        pool.cand,
        pool.last_active_at,
        public.compute_compatibility(p_viewer, pool.cand) as compat,
        public.compute_chemistry(p_viewer, pool.cand) as chem
      from pool
    )
    select
      scored.cand,
      least(scored.compat + scored.chem, 100) as score,
      jsonb_build_object(
        'shared_events', (select count(*) from event_attendees a
                            join event_attendees b on a.event_id = b.event_id
                            where a.user_id = p_viewer and b.user_id = scored.cand),
        'mutual_groups', (select count(*) from group_memberships g1
                            join group_memberships g2 on g1.group_id = g2.group_id
                            where g1.user_id = p_viewer and g2.user_id = scored.cand),
        'chemistry_band', public.kink_chemistry_band(scored.chem)
      )
    from scored
    order by score desc, scored.last_active_at desc nulls last, scored.cand
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
