-- run_event_quality_scan(): find candidate events with two set-based joins,
-- not two correlated sub-queries run once per event.
--
-- The cron job event_quality_scan runs every 5 minutes. Its candidate query
-- filters all ~68.8k live events with an OR of conditions, two of which are
-- correlated EXISTS sub-queries:
--   (a) a non-scan issue on the event touched after its last assessment
--       (event_quality_issues, idx_event_quality_issues_event), and
--   (b) an open event dedup pair created after its last assessment
--       (dedup_review_queue).
-- Inside an OR the planner cannot turn them into joins, so both ran once per
-- event on every run: measured 2026-10-31, 365k + 138k of the query's 524k
-- buffers, 847 ms, to return zero rows. That loop is most of the 115M index
-- scans event_quality_issues has taken since the 2026-10-25 restart.
--
-- Each is now computed once per run as a grouped CTE and left-joined:
--   ns.touched_at  = max over the event's non-scan issues of
--                    greatest(last_seen_at, resolved_at, reviewed_at)
--   dqx.created_at = max created_at over open event pairs naming the event
-- "some row is newer than assessed_at" is exactly "the newest row is newer than
-- assessed_at", so the candidate set cannot change. Checked on prod for all
-- 68,764 live events: 0 differences for (a) as written and with assessed_at
-- shifted 30 days back (27,575 true); 0 differences for (b) over the 593 events
-- named in any dedup pair (status filter dropped so the check is not vacuous).
-- The rewritten query reads 34k buffers instead of 524k (442 ms cold).
--
-- The function is patched from pg_get_functiondef() rather than restated: the
-- live body differs from the newest repo definition. Each replaced fragment
-- must occur exactly once, otherwise this migration aborts and changes
-- nothing.

do $patch$
declare
  v_src text := pg_get_functiondef('api_private.run_event_quality_scan(integer,text,boolean)'::regprocedure);
  v_new text;
  v_from_old constant text :=
    E'    select e.* from public.events e left join public.event_quality_current qc on qc.event_id=e.id\n';
  v_from_new constant text :=
    E'    with ns as (\n'
    || E'      select qi.event_id,\n'
    || E'        max(greatest(qi.last_seen_at,coalesce(qi.resolved_at,''epoch''::timestamptz),\n'
    || E'          coalesce(qi.reviewed_at,''epoch''::timestamptz))) as touched_at\n'
    || E'      from public.event_quality_issues qi\n'
    || E'      where qi.detector<>''event-quality-scan''\n'
    || E'      group by qi.event_id),\n'
    || E'    dqx as (\n'
    || E'      select x.event_id, max(dq.created_at) as created_at\n'
    || E'      from public.dedup_review_queue dq\n'
    || E'      cross join lateral (values (dq.keep_id),(dq.drop_id)) x(event_id)\n'
    || E'      where dq.entity_type=''event'' and dq.status=''open''\n'
    || E'      group by x.event_id)\n'
    || E'    select e.* from public.events e left join public.event_quality_current qc on qc.event_id=e.id\n'
    || E'      left join ns on ns.event_id=e.id left join dqx on dqx.event_id=e.id\n';
  v_issue_old constant text :=
    E'        or exists(select 1 from public.event_quality_issues qi where qi.event_id=e.id\n'
    || E'          and qi.detector<>''event-quality-scan''\n'
    || E'          and greatest(qi.last_seen_at,coalesce(qi.resolved_at,''epoch''::timestamptz),\n'
    || E'            coalesce(qi.reviewed_at,''epoch''::timestamptz))>qc.assessed_at)\n';
  v_issue_new constant text := E'        or ns.touched_at>qc.assessed_at\n';
  v_dq_old constant text :=
    E'        or exists(select 1 from public.dedup_review_queue dq where dq.entity_type=''event''\n'
    || E'          and dq.status=''open'' and e.id in (dq.keep_id,dq.drop_id)\n'
    || E'          and dq.created_at>qc.assessed_at)\n';
  v_dq_new constant text := E'        or dqx.created_at>qc.assessed_at\n';
  v_count integer;
begin
  foreach v_new in array array[v_from_old, v_issue_old, v_dq_old] loop
    v_count := (length(v_src) - length(replace(v_src, v_new, ''))) / length(v_new);
    if v_count <> 1 then
      raise exception 'run_event_quality_scan patch: fragment found % times, expected 1: %', v_count, left(v_new, 80);
    end if;
  end loop;

  v_new := replace(replace(replace(v_src, v_from_old, v_from_new), v_issue_old, v_issue_new), v_dq_old, v_dq_new);
  execute v_new;
end;
$patch$;

do $verify$
declare
  -- Comments stripped so a fragment quoted in a comment cannot satisfy or fail a check.
  v_src text := regexp_replace(
    pg_get_functiondef('api_private.run_event_quality_scan(integer,text,boolean)'::regprocedure),
    '--[^' || chr(10) || ']*', '', 'g');
begin
  -- P1: both correlated sub-queries are gone from the candidate filter.
  if position('qi.event_id=e.id
          and qi.detector<>''event-quality-scan''' in v_src) > 0 then
    raise exception 'P1 failed: per-event non-scan issue sub-query still present';
  end if;
  if position('and dq.created_at>qc.assessed_at' in v_src) > 0 then
    raise exception 'P1 failed: per-event dedup pair sub-query still present';
  end if;

  -- P2: and the joins that replace them are present.
  if position('or ns.touched_at>qc.assessed_at' in v_src) = 0
     or position('or dqx.created_at>qc.assessed_at' in v_src) = 0
     or position('left join ns on ns.event_id=e.id left join dqx on dqx.event_id=e.id' in v_src) = 0 then
    raise exception 'P2 failed: set-based candidate joins missing';
  end if;

  -- P3: still SECURITY DEFINER with its pinned search_path.
  if not exists (
    select 1 from pg_proc
    where oid = 'api_private.run_event_quality_scan(integer,text,boolean)'::regprocedure
      and prosecdef
  ) then
    raise exception 'P3 failed: run_event_quality_scan is no longer SECURITY DEFINER';
  end if;
end;
$verify$;
