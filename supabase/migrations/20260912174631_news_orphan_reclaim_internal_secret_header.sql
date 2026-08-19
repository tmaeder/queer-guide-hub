-- `news_orphan_reclaim` has never succeeded once. It sends the right secret
-- under the wrong header name.
--
-- The command posts to pipeline-enrich-news and pipeline-quality-enhance with
--
--   'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets
--                WHERE name='internal_invoke_secret')
--
-- but the gate those functions reach — `hasInternalSecret` in
-- `_shared/supabase-client.ts` — reads `x-internal-secret`, and nothing reads
-- `apikey`. Both requests returned 401 on every run until auto-pause disabled
-- the job on 2026-08-17 (consecutive_failures 20 against a threshold of 3).
--
-- NOT a gateway 401. Both functions are verify_jwt=false and the response body
-- is `{"error":"Missing authorization header","success":false}` — the app-level
-- shape from `errorResponse()`, not the gateway's `UNAUTHORIZED_NO_AUTH_HEADER`.
-- Adding an anon bearer, the usual fix for a cron 401, would have changed
-- nothing here.
--
-- Proven by A/B on prod before this migration: the same secret, same body, same
-- moment, two pg_net requests differing only in the header name —
--
--   x-internal-secret -> 200 {"success":true,"items_processed":1,"enriched":1}
--   apikey            -> 401 {"error":"Missing authorization header"}
--
-- and pipeline-quality-enhance likewise 200
-- ({"success":true,"items_processed":1,"review":1}).
--
-- The registry is the record: branch (c2) of sync_automations_to_cron rewrites
-- a type='cron' job's command from `action->>'command'`, so fixing the cron
-- alone would be reverted by the next reconciler pass. Fix the row, then
-- re-schedule from it.

do $$
declare
  v_old text;
  v_new text;
begin
  select action->>'command' into v_old
  from public.admin_automations where slug = 'news_orphan_reclaim';

  if v_old is null then
    raise exception 'news_orphan_reclaim has no registry command — refusing to guess';
  end if;

  v_new := replace(v_old, '''apikey''', '''x-internal-secret''');

  -- Targeted replace rather than a rewritten literal, so an unrelated edit to
  -- this command (batch sizes, a third endpoint) survives. But a no-op replace
  -- must not pass silently as "fixed".
  if v_new = v_old and v_old not like '%x-internal-secret%' then
    raise exception 'news_orphan_reclaim command matched neither the broken nor the fixed header — inspect it by hand';
  end if;

  update public.admin_automations
  set action = jsonb_set(action, '{command}', to_jsonb(v_new)),
      enabled = true,
      consecutive_failures = 0,
      last_run_status = null
  where slug = 'news_orphan_reclaim';
end $$;

-- Auto-pause unscheduled the job (branch (b) is a kill switch), so re-enabling
-- the row is not enough on its own — branch (d) recreates it, but only on the
-- next reconciler pass. Schedule it here through the SAME wrapper the
-- reconciler would use, or (c2) reports drift against what we just scheduled.
do $$
declare
  v_slug    text := 'news_orphan_reclaim';
  v_jobname text;
  v_cmd     text;
  v_sched   text;
begin
  select coalesce(a.action->>'jobname', a.slug),
         public.admin_automation_effective_command(a.slug, a.action->>'command'),
         a.schedule
  into v_jobname, v_cmd, v_sched
  from public.admin_automations a where a.slug = v_slug;

  if exists (select 1 from cron.job where jobname = v_jobname) then
    perform cron.unschedule(v_jobname);
  end if;
  perform cron.schedule(v_jobname, v_sched, v_cmd);
end $$;
