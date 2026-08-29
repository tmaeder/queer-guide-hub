-- RENUMBERED from 20261006180000, content otherwise unchanged.
--
-- `supabase db push` aborts on an unapplied migration that sorts BELOW the
-- newest version already applied to prod, and it aborts on the FIRST such file,
-- taking every later migration with it. This file and five siblings were in that
-- state, so from 2026-08-29 10:24Z every deploy-supabase-functions run failed and
-- NO migration reached prod — six merged PRs' worth, not just their own.
-- 20261006180000 was additionally a DUPLICATE version, which `db push` resolves by
-- matching history on the version alone: it would have been silently SKIPPED as
-- already-applied rather than reported.
--
-- `run_tag_category_resync` has existed since 20260802105740 and has never
-- been scheduled: no `cron.job`, no `admin_automations` row. A repair
-- function nothing calls is a repair that does not happen.
--
-- What it repairs is the denormalized `unified_tags.category` TEXT mirror,
-- recomputed from the junction (the source of truth). That mirror has three
-- writers and no reconciler, and the v3 swap demonstrated the consequence
-- rather than predicting it: 20261006140000 RENAMED stops while keeping
-- their slugs (`safe-spaces` became "Venue Features & Policies",
-- `bdsm-power-exchange` became "Dynamics & Roles"), and a rename updates
-- `tag_categories.name` without touching the copies of the old name sitting
-- on 316 tags. Those rows now name a category that does not exist — the
-- `legacy_category_values` state `scripts/data-quality/e2e-tag-taxonomy.mjs`
-- check #8 exists to catch, and the state the search facet reads.
--
-- Only 2 of the 316 are active, because the re-filing migrations rewrote the
-- mirror for every row they touched and deprecated tags were out of their
-- scope. That is the shape of the whole class: the drift is invisible while
-- something happens to be rewriting the rows, and permanent for the rows
-- nothing touches.
--
-- Nightly at 03:10, ahead of the 03:15 tag-quality recompute and the 03:45
-- assignment reconcile, so a corrected mirror is what those read. Batch
-- 2,000: the function's own UPDATE is guarded by `is distinct from`, so a
-- clean corpus writes zero rows and touches no search trigger; the cap only
-- bounds the first pass over a dirty one.
--
-- Registry row first, then the cron — the registry is the record and a
-- retirement means disabling the row, never deleting it.

-- Shape copied from the existing rpc rows (`city_airport_link`), not
-- invented: `trigger` is NOT NULL, there is no `category` column, and
-- `action` carries `fn` + `jobname` + the readable `command`.
insert into admin_automations (slug, name, description, trigger, action, schedule, enabled, managed_by)
values (
  'tag_category_resync',
  'Tag category denormalization resync',
  'Recomputes unified_tags.category text from the tag_category_assignments junction. Repairs drift left by category renames and by any writer that updates one surface without the other.',
  jsonb_build_object('type', 'schedule'),
  jsonb_build_object(
    'type', 'rpc',
    'fn', 'run_tag_category_resync',
    'jobname', 'tag_category_resync',
    'command', 'SELECT public.run_tag_category_resync(2000);'
  ),
  '10 3 * * *',
  true,
  'system'
)
on conflict (slug) do update
  set enabled = true,
      schedule = excluded.schedule,
      action = excluded.action,
      description = excluded.description;

-- An `action->>'type' = 'rpc'` row carries no `action.command`, so
-- `sync_automations_to_cron()` branch (d) structurally cannot create this
-- job — every rpc automation is scheduled by its own migration, and
-- re-enabling one later leaves it on-but-unscheduled unless the schedule is
-- recreated from here.
select cron.unschedule('tag_category_resync')
where exists (select 1 from cron.job where jobname = 'tag_category_resync');

select cron.schedule(
  'tag_category_resync',
  '10 3 * * *',
  $cron$select public.run_tag_category_resync(2000);$cron$
);

-- One pass now, so the 316 rows the rename stranded do not wait for tonight.
do $$
declare
  v_fixed int;
  v_left int;
begin
  perform set_config('app.actor', 'migration:20261006180000_schedule_tag_category_resync', true);
  select public.run_tag_category_resync(2000) into v_fixed;

  select count(*) into v_left
  from unified_tags u
  where u.category is not null
    and not exists (select 1 from tag_categories c where c.name = u.category);

  raise notice 'tag category resync: repaired % rows, % still name no category', v_fixed, v_left;
end $$;
