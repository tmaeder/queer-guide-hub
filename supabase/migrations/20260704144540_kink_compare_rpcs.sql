-- Kink compare: double-opt-in intersection reveal.
-- Consent = two active 'compare' grants. Output strictly the intersection of
-- positives with axis complements; 'no'/'hard_limit' items silently excluded
-- (never returned, never attributed). Owner tier is the ceiling: 'private'
-- categories never enter compare.

create or replace function public.kink_compare_status(p_other uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_mine boolean;
  v_theirs boolean;
begin
  if v_uid is null or p_other is null or p_other = v_uid then
    return 'none';
  end if;
  if public.intimate_is_blocked(v_uid, p_other)
     or not public.is_intimate_eligible(v_uid)
     or not public.is_intimate_eligible(p_other) then
    return 'none';
  end if;

  select
    exists (select 1 from public.kink_grants
            where grantor_id = v_uid and grantee_id = p_other
              and kind = 'compare' and revoked_at is null),
    exists (select 1 from public.kink_grants
            where grantor_id = p_other and grantee_id = v_uid
              and kind = 'compare' and revoked_at is null)
  into v_mine, v_theirs;

  if v_mine and v_theirs then return 'active'; end if;
  if v_mine then return 'requested_by_me'; end if;
  if v_theirs then return 'requested_by_other'; end if;
  return 'none';
end;
$$;

revoke all on function public.kink_compare_status(uuid) from public, anon;
grant execute on function public.kink_compare_status(uuid) to authenticated;

create or replace function public.kink_compare(p_other uuid)
returns table(
  category_slug text,
  item_slug text,
  my_side text,
  my_rating text,
  their_side text,
  their_rating text,
  kind text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if public.kink_compare_status(p_other) <> 'active' then
    return;
  end if;

  return query
  with
  mine as (
    select kr.item_id, kr.side, kr.rating, kr.needs_discussion
    from public.kink_ratings kr
    join public.kink_items ki on ki.id = kr.item_id and ki.is_active
    join public.kink_category_visibility kv
      on kv.user_id = kr.user_id and kv.category_id = ki.category_id
    where kr.user_id = v_uid
      and kr.rating in ('favorite','like','curious','maybe')
      and public.kink_tier_rank(kv.tier) <= 3
  ),
  theirs as (
    select kr.item_id, kr.side, kr.rating, kr.needs_discussion
    from public.kink_ratings kr
    join public.kink_items ki on ki.id = kr.item_id and ki.is_active
    join public.kink_category_visibility kv
      on kv.user_id = kr.user_id and kv.category_id = ki.category_id
    where kr.user_id = p_other
      and kr.rating in ('favorite','like','curious','maybe')
      and public.kink_tier_rank(kv.tier) <= 3
  ),
  vetoed as (
    select distinct kr.item_id
    from public.kink_ratings kr
    where kr.user_id in (v_uid, p_other)
      and kr.rating in ('no','hard_limit')
  )
  select
    kc.slug,
    ki.slug,
    m.side,
    m.rating,
    t.side,
    t.rating,
    case
      when m.needs_discussion or t.needs_discussion or ki.discussion_recommended
        then 'discuss'
      else 'overlap'
    end
  from mine m
  join theirs t on t.item_id = m.item_id
    and ( (m.side = 'general'    and t.side = 'general')
       or (m.side = 'giving'     and t.side = 'receiving')
       or (m.side = 'receiving'  and t.side = 'giving')
       or (m.side = 'self'       and t.side = 'partner')
       or (m.side = 'partner'    and t.side = 'self')
       or (m.side = 'dominant'   and t.side = 'submissive')
       or (m.side = 'submissive' and t.side = 'dominant') )
  join public.kink_items ki on ki.id = m.item_id
  join public.kink_categories kc on kc.id = ki.category_id
  where not exists (select 1 from vetoed x where x.item_id = m.item_id)
  order by kc.sort_order, ki.sort_order, m.side;
end;
$$;

revoke all on function public.kink_compare(uuid) from public, anon;
grant execute on function public.kink_compare(uuid) to authenticated;

create or replace function public.kink_compare_summary(p_other uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_overlaps int := 0;
  v_favorites int := 0;
  v_discuss int := 0;
  v_excluded int := 0;
begin
  if public.kink_compare_status(p_other) <> 'active' then
    return null;
  end if;

  select
    count(*),
    count(*) filter (where c.my_rating = 'favorite' and c.their_rating = 'favorite'),
    count(*) filter (where c.kind = 'discuss')
  into v_overlaps, v_favorites, v_discuss
  from public.kink_compare(p_other) c;

  with
  mine as (
    select kr.item_id, kr.side
    from public.kink_ratings kr
    join public.kink_items ki on ki.id = kr.item_id and ki.is_active
    join public.kink_category_visibility kv
      on kv.user_id = kr.user_id and kv.category_id = ki.category_id
    where kr.user_id = v_uid
      and kr.rating in ('favorite','like','curious','maybe')
      and public.kink_tier_rank(kv.tier) <= 3
  ),
  theirs as (
    select kr.item_id, kr.side
    from public.kink_ratings kr
    join public.kink_items ki on ki.id = kr.item_id and ki.is_active
    join public.kink_category_visibility kv
      on kv.user_id = kr.user_id and kv.category_id = ki.category_id
    where kr.user_id = p_other
      and kr.rating in ('favorite','like','curious','maybe')
      and public.kink_tier_rank(kv.tier) <= 3
  ),
  vetoed as (
    select distinct kr.item_id
    from public.kink_ratings kr
    where kr.user_id in (v_uid, p_other)
      and kr.rating in ('no','hard_limit')
  )
  select count(distinct m.item_id) into v_excluded
  from mine m
  join theirs t on t.item_id = m.item_id
    and ( (m.side = 'general'    and t.side = 'general')
       or (m.side = 'giving'     and t.side = 'receiving')
       or (m.side = 'receiving'  and t.side = 'giving')
       or (m.side = 'self'       and t.side = 'partner')
       or (m.side = 'partner'    and t.side = 'self')
       or (m.side = 'dominant'   and t.side = 'submissive')
       or (m.side = 'submissive' and t.side = 'dominant') )
  where exists (select 1 from vetoed x where x.item_id = m.item_id);

  return jsonb_build_object(
    'overlaps', v_overlaps,
    'favorites_both', v_favorites,
    'discuss', v_discuss,
    'excluded_count', v_excluded
  );
end;
$$;

revoke all on function public.kink_compare_summary(uuid) from public, anon;
grant execute on function public.kink_compare_summary(uuid) to authenticated;
