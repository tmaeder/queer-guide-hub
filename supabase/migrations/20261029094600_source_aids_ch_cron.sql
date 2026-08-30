-- Weekly re-sync of the Swiss sexual-health registry (aids.ch).
--
-- Registry row FIRST, then the cron. `admin_automations` is the record of
-- record: `sync_automations_to_cron()` recreates any enabled row whose job is
-- missing, so a `cron.unschedule` on its own is undone by the next reconciler
-- pass — retirement means disabling the row, never deleting it
-- (`20260813100000`, after `wf-enrich-wolfram-countries` came back from the
-- dead twice).
--
-- Shape is `action.type = 'cron'` with a `net.http_post` command, matching the
-- live `tag_prose_pass` row, so the run-tracking reconciler
-- (`admin_automation_effective_command`) wraps it for dispatch and response
-- truth instead of leaving `last_run_at` null forever the way all 144 cron rows
-- did until `20260910163700`.
--
-- WEEKLY, NOT NIGHTLY. The upstream is a curated national registry edited by
-- the centres themselves; it changes on the scale of weeks. A nightly pass
-- would re-write 201 organization rows every night, and every one of those
-- writes fires `trg_search_documents_organization` into `search_reindex_queue`
-- for no new information.
--
-- `timeout_milliseconds` IS SET EXPLICITLY. pg_net's default is 5s, and a
-- response that arrives after it is recorded as `timed_out` -> `partial`, which
-- never touches `consecutive_failures` — so a job that always overruns the
-- default can never auto-pause and never reads as failing either. 55s covers
-- one feed fetch plus 201 bounded RPC round trips.

insert into admin_automations (slug, name, description, trigger, action, schedule, enabled, managed_by)
values (
  'source_aids_ch',
  'Swiss sexual-health registry sync (aids.ch)',
  'Fetches the aids.ch / repertoire-sante-sexuelle.ch directory (201 counselling, testing and treatment centres) and upserts each as an organizations row with roles=[support] via commit_health_service_org. New rows land status=draft; publication is scripts/data-quality/import-aids-ch.mjs --phase promote.',
  jsonb_build_object('type', 'schedule'),
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'source_aids_ch',
    'command', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-aids-ch',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := jsonb_build_object('triggered_by', 'cron'),
    timeout_milliseconds := 55000
  ) as request_id;
  $cmd$
  ),
  '25 4 * * 1',
  true,
  'system'
)
on conflict (slug) do update
  set enabled     = true,
      schedule    = excluded.schedule,
      action      = excluded.action,
      description = excluded.description;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'source_aids_ch') then
    perform cron.unschedule('source_aids_ch');
  end if;
end $$;

select cron.schedule(
  'source_aids_ch',
  '25 4 * * 1',
  $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/source-aids-ch',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := jsonb_build_object('triggered_by', 'cron'),
    timeout_milliseconds := 55000
  ) as request_id;
  $cron$
);

-- A migration's `cron.schedule` is not durable on its own — `20260820191944`
-- is the record of a threshold fix that was issued exactly this way and never
-- took, leaving the registry and the live job disagreeing for two weeks. Assert
-- both sides here rather than trusting the statement above.
do $$
declare
  v_sched text;
begin
  if not exists (select 1 from admin_automations where slug = 'source_aids_ch' and enabled) then
    raise exception 'source_aids_ch registry row missing or disabled';
  end if;

  select schedule into v_sched from cron.job where jobname = 'source_aids_ch';
  if v_sched is null then
    raise exception 'source_aids_ch cron job was not created';
  end if;
  if v_sched <> '25 4 * * 1' then
    raise exception 'source_aids_ch cron schedule drifted at creation: %', v_sched;
  end if;
end $$;
