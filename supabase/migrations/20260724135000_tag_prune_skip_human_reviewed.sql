-- Auto-prune must never override human curation. A pre-existing BEFORE UPDATE trigger
-- (log_unified_tag_change) also blocks system:% actors from modifying human_reviewed tags,
-- which made the unfiltered batch fail atomically. Redefine the RPC to skip human_reviewed
-- tags entirely — those unused-but-curated tags are a human/cockpit decision, not sprawl.
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
      and coalesce(t.human_reviewed, false) = false
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
