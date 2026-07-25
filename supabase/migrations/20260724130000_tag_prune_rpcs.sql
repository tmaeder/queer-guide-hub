-- Reversibly deprecate active tags with zero real usage. Batched: unified_tags
-- fires a search-sync trigger and the DB is disk-constrained. Returns rows affected.
create or replace function public.deprecate_unused_tags(
  p_batch int default 500,
  p_reason text default 'auto: zero usage'
) returns int
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_n int;
begin
  perform public.assert_admin_or_internal();

  select array_agg(id) into v_ids from (
    select t.id
    from public.unified_tags t
    where t.status = 'active'
      and coalesce((select usage_count from public.tag_usage_summary s where s.id = t.id), 0) = 0
    order by t.id
    limit greatest(p_batch, 0)
  ) q;

  if v_ids is null then return 0; end if;

  update public.unified_tags
  set status = 'deprecated', deprecated_at = now(), deprecation_reason = p_reason
  where id = any(v_ids);
  get diagnostics v_n = row_count;

  insert into public.tag_change_log (tag_id, action_type, before_data, after_data, actor, reason)
  select id, 'deprecate',
         jsonb_build_object('status', 'active'),
         jsonb_build_object('status', 'deprecated', 'reason', p_reason),
         'deprecate_unused_tags', p_reason
  from unnest(v_ids) id;

  return v_n;
end;
$$;

create or replace function public.restore_deprecated_tag(p_tag_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin_or_internal();

  update public.unified_tags
  set status = 'active', deprecated_at = null, deprecation_reason = null
  where id = p_tag_id and status = 'deprecated';

  if not found then return false; end if;

  insert into public.tag_change_log (tag_id, action_type, before_data, after_data, actor, reason)
  values (p_tag_id, 'restore',
          jsonb_build_object('status', 'deprecated'),
          jsonb_build_object('status', 'active'),
          'restore_deprecated_tag', 'manual restore');
  return true;
end;
$$;

revoke all on function public.deprecate_unused_tags(int, text) from public;
revoke all on function public.restore_deprecated_tag(uuid) from public;
grant execute on function public.deprecate_unused_tags(int, text) to service_role;
grant execute on function public.restore_deprecated_tag(uuid) to service_role, authenticated;
