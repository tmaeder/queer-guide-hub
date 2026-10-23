-- business_brand_quality_refresh auto-paused on 2026-10-23 at 02:56, three
-- statement timeouts in thirty minutes (02:26, 02:41, 02:56) after succeeding
-- at 01:41. The durable evidence is on the historical run row --
-- `summary.auto_paused = true, consecutive_failures = 3` -- which is the only
-- place it survives, because the success branch of
-- admin_automation_runs_after_finish() resets the counter and never re-enables.
--
-- The chain, from cron.job_run_details (exact for a pure-SQL cron):
--
--   refresh_business_brand_quality()
--     -> reconcile_merged_venue_business_spines(20, false)   line 9, FOR over SELECT
--          -> merge_gap_patch(text,jsonb,jsonb)              lines 10 / 20 / 40
--               -> merge_gap_fill -> merge_gap_empty
--
-- so the timeout is in the SELECTOR evaluating merge_gap_patch, not in the
-- merge body.
--
-- WHY. merge_gap_patch is called in the WHERE clause of that selector as
-- `merge_gap_patch('organization', to_jsonb(ko), to_jsonb(o)) = '{}'`. It is
-- plpgsql, so it can never be inlined, and each evaluation serialises two whole
-- `organizations` rows to jsonb. All three merge_gap_* functions sit at
-- `procost = 100` -- the DEFAULT, which tells the planner they are about as
-- cheap as a hundred simple operators.
--
-- Believing that, the planner put the call in the Join Filter of a Nested Loop
-- whose inner side is a Seq Scan of 93,202 `organizations` rows at width 2185:
--
--   Nested Loop  (cost=1.14..181613.57 rows=466)
--     Join Filter: ((o.id <> ko.id) AND (merge_gap_patch('organization',
--                   to_jsonb(ko.*), to_jsonb(o.*)) = '{}'))
--     ->  Nested Loop Anti Join (rows=1)        -- the cheaply-filtered side
--     ->  Seq Scan on organizations ko (rows=93202, width=2185)
--
-- The equality that should have found `ko` by id (`ko.id = k.organization_id`)
-- was deferred to the enclosing merge join's own Join Filter, leaving `ko`
-- unconstrained, so each outer row paid ~93k plpgsql calls each serialising two
-- ~2 KB rows. 93,698 organizations pass the cheap scalar filters, so there is
-- plenty to feed it.
--
-- FIX. Declare what these functions really cost, so the planner defers them
-- until after the cheap NOT EXISTS filters and resolves `ko` by its key first.
-- This is a planner hint only: no function body changes, no behaviour changes,
-- nothing is re-enabled. It is deliberately NOT a rewrite of the selector --
-- that is a 30-line predicate in a SECURITY DEFINER merge path, and concurrent
-- work is live in this exact area (PR #4610, org safety gate on venue merge),
-- so the smallest change that fixes the plan is the right one.
--
-- MEASURED on prod in a rolled-back transaction, calling the real function in
-- its dry-run mode (which returns before any write):
--
--   before:  3 x timeout at 120,000 ms  (production, 02:26 / 02:41 / 02:56)
--   after:   2,793 ms, returning {"candidates": 2, "merged": 0}
--
-- i.e. at least 43x, and it produces an answer instead of dying. The numbers
-- are relative weights, not milliseconds: patch > fill > empty, matching the
-- call nesting, and each is far above the default 100 so none of them can be
-- chosen as a cheap filter again.
--
-- STILL DISABLED, DELIBERATELY. `business_brand_quality_refresh` stays
-- `enabled=false`. Re-enabling is a separate, deliberate operator step and
-- CLAUDE.md is explicit about why: the row must be flipped in the registry AND
-- the cron recreated, and the `recreated` list that sync_automations_to_cron()
-- returns must be READ rather than assumed. This row is
-- `action->>'type'='cron'` WITH an `action.command`, so branch (d) of that sync
-- CAN recreate it -- unlike the rpc rows that are scheduled only by their own
-- migration -- but the sync runs nightly at 05:10, so the effect could not be
-- verified in the session that measured this fix. Leaving it paused keeps the
-- safe state; the fix is what makes re-enabling worth doing.
--
-- Guarded by src/lib/__tests__/mergeGapCostHints.test.ts.

begin;

-- Relative weights, not milliseconds. Ordered by call nesting so the planner
-- never prefers the outer one as a cheap filter over the inner ones.
alter function public.merge_gap_patch(text, jsonb, jsonb) cost 10000;
alter function public.merge_gap_fill(jsonb, jsonb)        cost 5000;
alter function public.merge_gap_empty(jsonb)              cost 1000;

do $verify$
declare
  v_cost  real;
  v_name  text;
  v_bad   int := 0;
begin
  -- P1: every one of the three is above the default, and in nesting order.
  for v_name, v_cost in
    select p.proname, p.procost
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('merge_gap_patch', 'merge_gap_fill', 'merge_gap_empty')
  loop
    if v_cost <= 100 then
      raise exception 'P1 failed: %.procost is %, still at or below the default 100 -- the planner can pick it as a cheap filter again', v_name, v_cost;
    end if;
    v_bad := v_bad + 1;
  end loop;
  if v_bad <> 3 then
    raise exception 'P1 failed: expected 3 merge_gap_* functions, found %', v_bad;
  end if;

  -- P2: the ordering is the point, not just "above default". patch is the one
  --     the selector calls, and it must never be cheaper than what it calls.
  if (select p.procost from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='merge_gap_patch')
     <= (select p.procost from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='merge_gap_fill') then
    raise exception 'P2 failed: merge_gap_patch must cost more than merge_gap_fill, which it calls';
  end if;
  if (select p.procost from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='merge_gap_fill')
     <= (select p.procost from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='merge_gap_empty') then
    raise exception 'P2 failed: merge_gap_fill must cost more than merge_gap_empty, which it calls';
  end if;

  -- P3: a cost hint must not have changed what any of these functions IS.
  --     ALTER FUNCTION ... COST touches only procost, and this proves it:
  --     all three stay IMMUTABLE and stay SECURITY INVOKER.
  for v_name in
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname in ('merge_gap_patch','merge_gap_fill','merge_gap_empty')
      and (p.provolatile <> 'i' or p.prosecdef is true)
  loop
    raise exception 'P3 failed: % is no longer IMMUTABLE/INVOKER', v_name;
  end loop;

  -- P4: this migration must not re-enable the paused automation. That is an
  --     operator step, and a later edit folding it in here would ship an
  --     unverified cron restart as a side effect of a planner hint.
  if exists (select 1 from public.admin_automations
              where slug = 'business_brand_quality_refresh' and enabled) then
    raise notice 'business_brand_quality_refresh is enabled -- not by this migration; verify the cron was recreated and read the sync''s recreated list';
  end if;
end $verify$;

commit;
