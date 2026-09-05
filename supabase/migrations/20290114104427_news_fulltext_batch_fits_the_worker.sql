-- Bring news_fulltext_backfill's batch down to something the edge worker can
-- actually finish. It has been intermittently failing since June 2026.
--
-- THE FAULT, read off prod rather than inferred:
--
--   admin_automation_run_requests -> net._http_response for the failing runs:
--     status_code 546
--     {"code":"WORKER_RESOURCE_LIMIT",
--      "message":"Function failed due to not having enough compute resources"}
--
--   Runs that SUCCEED report small work: items 0, items 2, items 18
--   (07:10 on 2026-09-05: items 18, improved 5, unchanged 13, failed 0).
--   Runs that FAIL are the full batches. Roughly one run in three on
--   2026-09-04: 04:30 error, 04:40 ok, 04:50 error, 05:00 ok.
--
-- WHY. `20260619150100` scheduled this job with
--     body := '{"batch_size":50,"concurrency":5}'
-- while the edge function's own defaults are batch_size 30 / concurrency 4
-- (news-fulltext-backfill/index.ts:52-53, capped at 60/6). The cron has always
-- asked for more than the author's default. Each item does a full
-- `fetchHtml(url)` of a news article page and then `extractArticle` parses it,
-- with `concurrency` of them in flight — so a full batch is 50 page downloads
-- plus 50 HTML parses inside one invocation, and that exceeds the worker's
-- compute budget.
--
-- This is NOT a regression and nothing about it changed recently. It has been
-- failing about a third of the time for two and a half months. What changed is
-- that on 2026-09-03 three failures finally landed CONSECUTIVELY, which tripped
-- auto_pause_threshold=3, and the nightly reconciler then unscheduled the
-- disabled row — taking the job fully offline until it was restored on
-- 2026-09-05. An intermittent fault with a consecutive-failure trigger is a
-- time bomb, not a nuisance: it fires whenever the dice come up three times.
--
-- THE NUMBER. 20/3, chosen from the two real data points either side — 18 items
-- completed, 50 did not — and deliberately below the function's own default of
-- 30 rather than at it, since 30 has never been observed succeeding here.
-- Concurrency drops 5 -> 3 because peak memory is set by how many article
-- documents are in flight at once, not by the batch total.
--
-- Throughput is not the constraint. At */10 this is 2,880 articles/day, and the
-- selector (`news_thin_for_refetch`) returns 0 eligible rows right now — the
-- backlog is drained and work arrives in bursts. The old 50 only ever mattered
-- on the bursts, which is exactly when it broke.
--
-- Registry first, then the cron: `admin_automations` is the register of record
-- and `sync_automations_to_cron()` reconciles pg_cron from it, so leaving the
-- registry at 50 would let a later reconciler pass undo this.

update public.admin_automations
set action = jsonb_set(
      action,
      '{command}',
      to_jsonb($cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/news-fulltext-backfill',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
    body := '{"batch_size":20,"concurrency":3}'::jsonb,
    timeout_milliseconds := 70000);
$cmd$::text)
    ),
    description = coalesce(description, '')
      || ' [20290114104427: batch 50/5 -> 20/3. The original 50/5 (20260619150100) exceeded the'
      || ' edge worker''s compute budget and returned HTTP 546 WORKER_RESOURCE_LIMIT on roughly'
      || ' one run in three since June 2026; three consecutive failures auto-paused the job on'
      || ' 2026-09-03. Observed: 18 items completes, 50 does not.]',
    -- Re-enable, and clear the counter that paused it.
    --
    -- This migration exists BECAUSE 50/5 auto-paused the job on 2026-09-03, so
    -- the row it edits is disabled -- and the verification block below asserts
    -- `enabled is true`. Without these two columns that assertion reads ambient
    -- state this migration never wrote, and aborts `db push` over the very
    -- condition the retune above is the fix for. A failed push strands every
    -- later migration; that class held the queue down for hours on 2026-09-05.
    -- With them, the assertion verifies this migration's OWN effect, which is
    -- the only thing a migration may safely assert.
    --
    -- It is also required for the reschedule to survive at all:
    -- `sync_automations_to_cron()` branch (b) unschedules the cron of any row
    -- that is `enabled = false`, so retuning without re-enabling would leave the
    -- job correctly tuned and then silently unscheduled by the nightly pass.
    --
    -- `consecutive_failures` is reset explicitly because the auto-pause trigger
    -- counts terminal error runs since the last terminal non-error run; a stale
    -- 3 would re-trip the pause on the first new failure instead of after
    -- `auto_pause_threshold`.
    enabled = true,
    consecutive_failures = 0,
    updated_at = now()
where slug = 'news_fulltext_backfill';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'news_fulltext_backfill') then
    perform cron.unschedule('news_fulltext_backfill');
  end if;
end $$;

-- The pg_cron body is DERIVED, never hand-written: admin_automation_effective_command()
-- prepends admin_automation_run_begin() and token-substitutes net.http_post ->
-- public.automation_http_post so the request id can be filed against the open
-- run (20260910163700). Hand-authoring that wrapper here would almost certainly
-- differ by whitespace from what the generator produces, and the reconciler's
-- command-drift branch would then rewrite this job on its next pass — leaving a
-- migration that silently does not stick.
select cron.schedule(
  'news_fulltext_backfill',
  '*/10 * * * *',
  public.admin_automation_effective_command(
    'news_fulltext_backfill',
    (select action->>'command' from public.admin_automations where slug = 'news_fulltext_backfill')
  )
);

-- Assert, because a cron.schedule inside a migration has silently not taken
-- before (20260820191944), and because the whole point here is a specific
-- number: a job rescheduled with the OLD body would look identical to success.
do $$
declare
  v_cron_cmd text;
  v_reg_cmd  text;
  v_enabled  boolean;
begin
  select command into v_cron_cmd from cron.job where jobname = 'news_fulltext_backfill';
  if v_cron_cmd is null then
    raise exception 'news_fulltext_backfill cron job is missing after reschedule';
  end if;
  if v_cron_cmd not like '%"batch_size":20,"concurrency":3%' then
    raise exception 'news_fulltext_backfill cron still carries the old batch body: %', left(v_cron_cmd, 300);
  end if;
  -- The run-tracking wrapper must survive, or the job stops recording runs and
  -- auto-pause can never fire for it again (20260910163700).
  if v_cron_cmd not like '%admin_automation_run_begin%'
     or v_cron_cmd not like '%automation_http_post%' then
    raise exception 'news_fulltext_backfill lost its run-tracking wrapper';
  end if;

  select action->>'command', enabled into v_reg_cmd, v_enabled
  from public.admin_automations where slug = 'news_fulltext_backfill';
  if v_reg_cmd is null then
    raise exception 'news_fulltext_backfill has no registry command';
  end if;
  if v_reg_cmd not like '%"batch_size":20,"concurrency":3%' then
    raise exception 'registry command still carries the old batch body — a reconciler pass would undo this';
  end if;
  if v_enabled is not true then
    raise exception 'news_fulltext_backfill is disabled; this migration tunes a job that is expected to run';
  end if;
end $$;
