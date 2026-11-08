-- Scheduled snapshots of the data-quality gate RPCs, so a PR gate reads a
-- precomputed row instead of recomputing whole-table aggregates live.
--
-- WHY. The PR gates (check-data-quality-gates.mjs, check-tag-hygiene.mjs)
-- call release_gate_checks, personality_quality_gate_checks,
-- event_quality_gate_checks and tag_hygiene_stats live through PostgREST,
-- which has an 8s statement ceiling. On 2026-11-08 they failed PRs five times
-- in one afternoon on 57014, retry included, on diffs that touched nothing
-- they measure. Measured the same day, tag_hygiene_stats ran 1.3s in one call
-- and 21s in the next with nothing changed: the cost is database LOAD, and no
-- per-function tuning keeps a live aggregate over growing tables under a hard
-- 8s line at every moment.
--
-- WHAT. refresh_gate_snapshots() runs the four RPCs every 10 minutes from
-- pg_cron (60s budget, outside the PostgREST ceiling) and stores each result.
-- Each RPC runs in its own exception block: one failing records last_error and
-- keeps its previous good result; it never blocks the others.
--
-- The gate scripts read this table first and use a row only if computed_at is
-- under 30 minutes old (3 missed refreshes). Anything else — no row, a stale
-- row, the table not existing yet — falls back to calling the RPC live with its
-- existing retry. So this cannot make a gate laxer than it is today: at worst a
-- gate sees data up to 30 minutes old, and a stopped cron degrades to the old
-- live behaviour rather than to a pass.
--
-- result holds exactly what PostgREST returned before: a jsonb array of
-- {gate, severity, failures, detail} rows for the three table functions, the
-- jsonb object for tag_hygiene_stats.

create table if not exists public.gate_snapshots (
  rpc             text primary key,
  result          jsonb,
  computed_at     timestamptz,
  duration_ms     integer,
  last_attempt_at timestamptz,
  last_error      text
);

comment on table public.gate_snapshots is
  'Latest output of each PR data-quality gate RPC, refreshed every 10 min by pg_cron (refresh_gate_snapshots). computed_at = last SUCCESS. Read by scripts/lib/gate-rpc.mjs readGateSnapshot().';

alter table public.gate_snapshots enable row level security;
revoke all on public.gate_snapshots from public, anon, authenticated;
grant select on public.gate_snapshots to service_role;

create or replace function public.refresh_gate_snapshots()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_rpc  text;
  v_t0   timestamptz;
  v_res  jsonb;
  v_out  jsonb := '{}'::jsonb;
begin
  foreach v_rpc in array array[
    'release_gate_checks',
    'personality_quality_gate_checks',
    'event_quality_gate_checks',
    'tag_hygiene_stats'
  ] loop
    v_t0 := clock_timestamp();
    begin
      if v_rpc = 'tag_hygiene_stats' then
        v_res := public.tag_hygiene_stats();
      else
        execute format(
          'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I() x', v_rpc)
          into v_res;
      end if;

      insert into public.gate_snapshots as g
             (rpc, result, computed_at, duration_ms, last_attempt_at, last_error)
      values (v_rpc, v_res, now(),
              round(extract(epoch from clock_timestamp() - v_t0) * 1000)::int, now(), null)
      on conflict (rpc) do update
         set result = excluded.result, computed_at = excluded.computed_at,
             duration_ms = excluded.duration_ms, last_attempt_at = excluded.last_attempt_at,
             last_error = null;
      v_out := v_out || jsonb_build_object(v_rpc, 'ok');
    exception when others then
      -- Keep the previous good result; record why this refresh failed.
      insert into public.gate_snapshots as g (rpc, last_attempt_at, last_error)
      values (v_rpc, now(), sqlstate || ': ' || sqlerrm)
      on conflict (rpc) do update
         set last_attempt_at = excluded.last_attempt_at, last_error = excluded.last_error;
      v_out := v_out || jsonb_build_object(v_rpc, sqlstate || ': ' || sqlerrm);
    end;
  end loop;
  return v_out;
end
$fn$;

revoke all on function public.refresh_gate_snapshots() from public, anon, authenticated;
grant execute on function public.refresh_gate_snapshots() to service_role;

insert into public.admin_automations (slug, name, description, managed_by, trigger, action, schedule, enabled)
values (
  'gate_snapshots_refresh',
  'PR gate snapshots refresh',
  'Runs the four data-quality gate RPCs and stores their output in gate_snapshots, so PR gates read a row instead of recomputing under the 8s PostgREST ceiling. Gates ignore rows older than 30 min and call live instead.',
  'system',
  '{"type":"schedule"}'::jsonb,
  '{"type":"rpc","fn":"refresh_gate_snapshots"}'::jsonb,
  '3-59/10 * * * *',
  true
)
on conflict (slug) do nothing;

select cron.schedule(
  'gate_snapshots_refresh',
  '3-59/10 * * * *',
  $cron$set statement_timeout='60s'; select public.refresh_gate_snapshots();$cron$
);

-- Fill the table now rather than waiting for the first tick, so gates benefit
-- from the moment this applies.
select public.refresh_gate_snapshots();

do $verify$
declare
  v_n   int;
  v_bad int;
begin
  select count(*), count(*) filter (where computed_at is null or result is null)
    into v_n, v_bad from public.gate_snapshots;
  if v_n <> 4 then
    raise exception 'P1 failed: expected 4 gate snapshot rows, found %', v_n;
  end if;
  if v_bad > 0 then
    raise exception 'P2 failed: % gate snapshot(s) have no result: %', v_bad,
      (select string_agg(rpc || ' -> ' || coalesce(last_error, '?'), '; ')
         from public.gate_snapshots where result is null);
  end if;
  if (select jsonb_typeof(result) from public.gate_snapshots where rpc = 'release_gate_checks') <> 'array'
     or (select jsonb_typeof(result) from public.gate_snapshots where rpc = 'tag_hygiene_stats') <> 'object' then
    raise exception 'P3 failed: snapshot shapes do not match what PostgREST returns';
  end if;
  if has_table_privilege('anon', 'public.gate_snapshots', 'select')
     or has_table_privilege('authenticated', 'public.gate_snapshots', 'select') then
    raise exception 'P4 failed: gate_snapshots is readable by anon/authenticated';
  end if;
  if not exists (select 1 from cron.job where jobname = 'gate_snapshots_refresh' and active) then
    raise exception 'P5 failed: cron job missing';
  end if;
end
$verify$;
