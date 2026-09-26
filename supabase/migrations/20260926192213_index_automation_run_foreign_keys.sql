-- Cover the automation foreign keys flagged by the production advisor. The
-- composite run index also serves the console's per-automation recent-history
-- query and the partial-streak backfill ordering.
create index if not exists admin_automation_run_contexts_run_id_idx
  on private.admin_automation_run_contexts (run_id);

create index if not exists admin_automation_runs_automation_started_idx
  on public.admin_automation_runs (automation_id, started_at desc);

create index if not exists admin_automations_created_by_idx
  on public.admin_automations (created_by)
  where created_by is not null;
