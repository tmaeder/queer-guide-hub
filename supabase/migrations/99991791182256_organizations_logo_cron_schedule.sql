-- The organizations logo automation was registered, enabled, and wired to nothing.
--
-- `99991791179157` created the `enrich_logos_organizations` row with its cadence
-- inside `action->>'schedule'`. That is not where the reconciler looks.
-- `sync_automations_to_cron()` branch (d) — the one that creates a cron job for
-- an enabled registry row that has none — reads the TOP-LEVEL `schedule` COLUMN:
--
--     WHERE a.enabled
--       AND a.schedule IS NOT NULL          -- <= the column, not action->>'schedule'
--       AND a.action->>'command' IS NOT NULL
--       AND NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = COALESCE(a.action->>'jobname', a.slug))
--
-- So the row read as enabled on every admin surface, `admin_automations` showed
-- a schedule to anyone reading `action`, and the job would never have existed.
-- Measured on prod after that migration applied: `cron.job` 0 rows,
-- `sync_automations_to_cron(false)` returning `recreated: []`.
--
-- THIS IS THE FAILURE THIS REPO ALREADY RECORDS FOR THE VILLAGE RELINK ENGINE —
-- a worker that shipped with no cron and no registry row and sat dead — reached
-- by the opposite door: here the registry row is the thing that exists and the
-- cron is what is missing. Nothing in CI can see it, because the row is
-- perfectly well-formed; it is only visible by asking the reconciler what it
-- intends to do.
--
-- READ THE RECONCILER'S OWN ANSWER, NEVER THE REGISTRY ROW. `enabled = true` is
-- not evidence that a job exists, and `action->>'schedule'` is not evidence that
-- anything is scheduled. `sync_automations_to_cron(false)` naming the job in
-- `recreated` is the evidence, which is exactly what this file's postcondition
-- asserts.
--
-- Both sibling rows are the shape to copy, and were read rather than assumed:
--   enrich_logos_venues  schedule='6 * * * *'   action->>'jobname'='enrich-logos-venues'
--   enrich_logos_events  schedule='35 3 * * *'  action->>'jobname'='enrich-logos-events'
-- Both carry a NULL `action->>'schedule'`, i.e. the column is the only place the
-- cadence is expressed. The `jobname` override is adopted too, so the job is
-- named `enrich-logos-organizations` like its siblings instead of taking the
-- underscored slug — cosmetic in isolation, but branch (a) matches a cron to a
-- registry row by that key, and an inconsistent convention is how a job starts
-- reading as "unregistered".

update public.admin_automations
set schedule = '25 4 * * *',
    -- One source for the cadence. Leaving a second copy inside `action` is the
    -- comment-that-outlived-its-truth shape: the next reader cannot tell which
    -- one the scheduler honours, and the answer is neither obvious nor the one
    -- most people would guess.
    action = (action - 'schedule') || jsonb_build_object('jobname', 'enrich-logos-organizations'),
    updated_at = now()
where slug = 'enrich_logos_organizations'
  and schedule is null;

do $verify$
declare
  v_schedule text;
  v_jobname  text;
  v_plan     jsonb;
begin
  select a.schedule, a.action->>'jobname' into v_schedule, v_jobname
  from public.admin_automations a where a.slug = 'enrich_logos_organizations';

  if v_schedule is null then
    raise exception 'enrich_logos_organizations still has no schedule column — the cron can never be created';
  end if;
  if v_jobname is distinct from 'enrich-logos-organizations' then
    raise exception 'enrich_logos_organizations jobname is %, expected enrich-logos-organizations', v_jobname;
  end if;

  -- THE POSTCONDITION THAT MATTERS. Not "the column is set" — that is a restatement
  -- of the UPDATE — but that the reconciler, asked in dry-run mode, now INTENDS to
  -- create this job. That is the only check that would have caught the original
  -- defect, because every other property of the row was already correct.
  select public.sync_automations_to_cron(false) into v_plan;
  if not (v_plan -> 'recreated') ? 'enrich-logos-organizations' then
    raise exception
      'sync_automations_to_cron would NOT create enrich-logos-organizations; plan was %', v_plan;
  end if;

  raise notice 'enrich-logos-organizations will be created by the next automation_cron_sync (05:10 UTC)';
end
$verify$;
