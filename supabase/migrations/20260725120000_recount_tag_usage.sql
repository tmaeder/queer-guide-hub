-- Fix + maintain the usage_count desync: 1,563 active tags (44%) had usage_count
-- / tag_usage_summary = 0 while carrying real unified_tag_assignments (e.g.
-- restaurant-venue: 0 vs 508). This silently corrupts deprecate_unused_tags
-- ("unused" → would wrongly deprecate used tags), merge canonical choice
-- ("higher usage wins"), and admin display.
--
-- Safe as a single pass: trg_search_documents_tag is column-scoped and does NOT
-- watch usage_count → no search-sync storm. The IS DISTINCT FROM guard writes
-- only changed rows. The audit trigger raises for human_reviewed tags ONLY when
-- app.actor LIKE 'system:%' (defaults to 'system:trigger'), so we set a
-- non-system actor first. Nightly cron keeps it synced going forward (cheap:
-- normally near-zero changed rows).

create or replace function public.recount_all_tag_usage()
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform public.assert_admin_or_internal();
  -- non-'system:%' actor so the human_reviewed audit guard does not raise
  perform set_config('app.actor', 'recount:usage-sync', true);

  with real as (
    select t.id, coalesce(c.n, 0) as n
    from public.unified_tags t
    left join (
      select tag_id, count(*)::int as n
      from public.unified_tag_assignments
      group by tag_id
    ) c on c.tag_id = t.id
  )
  update public.unified_tags u
  set usage_count = real.n
  from real
  where real.id = u.id
    and u.usage_count is distinct from real.n;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.recount_all_tag_usage() from public;
grant execute on function public.recount_all_tag_usage() to service_role;

-- nightly maintenance (cheap; IS DISTINCT FROM means few writes once synced)
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values ('recount_tag_usage','Recount tag usage',
        'Nightly: resyncs unified_tags.usage_count from unified_tag_assignments (denorm counter drifts on bulk assignment writes).',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"recount_all_tag_usage"}'::jsonb, '20 4 * * *')
on conflict (slug) do update set schedule=excluded.schedule, enabled=excluded.enabled,
  description=excluded.description, name=excluded.name, action=excluded.action, trigger=excluded.trigger;

select cron.schedule('recount_tag_usage', '20 4 * * *',
  $cron$ select public.recount_all_tag_usage(); $cron$);
