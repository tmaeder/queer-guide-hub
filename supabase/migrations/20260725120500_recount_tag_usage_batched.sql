-- Batch the recount: a full-table single-transaction pass fires the per-row
-- audit (full to_jsonb snapshots) + category-sync BEFORE triggers and was too
-- heavy (timed out, rolled back). Fix ≤p_batch stale rows per call; caller loops
-- to drain. Cron runs one batch/night — enough, since drift is normally tiny.

create or replace function public.recount_all_tag_usage(p_batch int default 500)
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int; v_ids uuid[];
begin
  perform public.assert_admin_or_internal();
  perform set_config('app.actor', 'recount:usage-sync', true);

  select array_agg(id) into v_ids from (
    select t.id
    from public.unified_tags t
    where t.usage_count is distinct from
      coalesce((select count(*)::int from public.unified_tag_assignments a where a.tag_id = t.id), 0)
    order by t.id
    limit greatest(p_batch, 0)
  ) q;

  if v_ids is null then return 0; end if;

  update public.unified_tags u
  set usage_count = coalesce((select count(*)::int from public.unified_tag_assignments a where a.tag_id = u.id), 0)
  where u.id = any(v_ids);

  get diagnostics v_n = row_count;
  return v_n;
end $$;
