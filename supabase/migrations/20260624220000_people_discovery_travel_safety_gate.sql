-- Outing-safety gate for travel-mode people discovery (defense-in-depth).
--
-- The trip-planner travel rail is already hidden for criminalizing/death-penalty
-- destinations client-side (TravelBuddiesSection). This hardens the source: the
-- people_discovery RPC must itself never reveal who else is traveling to such a
-- destination, even on a direct call or a future city-scoped travel surface.
--
-- ONLY the 'travel' branch changes. 'dating'/'friends'/'locals' are intentionally
-- left untouched — suppressing locals discovery in criminalizing countries would
-- harm the queer residents the app serves, the opposite of the invariant's intent.
-- Reuses public.location_is_high_risk (20260623160000); body is otherwise verbatim
-- from 20260624100000_people_discovery_friends_travel.sql.

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
#variable_conflict use_column
declare
  v_is_place boolean := (p_city_id is not null or p_event_id is not null);
begin
  if p_viewer is null then return; end if;
  if auth.uid() is not null and p_viewer is distinct from auth.uid() then
    return;
  end if;

  if p_mode = 'dating' then
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

  if p_mode = 'friends' then
    return query
    with pool as (
      select p.user_id as cand, p.last_active_at
      from profiles p
      where p.user_id <> p_viewer
        and not public.intimate_is_blocked(p_viewer, p.user_id)
        and coalesce(p.privacy_settings->>'profile_visibility','public') in ('public','community')
        and not exists (
          select 1 from user_relationships r
          where r.relationship_type = 'friend' and r.status = 'accepted'
            and ((r.user_id = p_viewer and r.target_user_id = p.user_id)
              or (r.user_id = p.user_id and r.target_user_id = p_viewer)))
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
    return;
  end if;

  if p_mode = 'travel' then
    declare
      v_city    uuid;
      v_country uuid;
    begin
      if p_trip_id is not null then
        select primary_city_id, primary_country_id into v_city, v_country
          from trips where id = p_trip_id;
      else
        v_city := p_city_id;
      end if;

      -- Outing-safety invariant: never reveal who else is traveling to a
      -- criminalizing / death-penalty destination. location_is_high_risk resolves
      -- the country from the city when v_country is null.
      if v_city is not null and public.location_is_high_risk(v_country, v_city) then
        return;
      end if;

      return query
      with ctx as (
        select coalesce((select primary_city_id from trips where id = p_trip_id), p_city_id) as city,
               (select start_date from trips where id = p_trip_id) as sd,
               (select end_date   from trips where id = p_trip_id) as ed
      ),
      pool as (
        select p.user_id as cand, p.last_active_at
        from profiles p, ctx
        where p.user_id <> p_viewer
          and not public.intimate_is_blocked(p_viewer, p.user_id)
          and (
            case when ctx.city is not null then
              coalesce(p.presence_visibility->>'in_discovery','false') = 'true'
              and (
                (p.travel_mode->>'city_id') = ctx.city::text
                or exists (
                  select 1 from trips t
                  where t.owner_id = p.user_id and t.primary_city_id = ctx.city
                    and (ctx.sd is null
                         or daterange(t.start_date, t.end_date, '[]') && daterange(ctx.sd, ctx.ed, '[]')))
              )
            else
              coalesce(p.presence_visibility->>'in_directory','false') = 'true'
              and nullif(p.travel_mode->>'city_id','') is not null
            end
          )
        order by p.last_active_at desc nulls last
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
    end;
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
          when v_is_place then coalesce(p.presence_visibility->>'in_discovery','false') = 'true'
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
