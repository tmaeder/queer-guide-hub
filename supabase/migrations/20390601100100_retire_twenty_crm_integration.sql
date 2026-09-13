-- Retire the Twenty CRM integration.
--
-- It has been dormant since it ran: admin_automations.twenty_sync is already
-- enabled=false, no cron.job references it, and every row it ever wrote landed
-- in one hour on 2026-07-16. The content it was holding is landed by
-- 20390601100000, which must run first — this migration asserts that rather
-- than trusting file order.
--
-- Dropped here, edge functions and admin surface go with the same PR:
--   twenty_inbound_review              the review queue (806 rows)
--   approve_twenty_inbound_change      RPCs the admin page called
--   reject_twenty_inbound_change
--   twenty_inbound_allowed_columns     the write allowlist those two enforced
--   admin_automations row twenty_sync
--
-- The `twenty_record_id` correspondence is not preserved anywhere. That is
-- deliberate: keeping a dangling foreign id for a system that no longer syncs
-- invites a future reader to treat it as live. If Twenty ever comes back, it
-- re-matches on the entity's own fields the way the first import did.
do $$
declare v_open int;
begin
  select count(*) into v_open
  from public.twenty_inbound_review r
  join public.personalities p on p.id = r.entity_id
  where r.status = 'pending' and r.entity_type = 'personality'
    and r.changes ? 'description'
    and coalesce(r.changes->'description'->>'to','') <> ''
    and coalesce(p.description,'') = '';
  if v_open > 0 then
    raise exception
      'refusing to drop twenty_inbound_review: % personality descriptions are still unlanded. Run 20390601100000 first.',
      v_open;
  end if;
end $$;

drop function if exists public.approve_twenty_inbound_change(uuid);
drop function if exists public.reject_twenty_inbound_change(uuid);
drop function if exists public.twenty_inbound_allowed_columns(text);
drop table if exists public.twenty_inbound_review;

delete from public.admin_automations where slug = 'twenty_sync';

-- A `drop … if exists` with a mismatched signature is a silent no-op, so assert
-- the outcome instead of trusting the statements above.
do $$
declare v_left text;
begin
  select string_agg(x, ', ') into v_left from (
    select 'table twenty_inbound_review' as x
      from information_schema.tables
     where table_schema='public' and table_name='twenty_inbound_review'
    union all
    select 'function '||p.proname
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and p.proname in ('approve_twenty_inbound_change','reject_twenty_inbound_change','twenty_inbound_allowed_columns')
    union all
    select 'automation twenty_sync'
      from public.admin_automations where slug='twenty_sync'
  ) t;
  if v_left is not null then
    raise exception 'twenty teardown incomplete, still present: %', v_left;
  end if;
end $$;
