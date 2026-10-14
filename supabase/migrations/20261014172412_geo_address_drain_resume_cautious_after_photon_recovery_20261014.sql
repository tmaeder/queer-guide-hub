-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261014172412 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
do $$
declare j record;
begin
  select jobid, command, schedule, active into j from cron.job where jobname='geo_address_drain';
  if not found or j.active or j.schedule <> '*/15 * * * *'
     or j.command not like '%''batch_size'', 5%'
     or j.command not like 'SELECT public.admin_automation_run_begin(''geo_address_drain'', 1); SELECT public.admin_automation_run_begin(''geo_address_drain'', 1);%' then
    raise exception 'Unexpected postal cron state; refusing cautious resume';
  end if;
  perform cron.alter_job(
    job_id := j.jobid,
    command := replace(j.command,
      'SELECT public.admin_automation_run_begin(''geo_address_drain'', 1); SELECT public.admin_automation_run_begin(''geo_address_drain'', 1);',
      'SELECT public.admin_automation_run_begin(''geo_address_drain'', 1);'),
    active := true
  );
  update public.admin_automations
  set enabled=true, schedule='*/15 * * * *'
  where slug='geo_address_drain' and enabled=false and lifecycle_state='paused';
  if not found then raise exception 'Unexpected postal automation state'; end if;
end $$;;
