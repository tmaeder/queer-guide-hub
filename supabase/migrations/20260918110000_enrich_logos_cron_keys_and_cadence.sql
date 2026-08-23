-- The logo crons were calling `enrich-logos` with keys it does not read.
--
-- Both registered commands POST `{"content_type": …, "batch": true,
-- "batch_limit": 200}`. The function reads **`table`** and **`batch_size`**.
-- Not one of those three keys matches, so for the whole life of these two jobs:
--
--   * `table` was undefined and fell through to its `'all'` default, so BOTH
--     jobs did venues AND events — the second run of each night re-walked the
--     work-list the first had already drained;
--   * `batch_limit: 200` was ignored and the real batch was the `batch_size`
--     default of 100, so the registry claimed twice the throughput it had.
--
-- It "worked" only because every unread key had a defensible default. That is
-- the same shape as the fault this migration's sibling fixes: a call that fails
-- silently into a plausible-looking success. The command now says what it does.
--
-- Cadence goes nightly → hourly for venues, because the work-list is currently
-- ~11k rows deep. `enrich-logos` was measured at ~1.1 s/row (a 100-row batch
-- runs past 120 s), so the per-invocation batch CANNOT be raised much — the
-- edge function's wall clock is the binding constraint, not the database.
-- Frequency is therefore the only lever: 100/night needs ~110 nights to drain
-- what one working API token just made eligible; 100/hour needs ~5 days. Once
-- drained the job is self-limiting — the work-list query returns zero rows and
-- the run costs one round trip — and the standing benefit is that a newly
-- imported venue gets its logo within the hour instead of the next morning.
--
-- Events stay nightly on purpose. An event's `website` is usually a ticketing
-- page rather than an organisation, and the historical hit rate reflects that;
-- there is no backlog worth draining faster.
--
-- NOTE on the `::text` casts below: `to_jsonb()` is polymorphic (anyelement),
-- and a dollar-quoted literal arrives as type `unknown`, so without the cast
-- Postgres cannot resolve the call — `42804: could not determine polymorphic
-- type because input has type unknown`. The first version of this migration
-- shipped without them and `supabase db push` aborted on it, which is why the
-- deploy went red rather than half-applying.

update public.admin_automations
set action = jsonb_set(
      action,
      '{command}',
      to_jsonb($cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/enrich-logos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"table": "venues", "batch_size": 100}'::jsonb,
    timeout_milliseconds := 250000
  ) AS request_id;
  $cmd$::text)
    ),
    schedule = '0 * * * *'
where slug = 'enrich_logos_venues';

update public.admin_automations
set action = jsonb_set(
      action,
      '{command}',
      to_jsonb($cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/enrich-logos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"table": "events", "batch_size": 100}'::jsonb,
    timeout_milliseconds := 250000
  ) AS request_id;
  $cmd$::text)
    )
where slug = 'enrich_logos_events';

-- The registry is the record; pg_cron is downstream of it. This is the branch
-- that rewrites an already-scheduled job whose command text has drifted —
-- without it, `cron.schedule` from a migration is undone by the next reconciler
-- pass, and the two would disagree silently (see CLAUDE.md, "Cron automations
-- record their own runs"). The wrapped form is derived, never authored here.
select public.sync_automations_to_cron(true);
