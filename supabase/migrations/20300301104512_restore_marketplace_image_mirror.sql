-- marketplace_image_mirror: auto-paused, recovered, never re-enabled — and its
-- cron was then unscheduled underneath it.
--
-- `pipeline-health` has hard-failed for four days on:
--
--   ✗ 3 automation(s) auto-paused, then RECOVERED, and never re-enabled:
--     marketplace_image_mirror, marketplace_description_enhance, news_fulltext_backfill
--
-- The other two are handled by their own PRs (news_fulltext_backfill in the
-- migration that retunes its batch size, marketplace_description_enhance in the
-- one that re-enables it). This is the third, and it is the one with an extra
-- step, because its cron is GONE as well as its flag being off:
--
-- On 2026-09-05, `20270501174243_reenable_venue_geocode_repair` called
-- `sync_automations_to_cron(true)` and its guard reported
-- `unscheduled jobs as a side effect: ["marketplace_image_mirror"]`. That is
-- branch (b) doing exactly what it is meant to do — a registry row with
-- `enabled = false` loses its pg_cron job. So re-enabling the flag alone would
-- leave this on-but-unscheduled, which reads as healthy in the registry and
-- runs never. The job has to be recreated too.
--
-- WHY RE-ENABLING IS THE RIGHT CALL. The sentinel distinguishes two cases, and
-- only one of them is a defect: auto-paused AND STILL FAILING is legitimate and
-- merely warns (marketplace_variant_backfill sits there deliberately), while
-- auto-paused THEN RECOVERED hard-fails, because `admin_automation_runs_after_finish()`
-- resets `consecutive_failures = 0` and `last_run_status = 'success'` on the
-- success branch but never re-enables — so a falsely-paused row ends up reading
-- exactly like a deliberate retirement. This row is in the second state.
--
-- It is re-checked HERE rather than trusted, because the sentinel measured it at
-- 06:33 and this migration applies later. If the job has started failing again
-- in between, the honest thing is to leave it off and say so, NOT to abort:
-- aborting would strand every migration behind this one for a condition that has
-- nothing to do with the schema. That is the failure class that held the queue
-- down for seven hours on 2026-09-05, and it is not worth repeating for a cron.

do $mig$
declare
  v_enabled  boolean;
  v_fails    int;
  v_status   text;
  v_exists   boolean;
  -- Copied VERBATIM from 20260725210000, both headers included. The anon bearer
  -- is not redundant next to the internal secret: the Supabase gateway rejects a
  -- request with no Authorization header before the function is ever reached,
  -- even where the function itself sets verify_jwt=false. 20260725210000's own
  -- header calls this "the established two-header cron convention" — it was
  -- written precisely because sending only the anon bearer started getting 401s
  -- once the function required requireInternalOrAdmin. Dropping either one
  -- reintroduces a 401 that looks like a broken function.
  v_cmd      text := $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-image-mirror',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"limit":40}'::jsonb,
    timeout_milliseconds := 55000
  );
$cron$;
begin
  select a.enabled, coalesce(a.consecutive_failures, 0), a.last_run_status
    into v_enabled, v_fails, v_status
    from public.admin_automations a
   where a.slug = 'marketplace_image_mirror';

  if not found then
    raise notice 'marketplace_image_mirror has no registry row — nothing to restore';
    return;
  end if;

  if v_enabled then
    raise notice 'marketplace_image_mirror is already enabled — nothing to do';
    return;
  end if;

  -- Only restore a row that is genuinely in the paused-then-recovered state.
  -- Anything else is either a deliberate retirement or a job that is still
  -- broken, and neither should be switched back on by a migration.
  if v_fails <> 0 or coalesce(v_status, '') <> 'success' then
    raise notice
      'marketplace_image_mirror is disabled but NOT in the recovered state (consecutive_failures=%, last_run_status=%) — leaving it off deliberately',
      v_fails, coalesce(v_status, 'null');
    return;
  end if;

  update public.admin_automations
     set enabled = true,
         consecutive_failures = 0,
         action = jsonb_set(coalesce(action, '{}'::jsonb), '{command}', to_jsonb(v_cmd)),
         updated_at = now()
   where slug = 'marketplace_image_mirror';

  -- Recreate the job branch (b) removed. Same name replaces, so this is
  -- idempotent. The registry keeps the plain command; the nightly
  -- `sync_automations_to_cron()` re-derives the run-tracking wrapper via
  -- `admin_automation_effective_command()`, which is why the raw form belongs
  -- here and the wrapped form is never written to the registry.
  perform cron.schedule('marketplace_image_mirror', '*/5 * * * *', v_cmd);

  -- Assert THIS migration's own effect, and nothing else about the registry.
  select a.enabled into v_enabled
    from public.admin_automations a where a.slug = 'marketplace_image_mirror';
  select exists (select 1 from cron.job where jobname = 'marketplace_image_mirror')
    into v_exists;

  if not v_enabled then
    raise exception 'marketplace_image_mirror did not re-enable';
  end if;
  if not v_exists then
    raise exception 'marketplace_image_mirror is enabled but has no cron job — it would never run';
  end if;

  raise notice 'marketplace_image_mirror restored: enabled + scheduled */5';
end
$mig$;
