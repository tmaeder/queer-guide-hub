-- A cron command already re-pointed at the tracking shim was recognised by NEITHER
-- arm of the wrap derivation, so it could never acquire its run bookkeeping.
--
-- `admin_automation_tracking_gaps().untracked_http_dispatchers` has been hard-failing
-- `check-pipeline-health.mjs` on `enrich_logos_organizations`, and the message it
-- prints sends you the wrong way: "route the helper through
-- public.automation_http_post and add it to admin_automation_tracked_callers". That
-- row ALREADY posts through the shim. What it is missing is the other half of the
-- wrapped form -- the `admin_automation_run_begin('<slug>')` prefix -- and without
-- it the shim has no open run to file against: `app.automation_run_id` is never set,
-- so `admin_automation_run_requests` gets no row and `admin_automation_reap_runs()`
-- can never resolve the response. The job dispatches fine and is unverifiable.
--
-- THE BLIND SPOT IS IN `admin_automation_effective_command`, read off its live source
-- rather than inferred:
--
--   if v_cmd ilike '%net.http_post%' then ... v_tracked := true;   -- arm 1
--   if not v_tracked then  <tracked_callers match>  end if;        -- arm 2
--   if not v_tracked then return p_command; end if;                -- unwrapped exit
--
-- The derivation keys on "does this command post DIRECTLY". This row's registry
-- command says `public.automation_http_post`, which does not contain `net.http_post`,
-- and the shim is not in `admin_automation_tracked_callers` (which holds only
-- `enqueue_workflow` and `admin_enqueue_workflow`). Arm 1 misses, arm 2 misses, the
-- command returns unwrapped, and `sync_automations_to_cron()`'s command-drift branch
-- therefore judges it already correct -- forever. A half-migrated command looks
-- migrated, because it uses the shim, and is untracked, because nothing prefixed it.
--
-- THE FIX IS ONE ROW, NOT A FUNCTION CHANGE. `admin_automation_tracked_callers` is
-- documented as proof-of-patching rather than a wish list, and the shim is the
-- mechanism that proof refers to: `automation_http_post` is exactly the function that
-- files a request id against the open run through the transaction-local GUC. Listing
-- it is the strongest possible membership, and it makes arm 2 match. Restating
-- `admin_automation_effective_command` was rejected: that function derives the
-- command for all ~95 wrapped crons, and CLAUDE.md records this layer taking the
-- whole ingest engine down for 40 hours. A one-row insert has a blast radius I can
-- measure; a CREATE OR REPLACE of the deriver does not.
--
-- BLAST RADIUS, MEASURED ON PROD RATHER THAN ARGUED: exactly ONE registry row has a
-- command that uses the shim and does not mention `net.http_post` --
-- `enrich_logos_organizations` -- and it calls the shim exactly ONCE. That matters
-- because arm 2 hardcodes `v_expected_requests := 1` where arm 1 COUNTS the posts, so
-- a shim-direct command that posted twice would be wrapped expecting one request and
-- would read as partially unverified. None does.
--
-- ARM 1 IS UNAFFECTED, which is the thing most worth checking before touching this
-- table. The registry stays canonical and keeps the readable `net.http_post` form, so
-- all ~95 already-wrapped rows still enter arm 1; `v_tracked` is true before arm 2 is
-- consulted, so their request COUNT keeps being counted and not flattened to 1. The
-- insert can only affect commands arm 1 declines.
--
-- THE GATE DOES NOT CLEAR THE MOMENT THIS APPLIES, and that is deliberate. The live
-- pg_cron command is rewritten by `sync_automations_to_cron()`'s drift branch, which
-- runs on the nightly `automation_cron_sync` at 05:10. This migration does NOT call
-- that reconciler: it is global, and CLAUDE.md records it recreating, re-wrapping and
-- unscheduling other jobs in the same pass -- whatever drift exists at CI time is not
-- this change's to apply. So the postcondition asserts the DERIVATION now produces a
-- wrapped command, which is the part this file owns, and the live cron catches up at
-- the next sync.

insert into public.admin_automation_tracked_callers (fn_name, note)
values (
  'automation_http_post',
  'The shim itself. It files each pg_net request id against the open run via the '
  || 'transaction-local GUC app.automation_run_id, so a command that calls it needs '
  || 'the admin_automation_run_begin prefix to have a run to file against. Listed so '
  || 'admin_automation_effective_command arm 2 wraps a command that was already '
  || 're-pointed at the shim and therefore matches neither arm.'
)
on conflict (fn_name) do nothing;

do $verify$
declare
  v_cmd        text;
  v_slug       text := 'enrich_logos_organizations';
  v_registry   text;
  v_shim_rows  int;
  v_arm1_rows  int;
  v_gaps       jsonb;
begin
  -- P1. The shim is registered. `on conflict do nothing` is idempotent, so a
  -- re-run must still assert the END STATE rather than that a row was inserted.
  if not exists (
    select 1 from public.admin_automation_tracked_callers
     where fn_name = 'automation_http_post'
  ) then
    raise exception 'P1 failed: automation_http_post is not a tracked caller';
  end if;

  -- P2. The derivation now wraps the row that was in the blind spot. This is the
  -- state this migration owns; the live cron is rewritten by the nightly sync.
  select a.action->>'command' into v_registry
    from public.admin_automations a where a.slug = v_slug;
  if v_registry is null then
    raise notice 'P2 skipped: % is not registered (nothing to wrap)', v_slug;
  else
    v_cmd := public.admin_automation_effective_command(v_slug, v_registry);
    if v_cmd not ilike '%admin\_automation\_run\_begin%' then
      raise exception 'P2 failed: effective command for % is still unwrapped: %',
        v_slug, left(v_cmd, 200);
    end if;
    -- It must wrap expecting exactly one request, because the command posts once.
    -- A wrap claiming more would leave the run permanently short of its requests.
    if v_cmd not ilike '%admin\_automation\_run\_begin(''' || v_slug || ''', 1)%' then
      raise exception 'P2 failed: % wrapped with the wrong expected-request count: %',
        v_slug, left(v_cmd, 200);
    end if;
  end if;

  -- P3. NON-VACUITY / BLAST RADIUS. The set this insert can affect is the shim-direct
  -- commands, and it must still be the ONE row measured when this was written. If a
  -- later row joined it posting twice, arm 2's hardcoded count of 1 would under-claim
  -- and the wrap would be wrong for it -- so that must fail loudly here rather than
  -- ship quietly.
  select count(*) into v_shim_rows
    from public.admin_automations a
   where a.action->>'type' = 'cron'
     and a.action->>'command' ilike '%automation\_http\_post%'
     and a.action->>'command' not ilike '%net.http_post%';
  if v_shim_rows <> 1 then
    raise exception 'P3 failed: % shim-direct cron row(s), expected the measured 1 -- re-check the per-row post count before trusting arm 2', v_shim_rows;
  end if;

  -- P4. ARM 1 IS UNTOUCHED. The registry keeps the readable direct-post form, so the
  -- already-wrapped fleet must still enter arm 1 and keep its COUNTED request total
  -- rather than arm 2's flat 1. A zero here would mean the fleet had moved into the
  -- arm whose count is hardcoded, which is the regression this insert could plausibly
  -- cause and the reason it is asserted rather than assumed.
  select count(*) into v_arm1_rows
    from public.admin_automations a
   where a.action->>'type' = 'cron'
     and a.action->>'command' ilike '%net.http_post%';
  if v_arm1_rows < 50 then
    raise exception 'P4 failed: only % direct-post cron row(s) left -- arm 1 is no longer the fleet''s path', v_arm1_rows;
  end if;

  -- P5. The sentinel must no longer name this row. It reads the LIVE cron, which the
  -- nightly sync has not rewritten yet, so this is reported and not gated -- asserting
  -- it here would fail on correct code until 05:10.
  select public.admin_automation_tracking_gaps() into v_gaps;
  if v_gaps->'untracked_http_dispatchery' is not null then
    raise exception 'P5 failed: sentinel key renamed';
  end if;
  raise notice 'untracked_http_dispatchers still reads % (clears at the next automation_cron_sync, 05:10)',
    v_gaps->'untracked_http_dispatchers';

  raise notice 'tracked-caller insert OK: shim-direct rows %, arm-1 rows %', v_shim_rows, v_arm1_rows;
end
$verify$;
