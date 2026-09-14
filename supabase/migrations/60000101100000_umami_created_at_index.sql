-- umami.website_event has no index on created_at, and three separate readers
-- filter by it. That is why the analytics sentinel went blind.
--
-- WHAT WAS MEASURED, on prod, before this file was written.
--
-- `analytics_hygiene_stats()` took **10,344 ms**. `service_role` carries no
-- rolconfig of its own, so it inherits `authenticator`'s `statement_timeout=8s`
-- — PostgREST cancelled the call and answered HTTP 500, and
-- `check-pipeline-health.mjs` printed:
--
--     ⚠ analytics_hygiene_stats → HTTP 500 (20700301100500 not applied?)
--       This check measured NOTHING — it did not pass.
--
-- The probe was right that it had failed and WRONG about why: 20700301100500 is
-- applied and the function is healthy — it returns `probe_ok: true` in 10.3s over
-- a direct connection. It simply does not fit in 8 seconds. So the section that
-- carries the consent gate — the single number that would catch a second,
-- ungated tracker again (docs/audits/2026-08-21-signup-consent-gap.md) — had not
-- been measured at all, while the run stayed amber rather than red.
--
-- THE CAUSE IS ONE MISSING INDEX, not a slow function. `umami.website_event`
-- carries exactly three indexes — `event_id` (pk), `session_id`, `website_id` —
-- and NONE on `created_at`, which is the column every time-windowed reader
-- filters on. Three full scans of 3,042,416 rows per call: the 24h `recent` CTE,
-- the 24h `page_views` writer probe, and the `< now() - 100 days` retention
-- residue.
--
-- Measured in a rolled-back transaction on prod, with the index present:
--
--     analytics_hygiene_stats()   10,344 ms  ->  4,699 ms   (55% under the 8s ceiling)
--     index build                                  6,400 ms
--
-- 4.7s against an 8s ceiling is 41% headroom on a table that will SHRINK from
-- here (see part 2), not grow — current inflow is 42 page views/day.
--
-- NOT `CONCURRENTLY`: migrations run inside a transaction and cannot use it. The
-- 6.4s write lock is taken deliberately — this is an analytics table at 42
-- writes/day, and a few seconds of queued umami inserts is not a user-facing
-- cost. Stated rather than left for someone to rediscover.

create index if not exists website_event_created_at_idx
  on umami.website_event using btree (created_at);

comment on index umami.website_event_created_at_idx is
  'Time-window reads: analytics_hygiene_stats() 24h CTEs + retention residue, and prune_umami_events''s ORDER BY created_at. Without it every one of those is a full scan of ~3M rows (60000101100000).';

-- ── PART 2: the backlog the sentinel could not report ───────────────────────
--
-- With the timeout removed, the check that was never reached now fires — and it
-- is a REAL finding, not a threshold artefact: **340,477** umami events are
-- older than 100 days against a 90-day retention job, and the script's own
-- threshold is 100,000.
--
-- Retention is not broken and was never stalled. `umami_retention` (55 2 * * *)
-- has been succeeding nightly, deleting its full 20,000 cap every run in 13-15s.
-- It is simply capped below the residue: 340,477 / 20,000 = 17 more nights, so
-- the sentinel would sit red for ~12 days reporting a job that is working.
--
-- The cap was sized against the UNINDEXED table, where `order by created_at
-- limit 20000` was a full scan plus a sort of 3M rows every night. With the
-- index the same function does 2.5x the work in LESS time — measured in a
-- rolled-back transaction on prod:
--
--     prune_umami_events(90, 20000)   13-15s   (today, live run history)
--     prune_umami_events(90, 50000)     9.9s   (with the index)
--                                      -> events_deleted 50000, sessions_deleted 303
--
-- 50,000 clears the residue in 7 nights and then idles, because steady-state
-- inflow is three orders of magnitude below it. This changes only HOW FAST the
-- already-sanctioned deletion proceeds — not the 90-day window, not the >= 30
-- day floor guard, not what qualifies. Nothing new becomes deletable.
--
-- BOTH SIDES ARE REPOINTED. The registry is the record of truth, but
-- `sync_automations_to_cron()` only CREATES a missing job from it — a command
-- that has drifted on an existing job is the `detect_stale_venues` trap, where a
-- threshold fix sat in a migration for two weeks while the live cron kept
-- calling the old arguments. This is an `action->>'type'='rpc'` row, scheduled
-- by its own migration (20700301100100) and unwrapped by design (family C,
-- recorded from cron.job_run_details, so it must NOT gain a
-- admin_automation_run_begin prefix).
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS: a concurrent session may have
-- tuned this already, and an exact-match premise that aborts would block every
-- migration queued behind it. Both writes are guarded on the value they replace
-- and no-op when the target state already holds; the assertion at the bottom is
-- what this file refuses to finish without.

update public.admin_automations
   set action = jsonb_set(action, '{command}', '"SELECT public.prune_umami_events(90, 50000);"'::jsonb)
 where slug = 'umami_retention'
   and action->>'command' = 'SELECT public.prune_umami_events(90, 20000);';

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid
    from cron.job
   where jobname = 'umami_retention'
     and command = 'SELECT public.prune_umami_events(90, 20000);';

  if v_jobid is not null then
    perform cron.alter_job(v_jobid, command => 'SELECT public.prune_umami_events(90, 50000);');
    raise notice 'umami_retention cron command repointed to a 50000 cap';
  else
    raise notice 'umami_retention cron already off the 20000 cap — left alone';
  end if;
end $$;

-- ── POSTCONDITIONS ─────────────────────────────────────────────────────────

do $$
declare
  v_idx      boolean;
  v_registry text;
  v_cron     text;
begin
  select exists (
    select 1 from pg_indexes
     where schemaname = 'umami'
       and tablename  = 'website_event'
       and indexname  = 'website_event_created_at_idx'
  ) into v_idx;

  if not v_idx then
    raise exception 'website_event_created_at_idx is missing — the sentinel stays blind';
  end if;

  select action->>'command' into v_registry
    from public.admin_automations where slug = 'umami_retention';
  select command into v_cron
    from cron.job where jobname = 'umami_retention';

  -- The registry and the live job must agree. Either one alone reading 50000 is
  -- the drift this part exists to close, not a partial success.
  if v_registry is distinct from v_cron then
    raise exception 'umami_retention drift: registry=% cron=%', v_registry, v_cron;
  end if;

  if v_registry not like '%50000%' then
    raise exception 'umami_retention still capped below 50000: %', v_registry;
  end if;

  raise notice 'ok: created_at index present; umami_retention registry and cron both at %', v_registry;
end $$;
