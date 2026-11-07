-- Resume projection past abandoned pg_cron entries only after the same job
-- has reached a later terminal run. A genuinely in-flight row remains a barrier.
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
  v_superseded integer := 0;
begin
  -- A manual projection and the scheduled projection can share the same cursor.
  if not pg_try_advisory_xact_lock(hashtextextended('admin_automation_project_cron_runs', 0)) then
    return jsonb_build_object('projected', 0, 'busy', true);
  end if;

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
      if d.status not in ('succeeded', 'failed') then
        -- pg_cron serializes executions of one job. A later terminal run of
        -- this exact job proves this entry is abandoned. Retain the original
        -- entry, whose outcome is unknown, without affecting failure streaks.
        if not exists (
          select 1
          from cron.job_run_details later
          where later.jobid = v_jobid
            and later.runid > d.runid
            and later.runid <= v_global_max
            and later.status in ('succeeded', 'failed')
        ) then
          v_hit_barrier := true;
          exit;
        end if;

        v_cursor := d.runid;
        v_rows_this_job := v_rows_this_job + 1;
        v_superseded := v_superseded + 1;
        continue;
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
    'cursors_fast_forwarded', v_fast_forwarded,
    'superseded_nonterminal', v_superseded
  );
end;
$function$;

do $verify$
declare
  v_source text := regexp_replace(
    pg_get_functiondef('public.admin_automation_project_cron_runs(integer)'::regprocedure),
    '--[^' || chr(10) || ']*', '', 'g'
  );
begin
  if position('later.jobid = v_jobid' in v_source) = 0
     or position('later.runid > d.runid' in v_source) = 0
     or position('later.runid <= v_global_max' in v_source) = 0
     or position('v_hit_barrier := true' in v_source) = 0
     or position('v_rows_this_job < p_limit' in v_source) = 0 then
    raise exception 'Projector lost a cursor safety guard';
  end if;
end;
$verify$;

comment on function public.admin_automation_project_cron_runs(integer) is
  'Projects cron outcomes in run order. A nonterminal row blocks the cursor unless a newer '
  'terminal run of the same job proves the row is abandoned. The raw outcome remains intact.';
