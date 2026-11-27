-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127084429 with no repo file — the signature of
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
-- Register before scheduling so the admin kill switch and run ledger work.
do $$
declare stage text; job_slug text; command text; cadence text;
begin
  foreach stage in array array['pending','editorial'] loop
    job_slug:='organisation_description_'||stage;
    cadence:=case when stage='pending' then '* * * * *' else '*/2 * * * *' end;
    command:=format($cmd$
      select net.http_post(
        url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/organisation-description-cleanup',
        headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',
          (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
        body:=jsonb_build_object('stage',%L,'batch_size',%s),timeout_milliseconds:=60000
      ) where exists(select 1 from public.admin_automations where slug=%L and enabled);
    $cmd$,stage,case when stage='pending' then 100 else 20 end,job_slug);
    insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,conditions,action,schedule)
      values(job_slug,'Organisation description '||stage,
        'Clean imported/edited venue and organisation descriptions, preserve originals, and route uncertain English edits to the review inbox. Bounded queue with retries and daily model budget.',
        'system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
        jsonb_build_object('type','cron','jobname',job_slug,'command',command),cadence)
      on conflict(slug) do update set action=excluded.action,schedule=excluded.schedule,updated_at=now();
    perform cron.schedule(job_slug,cadence,public.admin_automation_effective_command(job_slug,command));
  end loop;
end $$;
;
