-- A sentinel for all twelve dedup types, not two.
--
-- `venue_dup_signals()` and `event_dup_signals()` exist because each of those types went
-- blind and nobody noticed -- venue for an unknown period, event for eleven days, both
-- while the nightly sweep reported `last_run_status = 'success'` and
-- `consecutive_failures = 0`. The other ten have no equivalent, so a mis-specified arm
-- yielding `would_merge = 0` is undetectable for marketplace, personality, city, hotel,
-- milestone, organization, news, queer_village, country and group.
--
-- `dedup_signals(p_type)` gives every type the same keys, and `dedup_signals_all()`
-- returns one object keyed by type so the health script makes ONE request.
--
-- THE SWEEP PROBE IS OPT-IN, AND THE REASON IS MEASURED. `run_dedup_truth_sweep` in
-- dry-run mode costs 10.6s for venue, 9.7s for event, 6.3s for marketplace -- **34.6s
-- for all twelve**, which no PostgREST call survives (the statement timeout kills a far
-- lighter query than that). So `p_probe` defaults TRUE for the single-type call, which
-- is what the existing venue/event sentinels already do at that cost, and
-- `dedup_signals_all()` passes FALSE: it returns the queue, audit and drain-rate keys
-- for all twelve in milliseconds, and `would_merge` is NULL there with
-- `dry_run_error = 'not probed'` so an unprobed call can never be mistaken for a clean
-- one. The health script probes the types it cares about individually.
--
-- FOUR RULES CARRIED FROM THE TWO THAT ALREADY EXIST, each paid for once:
--
-- 1. `would_merge` is NULL, NEVER 0, when the dry-run probe itself failed. An absent
--    sentinel and a clean corpus must not read alike -- that is how the event engine
--    stayed invisible. `dry_run_error` carries the reason.
-- 2. Backlog age warns on the MEDIAN, not the oldest (`percentile_disc`, not `_cont` --
--    the latter is 42883 on a timestamptz). A `min()`-based rule fires on every correct
--    deploy, and a warning that is always on is one people scroll past.
-- 3. `merges_unreversible_since_fix` is anchored to the FIRST stamped merge, not a
--    rolling window, because every merge older than the fix is legitimately unstamped and
--    a trailing-7-days rule would fire on a correct deploy.
-- 4. SERVICE_ROLE ONLY FROM THE START. `event_dup_signals` shipped granted to
--    `authenticated` and had to be narrowed later by 20280301104412. This one does not
--    repeat that.
--
-- AND ONE NEW KEY, because the failure that actually happened would have passed all of
-- the above. The venue and event sentinels fail on `would_merge > 0 AND merges_7d = 0`
-- -- an engine that has work and is not doing it. The live state is the opposite: the
-- arms are SATURATED (`would_merge = 0` on both), the queue is at its 200/night cap, and
-- humans have decided nothing since 2026-08-17. Both halves of that predicate read zero,
-- so it is silent. `open_delta_7d` vs `decisions_7d` is the quantity that is not:
-- a queue growing while nothing drains it converges on never.

CREATE OR REPLACE FUNCTION public.dedup_signals(p_type text, p_probe boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dry jsonb; v_err text; v_would_merge int; v_would_queue int;
  v_open int; v_median_h numeric; v_oldest_h numeric;
  v_opened_7d int; v_decided_7d int; v_human_7d int;
  v_merges_7d int; v_merges_30d int;
  v_unreversible int; v_pre_schema int;
  v_audit text;
begin
  -- The probe. A failure here is reported, never swallowed into a zero. Not probing is
  -- reported the same way, for the same reason: absence of evidence must not read as a
  -- clean engine.
  if p_probe then
    begin
      v_dry := public.run_dedup_truth_sweep(p_type, 'dry_run');
      v_would_merge := (v_dry->>'would_merge')::int;
      v_would_queue := (v_dry->>'would_queue')::int;
    exception when others then
      v_err := left(sqlerrm, 300);
      v_would_merge := null;   -- NULL, not 0: "could not look" is not "nothing to do"
      v_would_queue := null;
    end;
  else
    v_would_merge := null; v_would_queue := null; v_err := 'not probed';
  end if;

  select count(*),
         extract(epoch from (now() - percentile_disc(0.5) within group (order by created_at)))/3600.0,
         extract(epoch from (now() - min(created_at)))/3600.0
    into v_open, v_median_h, v_oldest_h
    from public.dedup_review_queue where status = 'open' and entity_type = p_type;

  select count(*) filter (where created_at > now() - interval '7 days'),
         count(*) filter (where reviewed_at > now() - interval '7 days'),
         count(*) filter (where reviewed_at > now() - interval '7 days' and reviewer_id is not null)
    into v_opened_7d, v_decided_7d, v_human_7d
    from public.dedup_review_queue where entity_type = p_type;

  -- venue and city keep their own audit tables; everything else is entity_merge_audit.
  v_audit := case p_type when 'venue' then 'venue_merge_audit'
                         when 'city'  then 'city_merge_audit'
                         else 'entity_merge_audit' end;

  if v_audit = 'venue_merge_audit' then
    select count(*) filter (where created_at > now() - interval '7 days'),
           count(*) filter (where created_at > now() - interval '30 days'),
           count(*) filter (where coalesce((details->>'schema')::int,0) < 1
                              and created_at > (select min(created_at) from public.venue_merge_audit
                                                 where coalesce((details->>'schema')::int,0) >= 1)),
           count(*) filter (where coalesce((details->>'schema')::int,0) < 1)
      into v_merges_7d, v_merges_30d, v_unreversible, v_pre_schema
      from public.venue_merge_audit;
  elsif v_audit = 'city_merge_audit' then
    select count(*) filter (where created_at > now() - interval '7 days'),
           count(*) filter (where created_at > now() - interval '30 days'),
           count(*) filter (where coalesce((details->>'schema')::int,0) < 1
                              and created_at > (select min(created_at) from public.city_merge_audit
                                                 where coalesce((details->>'schema')::int,0) >= 1)),
           count(*) filter (where coalesce((details->>'schema')::int,0) < 1)
      into v_merges_7d, v_merges_30d, v_unreversible, v_pre_schema
      from public.city_merge_audit;
  else
    select count(*) filter (where created_at > now() - interval '7 days'),
           count(*) filter (where created_at > now() - interval '30 days'),
           count(*) filter (where coalesce((details->>'schema')::int,0) < 1
                              and created_at > (select min(created_at) from public.entity_merge_audit
                                                 where entity_type = p_type
                                                   and coalesce((details->>'schema')::int,0) >= 1)),
           count(*) filter (where coalesce((details->>'schema')::int,0) < 1)
      into v_merges_7d, v_merges_30d, v_unreversible, v_pre_schema
      from public.entity_merge_audit where entity_type = p_type;
  end if;

  return jsonb_build_object(
    'type', p_type,
    'would_merge', v_would_merge,
    'would_queue', v_would_queue,
    'dry_run_error', v_err,
    'open_pairs', v_open,
    'median_open_pair_hours', round(coalesce(v_median_h, 0)),
    'oldest_open_pair_hours', round(coalesce(v_oldest_h, 0)),
    'open_auto_eligible', (select count(*) from public.dedup_review_queue
                            where status='open' and entity_type = p_type
                              and (cluster->>'auto_eligible')::boolean is true),
    -- the drain-rate keys: queued vs decided, and how many of those a PERSON decided
    'opened_7d', v_opened_7d,
    'decisions_7d', v_decided_7d,
    'human_decisions_7d', v_human_7d,
    'merges_last_7d', v_merges_7d,
    'merges_last_30d', v_merges_30d,
    'merges_unreversible_since_fix', v_unreversible,
    'merges_pre_schema_total', v_pre_schema,
    'audit_table', v_audit);
end; $function$;

CREATE OR REPLACE FUNCTION public.dedup_signals_all()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v jsonb := '{}'::jsonb; t text;
begin
  foreach t in array array['venue','event','marketplace','personality','city','hotel',
                           'milestone','organization','news','queer_village','country','group'] loop
    -- p_probe => false: see the header. Twelve dry runs is 34.6s and no HTTP call
    -- survives that; the caller probes individual types.
    v := v || jsonb_build_object(t, public.dedup_signals(t, false));
  end loop;
  return v;
end; $function$;

REVOKE ALL ON FUNCTION public.dedup_signals(text, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.dedup_signals_all() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dedup_signals(text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.dedup_signals_all() TO service_role;

do $verify$
declare v jsonb; t text; n int := 0;
begin
  v := public.dedup_signals_all();
  foreach t in array array['venue','event','marketplace','personality','city','hotel',
                           'milestone','organization','news','queer_village','country','group'] loop
    if not (v ? t) then raise exception 'dedup_signals_all is missing %', t; end if;
    -- A null would_merge must ALWAYS carry a reason. This is the whole point: an
    -- unprobed type and a clean type must never look the same.
    if (v->t->>'would_merge') is null and (v->t->>'dry_run_error') is null then
      raise exception 'type % reports a null would_merge with no reason -- a blind probe', t;
    end if;
    n := n + 1;
  end loop;
  if n <> 12 then raise exception 'expected 12 types, checked %', n; end if;

  -- Positive control: the drain-rate keys must be populated for the type that has the
  -- backlog, or the new check is measuring a column that is always zero.
  if (v->'venue'->>'open_pairs')::int = 0 then
    raise exception 'venue reports no open pairs -- the drain-rate keys are unexercised';
  end if;

  -- And the probing form must actually probe: a real number, not the sentinel.
  v := public.dedup_signals('organization', true);
  if (v->>'would_merge') is null then
    raise exception 'the probing form did not probe: %', v;
  end if;

  raise notice 'dedup signals cover all 12 types, probe opt-in';
end $verify$;
