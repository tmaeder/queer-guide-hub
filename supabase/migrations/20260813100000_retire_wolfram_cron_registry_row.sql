-- Finish retiring `wf-enrich-wolfram-countries`. 20260806160000 (#2444)
-- unscheduled the pg_cron job; the job is back, and this is why.
--
-- `sync_automations_to_cron()` treats `admin_automations` as the register of
-- record. Branch (d), "missing crons", takes every row that is `enabled` and
-- carries an `action->>'command'` with no matching `cron.job` — and schedules
-- it. #2444 removed the job and left the registry row enabled with its command
-- intact, so the reconciler saw a cron that ought to exist, did not, and
-- recreated it. Measured on prod today: jobid 2257, active, 0 runs succeeded.
--
-- Nothing malfunctioned. The reconciler did exactly its job, which is why no
-- alarm could have fired: `sync_automations_to_cron(false)` currently reports
-- zero drift on all four branches, because registry and cron agree. They agree
-- on the wrong thing. A drift check compares the two copies of the intent and
-- can never flag the intent itself being stale — so "no drift" is not evidence
-- that a retirement took.
--
-- Rule this generalises to: retiring a cron means retiring the registry row.
-- `cron.unschedule` alone is undone by the next reconciler pass. Measured, not
-- reasoned: replaying #2444's statement and nothing else inside a rolled-back
-- transaction leaves the reconciler's own dry run reporting
--   recreated: ["wf-enrich-wolfram-countries"]
-- while the same dry run after this migration's UPDATE reports nothing at all.
--
-- Disabling rather than deleting is deliberate and is also what actually
-- enforces this: branch (b) is a kill switch that unschedules any job whose
-- registry row is disabled, so a future resurrection is now impossible rather
-- than merely undone. A DELETE would instead make the live job "unregistered",
-- which branch (a) reports and pointedly never auto-kills.
--
-- The retirement reasoning itself is unchanged from #2444 and still holds:
-- `enrich-wolfram-countries` has no `workflow_definitions` row, so every run
-- dies inside `enqueue_workflow`, and Wolfram needs a paid WOLFRAM_APP_ID that
-- was never set. The same country fields are filled by the live, healthy
-- `wf-enrich-country-stats` from the free World Bank API.

update admin_automations
set enabled = false,
    description = coalesce(description, '')
      || ' [RETIRED 2026-08-04: the enrich-wolfram-countries workflow does not exist and'
      || ' WOLFRAM_APP_ID was never set. Superseded by wf-enrich-country-stats (World Bank).'
      || ' Kept disabled rather than deleted so sync_automations_to_cron cannot re-arm it.]',
    updated_at = now()
where slug = 'wf_enrich_wolfram_countries'
  and enabled;

-- Idempotent: only unschedules if present. Runs after the registry update so
-- there is no window in which a concurrent reconciler pass could re-add it.
select cron.unschedule('wf-enrich-wolfram-countries')
where exists (
  select 1 from cron.job where jobname = 'wf-enrich-wolfram-countries'
);
