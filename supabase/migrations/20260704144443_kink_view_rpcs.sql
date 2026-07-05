-- Kink checklist: cross-user view RPC + grant set/revoke RPC.
-- All cross-user reads flow through here (ratings tables are self-only RLS).

create or replace function public.kink_get_visible(p_owner uuid)
returns table(
  category_slug text,
  item_slug text,
  side text,
  rating text,
  needs_discussion boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_viewer uuid := auth.uid();
  v_rank int;
begin
  if v_viewer is null or p_owner is null then
    return;
  end if;

  v_rank := public.kink_access_rank(v_viewer, p_owner);
  if v_rank < 1 then
    return;
  end if;

  return query
  select
    kc.slug,
    ki.slug,
    kr.side,
    kr.rating,
    kr.needs_discussion
  from public.kink_ratings kr
  join public.kink_items ki on ki.id = kr.item_id and ki.is_active
  join public.kink_categories kc on kc.id = ki.category_id and kc.is_active
  join public.kink_category_visibility kv
    on kv.user_id = kr.user_id and kv.category_id = kc.id
  where kr.user_id = p_owner
    and kr.rating in ('favorite','like','curious','maybe')
    and v_rank >= public.kink_tier_rank(kv.tier)
  order by kc.sort_order, ki.sort_order, kr.side;
end;
$$;

revoke all on function public.kink_get_visible(uuid) from public, anon;
grant execute on function public.kink_get_visible(uuid) to authenticated;

create or replace function public.kink_grant_set(
  p_other uuid,
  p_kind text,
  p_active boolean,
  p_conversation_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_convo uuid := null;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_other is null or p_other = v_uid then
    raise exception 'invalid target' using errcode = '22023';
  end if;
  if p_kind not in ('view','compare') then
    raise exception 'invalid kind' using errcode = '22023';
  end if;
  if not public.is_intimate_eligible(v_uid) then
    raise exception 'not eligible' using errcode = '42501';
  end if;
  if public.intimate_is_blocked(v_uid, p_other) then
    raise exception 'not available' using errcode = '42501';
  end if;

  if p_conversation_id is not null and exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = v_uid
  ) then
    v_convo := p_conversation_id;
  end if;

  if p_active then
    insert into public.kink_grants (grantor_id, grantee_id, kind, conversation_id)
    values (v_uid, p_other, p_kind, v_convo)
    on conflict (grantor_id, grantee_id, kind) do update set
      revoked_at = null,
      conversation_id = coalesce(excluded.conversation_id, kink_grants.conversation_id),
      updated_at = now();
  else
    update public.kink_grants
       set revoked_at = now(), updated_at = now()
     where grantor_id = v_uid and grantee_id = p_other and kind = p_kind
       and revoked_at is null;
  end if;
end;
$$;

revoke all on function public.kink_grant_set(uuid, text, boolean, uuid) from public, anon;
grant execute on function public.kink_grant_set(uuid, text, boolean, uuid) to authenticated;
