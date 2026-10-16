-- The dedup sweep records why a merge threw, and nothing read it.
--
-- `run_dedup_truth_sweep` catches a failing merge PER ENTITY TYPE and stores the
-- message on its own run row, at summary->'results'->[]->>'merge_error'. On
-- 2026-10-16 that row read:
--
--   {"type":"venue","capped":46,"queued":200,"auto_merged":0,
--    "merge_error":"record \"new\" has no field \"entity_type\"", ...}
--
-- 46 auto-eligible venue pairs, zero merged, and the reason written down -- while
-- cron.job_run_details said `succeeded`, admin_automations.last_run_status said
-- `success` and consecutive_failures stayed 0. Because the sweep never reports
-- failure, auto-pause could never fire: this would have run indefinitely rather
-- than for three nights. `would_merge: 0` on a healthy-looking run record is the
-- blind spot this repo has already recorded for the city, venue and event dedup
-- engines; here the evidence was ON the row and simply unread. The existing venue
-- check in check-pipeline-health.mjs even tells a human to "read `merge_error` in
-- its result" -- which is the definition of a signal nothing automates.
--
-- THE DISCRIMINATOR IS `auto_merged`, NOT THE MESSAGE. Every merge_error on record
-- (40 runs) falls into one of two classes, and they separate perfectly on whether
-- the same type merged anything in the same run:
--
--   benign chain collapse                                      auto_merged
--     organization "drop organization already merged"      x3     32,32,128
--     event        "keep event is itself a duplicate"      x1            63
--     organization "keep organization is itself a dup"     x1            32
--   genuine defect
--     venue/city   "record new has no field entity_type"   x2           0,0
--     news         "duplicate key ... news_story_articles" x5   0,0,0,0,0
--
-- That is structural rather than curve-fitted: a merge core's own guard fires
-- BECAUSE an earlier merge in the same run already collapsed the chain, so
-- auto_merged > 0 is implied by the guard having anything to refuse. A systemic
-- failure -- a broken trigger, a constraint violated on every attempt -- merges
-- nothing at all. Classifying by STATE instead of by message text is the rule
-- 20330101100000 established for venue `chain_skipped`, which deliberately does
-- not match the guard's wording because that wording lives in another function.
--
-- MEASURED AND REJECTED: `capped > 0 AND auto_merged = 0`, the obvious shape of
-- the venue case. It misses the city row from the very same run (capped 0,
-- auto_merged 0) and all five news rows (capped 0), i.e. it would have caught one
-- of the seven genuine defects on record.
--
-- Residue, stated rather than implied away: a systemic failure that begins PART
-- WAY through a run, after some merges have already succeeded, lands auto_merged
-- > 0 and reads as benign. So every error is REPORTED whether or not it gates --
-- the caller prints the benign ones too -- and a type whose `auto_merged` key is
-- absent entirely is counted separately and gates, because a shape change means
-- the probe can no longer tell the two classes apart.
--
-- Reads only the LATEST run that carries a `results` key. A sweep that stops
-- running is a different sentinel's job (the auto-pause rules), but the run's age
-- is returned so a stale one is visible rather than silently fresh.

create or replace function public.dedup_sweep_error_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with latest as (
    select r.started_at, r.summary
      from public.admin_automation_runs r
      join public.admin_automations a on a.id = r.automation_id
     where a.slug = 'dedup_truth_sweep'
       and r.summary ? 'results'
     order by r.started_at desc
     limit 1
  ),
  per_type as (
    select e->>'type' as etype,
           -- An empty string is not an error; only a non-blank message is.
           nullif(btrim(coalesce(e->>'merge_error', '')), '') as merge_error,
           -- Kept NULLABLE on purpose: absent is not zero. A missing key means the
           -- summary shape changed and the benign/genuine split is no longer
           -- decidable, which must gate rather than default to "benign".
           (e->>'auto_merged')::int as auto_merged,
           coalesce((e->>'capped')::int, 0) as capped
      from latest l, lateral jsonb_array_elements(l.summary->'results') e
  )
  select jsonb_build_object(
    -- Distinguish "looked and found nothing" from "could not look". An absent run,
    -- a revoked grant and a clean sweep must not all return the same reassuring 0.
    'probe_ok', (select count(*) = 1 from latest),
    'run_started_at', (select started_at from latest),
    'run_age_hours', (
      select round((extract(epoch from (now() - started_at)) / 3600.0)::numeric, 1)
        from latest),
    -- Reported FIRST in the caller: zero types means the probe measured nothing,
    -- which otherwise reads exactly like a sweep with no errors.
    'types_reported', (select count(*) from per_type),
    'auto_merged_total', (select coalesce(sum(auto_merged), 0) from per_type),
    'errors_total', (select count(*) from per_type where merge_error is not null),
    -- The gate: a type that errored and merged NOTHING.
    'errors_blocking', (
      select count(*) from per_type
       where merge_error is not null and auto_merged = 0),
    -- Reported and printed, never gated -- see the two classes in the header.
    'errors_benign', (
      select count(*) from per_type
       where merge_error is not null and auto_merged > 0),
    -- Shape drift: the one state in which the split above cannot be trusted.
    'types_missing_auto_merged', (
      select count(*) from per_type where auto_merged is null),
    'error_details', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'type', etype,
               'merge_error', merge_error,
               'auto_merged', auto_merged,
               'capped', capped,
               'blocking', (auto_merged is null or auto_merged = 0))
             order by (auto_merged is null or auto_merged = 0) desc, etype), '[]'::jsonb)
        from per_type where merge_error is not null)
  )
$function$;

comment on function public.dedup_sweep_error_signals() is
  'Reads merge_error off the latest dedup_truth_sweep run. Gates on a type that '
  'errored while merging nothing (auto_merged = 0); a chain-collapse guard always '
  'sits beside a successful merge. See 99991792185901 for the measurement.';

-- A DEFINER function granted to `authenticated` is granted to every member, and
-- this one reads automation bookkeeping. service_role only, same as its siblings.
revoke all on function public.dedup_sweep_error_signals() from public;
revoke all on function public.dedup_sweep_error_signals() from anon;
revoke all on function public.dedup_sweep_error_signals() from authenticated;
grant execute on function public.dedup_sweep_error_signals() to service_role;

do $verify$
declare
  v jsonb;
  v_key text;
  v_grantees text;
begin
  v := public.dedup_sweep_error_signals();

  -- 1. The probe must be able to see a run at all. If this is false the sweep has
  -- never recorded a `results` summary, and every count below is a false zero.
  if coalesce((v->>'probe_ok')::boolean, false) is not true then
    raise exception 'dedup_sweep_error_signals: probe_ok is not true -- no '
                    'dedup_truth_sweep run carries a results summary';
  end if;

  -- 2. Zero types reported means the function parsed nothing, which reads exactly
  -- like a clean sweep. The sweep covers 12 entity types; anything under 2 is a
  -- parse failure rather than a quiet night.
  if coalesce((v->>'types_reported')::int, 0) < 2 then
    raise exception 'dedup_sweep_error_signals: types_reported = % -- the probe '
                    'measured nothing', v->>'types_reported';
  end if;

  -- 3. The keys the caller gates on must exist. An absent key would be read as
  -- undefined and skipped, which is the silent-pass shape this whole file exists
  -- to remove.
  foreach v_key in array array['errors_blocking','errors_benign','errors_total',
                               'types_missing_auto_merged','error_details',
                               'auto_merged_total','run_age_hours']
  loop
    if not (v ? v_key) then
      raise exception 'dedup_sweep_error_signals: key % missing from the result', v_key;
    end if;
  end loop;

  -- 4. anon and authenticated must not hold EXECUTE.
  select string_agg(grantee, ',') into v_grantees
    from information_schema.role_routine_grants
   where specific_schema = 'public'
     and routine_name = 'dedup_sweep_error_signals'
     and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_grantees is not null then
    raise exception 'dedup_sweep_error_signals is executable by %', v_grantees;
  end if;

  raise notice 'dedup_sweep_error_signals: probe_ok, % types, % blocking, % benign',
    v->>'types_reported', v->>'errors_blocking', v->>'errors_benign';
end $verify$;
