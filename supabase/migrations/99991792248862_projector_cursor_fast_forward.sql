-- admin_automation_project_cron_runs: advance the cursor past rows that do not exist.
--
-- THE DEFECT, measured on prod 2026-10-17.  admin_automation_project_tick was the
-- single most I/O-hungry statement in the database:
--
--     35,266 MB per call  ·  mean 9,851 ms  ·  max 47,881 ms
--     3,030 GB read lifetime  ·  7.43% of ALL execution time
--
-- against a 2 GB shared_buffers, every 5 minutes.  The projector reads
-- cron.job_run_details once per registered automation (322 of them) with
--
--     where jobid = v_jobid and runid > a.last_cron_runid
--
-- and cron.job_run_details carries EXACTLY ONE INDEX -- job_run_details_pkey on
-- (runid) alone, nothing on jobid.  So the plan hinges entirely on how far behind
-- that automation's cursor sits.  Both plans measured on the live table:
--
--   cursor AT the head   -> Index Scan using job_run_details_pkey
--                           Index Cond: runid > 2860317, Filter: jobid = 2230
--                           Buffers: shared hit=77          0.16 ms
--   cursor 279,899 BACK  -> Seq Scan, Rows Removed by Filter: 140,350
--                           Buffers: shared hit=11551       41.9 ms   (actual rows=0)
--
-- 322 automations x 11,551 blocks = 3,719,422, which is 82% of the 4,514,138
-- blocks/call measured; the remainder is the 322 cron.job lookups and the write
-- work.  The mechanism is established, not inferred.
--
-- WHY THE CURSOR FALLS BEHIND, and it is self-inflicted.  The tick advances the
-- cursor only `if v_cursor > a.last_cron_runid`, i.e. ONLY WHEN ROWS WERE
-- PROCESSED.  A job with nothing new leaves its cursor frozen while every other
-- job on the instance pushes max(runid) forward by ~20,000/day.  So the cost of
-- this function is proportional to HOW INFREQUENTLY EACH JOB RUNS:
--
--     workflow_dispatcher_1min   * * * * *     4,659 rows      0 behind -> index scan
--     hotel_safety_backfill      50 4 * * 0        1 row  125,184 behind -> seq scan
--     pipeline_country_ingestion 0 3 * * 0         1 row  126,306 behind -> seq scan
--     airport_service_refresh    30 2 1 * *        0 rows 279,899 behind -> seq scan
--
-- A per-minute job keeps its cursor at the head for free.  A weekly job processes
-- its one row, then seq-scans a 104 MB table every 5 minutes for the rest of the
-- week to find nothing.  286 of 322 automations had ZERO new rows; 190 sat
-- >=10,000 runids behind.  That is also why this grew worse over time.
--
-- THE FIX RESTORES AN INVARIANT THE INSTALL MIGRATION ALREADY ESTABLISHED.
-- 20260910163700_admin_automation_run_tracking.sql:923 seeded every cursor with
--     SET last_cron_runid = COALESCE((SELECT max(runid) FROM cron.job_run_details), 0)
-- -- the cursor was MEANT to track the head ("forward-only").  The per-tick logic
-- then let it decay.  So: when an automation has no pending work, jump its cursor
-- to the head instead of leaving it to rot.
--
-- WHY THIS CANNOT SKIP A RUN.  runid comes from a global monotonic sequence and
-- v_global_max is read ONCE, before any row is examined.  Therefore every row
-- inserted during this call carries runid > v_global_max and stays above the
-- cursor for the next tick.  Rows that existed at entry and sat below the head
-- were all in the inner SELECT's result set.  Note pg_cron assigns runid at job
-- START and only later UPDATEs the status, so an in-flight run is already present
-- as a non-terminal row and trips the barrier below.
--
-- TWO GUARDS, both load-bearing:
--   1. v_hit_barrier -- the loop stopped at a non-terminal run whose outcome is
--      not yet known.  Never jump past it; the next tick must re-read it.  The
--      original `exit when` is rewritten as an explicit IF purely so the barrier
--      can be recorded -- the CONDITION is unchanged, including its NULL
--      behaviour (`null not in (...)` is null, so a null status does not exit).
--   2. v_rows_this_job < p_limit -- a batch that filled the limit may have more
--      rows behind it.  Never jump past an unread tail.
--
-- AN INDEX WAS THE FIRST INSTINCT AND IS NOT AVAILABLE.  Probed on prod:
--     create index on cron.job_run_details (jobid, runid)
--     -> REFUSED  42501  must be owner of table job_run_details
-- cron.job_run_details is owned by supabase_admin and postgres is not a member --
-- the same trap already recorded for net.http_request_queue.  Do not re-attempt.
--
-- EVERY EXISTING BRANCH IS BYTE-FOR-BYTE UNCHANGED.  Only cursor bookkeeping
-- moves.  This matters because this function is the ONLY evidence of failure for
-- the 74 net.http_post and 20 enqueue_workflow cron families, and it feeds
-- consecutive_failures -> auto_pause_threshold=3.  Writing it wrong either
-- double-counts (which is how admin_automation_reap auto-paused itself) or goes
-- blind.  The fix touches neither the failure branch nor the link branch.
--
-- Expected: 4,514,138 -> ~24,794 blocks/call (322 x 77), about 182x.

create or replace function public.admin_automation_project_cron_runs(p_limit integer default 5000)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a record;
  d record;
  v_jobid bigint;
  v_is_tracked boolean;
  v_cursor bigint;
  v_errors integer := 0;
  v_successes integer := 0;
  v_linked integer := 0;
  v_rows integer := 0;
  -- Cursor fast-forward state.  See header.
  v_global_max bigint;
  v_hit_barrier boolean;
  v_rows_this_job integer;
  v_fast_forwarded integer := 0;
begin
  -- Read the head ONCE, before examining any row.  runid is a global monotonic
  -- sequence, so anything inserted after this point sorts above it and survives
  -- to the next tick.  Uses job_run_details_pkey; this is not a scan.
  select max(runid) into v_global_max from cron.job_run_details;

  for a in
    select au.id, au.slug, au.last_cron_runid,
           coalesce(au.action->>'jobname', au.slug) as jobname
    from public.admin_automations au
    where exists (
      select 1 from cron.job j
      where j.jobname = coalesce(au.action->>'jobname', au.slug)
    )
  loop
    select jobid, command ilike '%admin\_automation\_run\_begin%'
    into v_jobid, v_is_tracked
    from cron.job where jobname = a.jobname;

    continue when v_jobid is null;
    v_cursor := a.last_cron_runid;
    v_hit_barrier := false;
    v_rows_this_job := 0;

    for d in
      select runid, status, return_message, start_time, end_time
      from cron.job_run_details
      where jobid = v_jobid and runid > a.last_cron_runid
      order by runid
      limit p_limit
    loop
      -- Was `exit when d.status not in ('succeeded', 'failed');`.  Same
      -- condition, rewritten so the barrier is recorded: a non-terminal run has
      -- no outcome yet, so the cursor must stay below it.
      if d.status not in ('succeeded', 'failed') then
        v_hit_barrier := true;
        exit;
      end if;

      if d.status = 'failed' then
        insert into public.admin_automation_runs (
          automation_id, automation_slug, status, started_at, finished_at,
          error, cron_runid, summary
        ) values (
          a.id, a.slug,
          case when d.return_message = 'job startup timeout' then 'partial' else 'error' end,
          coalesce(d.start_time, now()),
          coalesce(d.end_time, now()),
          left(coalesce(d.return_message, 'cron execution failed'), 4000),
          d.runid,
          jsonb_build_object('source', 'cron.job_run_details')
            || case when d.return_message = 'job startup timeout'
                    then jsonb_build_object('reason', 'cron_startup_timeout')
                    else '{}'::jsonb end
        )
        on conflict (cron_runid) where cron_runid is not null do nothing;
        if d.return_message is distinct from 'job startup timeout' then
          v_errors := v_errors + 1;
        end if;

      elsif not v_is_tracked then
        -- A SQL runner may already have written the semantic row. Link the
        -- cron run id to the nearest unlinked row for this execution rather
        -- than manufacturing a second success.
        with candidate as (
          select id
          from public.admin_automation_runs
          where automation_id = a.id
            and cron_runid is null
            and started_at >= coalesce(d.start_time, now()) - interval '5 seconds'
            and started_at <= coalesce(d.end_time, d.start_time, now()) + interval '5 seconds'
          order by abs(extract(epoch from (started_at - coalesce(d.start_time, now()))))
          limit 1
        )
        update public.admin_automation_runs r
        set cron_runid = d.runid,
            summary = coalesce(r.summary, '{}'::jsonb)
              || jsonb_build_object('cron_source', 'cron.job_run_details')
        from candidate c
        where r.id = c.id;

        if found then
          v_linked := v_linked + 1;
        else
          update public.admin_automations
          set last_run_at = coalesce(d.end_time, d.start_time, now()),
              last_run_status = 'success',
              consecutive_failures = 0
          where id = a.id;

          if not exists (
            select 1 from public.admin_automation_runs
            where automation_slug = a.slug
              and status = 'success'
              and started_at > coalesce(d.start_time, now()) - interval '1 hour'
              and started_at <= coalesce(d.end_time, d.start_time, now()) + interval '5 seconds'
          ) then
            insert into public.admin_automation_runs (
              automation_id, automation_slug, status, started_at, finished_at,
              cron_runid, summary
            ) values (
              a.id, a.slug, 'success', coalesce(d.start_time, now()),
              coalesce(d.end_time, now()), d.runid,
              jsonb_build_object('source', 'cron.job_run_details', 'sampled', true)
            )
            on conflict (cron_runid) where cron_runid is not null do nothing;
          end if;
          v_successes := v_successes + 1;
        end if;
      end if;

      v_cursor := d.runid;
      v_rows := v_rows + 1;
      v_rows_this_job := v_rows_this_job + 1;
    end loop;

    -- Nothing pending for this job at or below the head we read at entry, and the
    -- batch was not truncated -- so jump the cursor to the head.  Without this an
    -- infrequent job keeps a frozen cursor, its `runid >` predicate degenerates
    -- to a full scan of cron.job_run_details, and it pays 11,551 blocks every 5
    -- minutes to find nothing.  Guarded by the barrier and the limit above.
    if not v_hit_barrier
       and v_rows_this_job < p_limit
       and v_global_max is not null
       and v_global_max > v_cursor then
      v_cursor := v_global_max;
      v_fast_forwarded := v_fast_forwarded + 1;
    end if;

    if v_cursor > a.last_cron_runid then
      update public.admin_automations set last_cron_runid = v_cursor where id = a.id;
    end if;
  end loop;

  -- cursors_fast_forwarded is additive; no caller reads these keys (verified:
  -- the only repo references are the generated types, which say Returns: Json).
  return jsonb_build_object(
    'projected', v_rows,
    'errors', v_errors,
    'successes', v_successes,
    'linked_semantic_runs', v_linked,
    'cursors_fast_forwarded', v_fast_forwarded
  );
end;
$function$;

do $verify$
declare
  v_src text;
  v_behind_before bigint;
begin
  select pg_get_functiondef(oid) into v_src
  from pg_proc
  where proname = 'admin_automation_project_cron_runs'
    and pronamespace = 'public'::regnamespace;

  -- The two guards must both be present.  Asserted on the CONDITION, not on the
  -- surrounding prose: a comment naming a guard is not the guard.
  if position('not v_hit_barrier' in v_src) = 0 then
    raise exception 'projector lost the non-terminal barrier guard';
  end if;
  if position('v_rows_this_job < p_limit' in v_src) = 0 then
    raise exception 'projector lost the batch-limit guard';
  end if;
  if position('v_hit_barrier := true' in v_src) = 0 then
    raise exception 'projector never records the barrier, so the guard is dead';
  end if;

  -- The head must be read before the outer loop, or the monotonicity argument
  -- that makes the jump safe does not hold.
  if position('select max(runid) into v_global_max' in v_src)
     > position('for a in' in v_src) then
    raise exception 'v_global_max is read after the loop starts; jump is unsafe';
  end if;

  -- The failure branch and the link branch must be untouched -- this function is
  -- the only evidence of failure for ~94 cron families.
  if position('cron_startup_timeout' in v_src) = 0 then
    raise exception 'projector lost the startup-timeout classification';
  end if;
  if position('linked_semantic_runs' in v_src) = 0 then
    raise exception 'projector lost the semantic-run linking';
  end if;

  -- Report the backlog this will clear on the first tick.  Advisory only: a
  -- migration must not assert a live number it does not control.
  select count(*) into v_behind_before
  from public.admin_automations au
  join cron.job j on j.jobname = coalesce(au.action->>'jobname', au.slug)
  where (select max(runid) from cron.job_run_details) - au.last_cron_runid >= 10000;

  raise notice 'projector cursor fast-forward installed; % automations currently >=10k runids behind', v_behind_before;
end $verify$;

comment on function public.admin_automation_project_cron_runs(integer) is
  'Projects cron.job_run_details into admin_automation_runs. Fast-forwards an '
  'automation cursor to max(runid) when it has no pending work, because '
  'cron.job_run_details has no index on jobid (and cannot get one: owned by '
  'supabase_admin) so a stale cursor turns every tick into a full table scan. '
  'Safe because runid is globally monotonic and the head is read before any row. '
  'See 99991792248862_projector_cursor_fast_forward.sql.';
