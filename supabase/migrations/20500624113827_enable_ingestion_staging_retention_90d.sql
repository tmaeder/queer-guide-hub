-- Enables `ingestion_staging_retention` at a 90-DAY window. Requested explicitly by the repo
-- owner on 2026-09-11; the mechanism shipped disabled in 20440718134209 precisely so this choice
-- would be made by a human rather than inferred.
--
-- THIS DELETES DATA AND THE DELETE CASCADES. Measured on prod immediately before writing:
--
--     ingestion_staging rows to delete    67,381   (2026-02-15 .. 2026-06-13)
--     ingestion_events    cascade        113,092
--     enrichment_audit    cascade          5,978
--     ingestion_dlq       cascade              0   (table is empty)
--     scraper_dedupe_decisions            SET NULL, rows kept
--     rows PROTECTED (disposition='pending')  6,598
--
-- Nothing created after 2026-06-13 is touched, and no `pending` row is touched at any age --
-- a pending row is either still moving through the pipeline or queued for a human.
--
-- WHAT IS LOST, stated plainly rather than buried: the ingestion provenance for those rows --
-- "what did we receive, and what did we do with it" -- is gone permanently. That is the cost of
-- the window, it was the reason the mechanism shipped off, and it is being accepted deliberately.
--
-- IT DRAINS GRADUALLY, WHICH IS A FEATURE. The registered command is
-- prune_ingestion_staging(90, 5000) on `20 2 * * *`, so the backlog clears over ~14 nightly runs
-- rather than one 67k-row delete. That keeps each transaction small against the six FK cascades,
-- and it means the first run can be inspected and the job switched off before the second --
-- `update admin_automations set enabled=false where slug='ingestion_staging_retention'`.
-- After the backlog clears, steady state is a few hundred rows a night.
--
-- The floor guard inside the function still applies: p_older_than_days < 30 raises. Changing the
-- window later means editing `action.command` here, not calling the function by hand.
--
-- sync_automations_to_cron(true) is called explicitly rather than waiting for the nightly 05:10
-- reconciler, and the cron row is then ASSERTED. An action.type='rpc' registry row is built by
-- branch (d) only because this one carries action.command -- the rpc automations that lack it
-- cannot be rescheduled at all, which is the trap this repo has hit before. Verified in a
-- rolled-back transaction before shipping: enabling + sync creates jobname
-- `ingestion_staging_retention`, schedule `20 2 * * *`, command
-- `SELECT public.prune_ingestion_staging(90, 5000);`.

update public.admin_automations
   set enabled = true,
       updated_at = now()
 where slug = 'ingestion_staging_retention';

do $$
declare
  v_sync jsonb;
begin
  if not exists (select 1 from public.admin_automations where slug = 'ingestion_staging_retention') then
    raise exception 'ingestion_staging_retention registry row is missing -- 20440718134209 did not apply';
  end if;

  if not (select enabled from public.admin_automations where slug = 'ingestion_staging_retention') then
    raise exception 'failed to enable ingestion_staging_retention';
  end if;

  -- Confirm the window actually registered is the one this migration claims. If someone edited
  -- action.command to a different number, the header above would be a lie.
  if (select action->>'command' from public.admin_automations where slug = 'ingestion_staging_retention')
     is distinct from 'SELECT public.prune_ingestion_staging(90, 5000);' then
    raise exception 'registered command is not the 90-day form: %',
      (select action->>'command' from public.admin_automations where slug = 'ingestion_staging_retention');
  end if;

  v_sync := public.sync_automations_to_cron(true);
  raise notice 'sync_automations_to_cron: %', v_sync;

  -- Read the result, do not assume it worked.
  if not exists (select 1 from cron.job where jobname = 'ingestion_staging_retention') then
    raise exception 'enabled but NOT scheduled -- sync_automations_to_cron did not create the job (sync said %)', v_sync;
  end if;

  if (select schedule from cron.job where jobname = 'ingestion_staging_retention') is distinct from '20 2 * * *' then
    raise exception 'scheduled with unexpected cron expression: %',
      (select schedule from cron.job where jobname = 'ingestion_staging_retention');
  end if;
end $$;
