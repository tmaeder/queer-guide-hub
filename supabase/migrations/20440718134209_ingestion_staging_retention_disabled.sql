-- Retention for ingestion_staging. SHIPPED DISABLED ON PURPOSE -- see the bottom.
--
-- THE PROBLEM: there is no retention anywhere. Searched all 1,332 functions in public for a
-- delete/prune/purge against ingestion_staging: zero. The table has grown continuously since
-- 2026-02-15 and is now 1,840 MB over 255,492 rows, of which 84.9% are terminally dispositioned
-- and older than 30 days. ingestion_events (453 MB, back to 2026-04-15), enrichment_log,
-- quality_backfill_jobs and scraper_dedupe_decisions are the same shape.
--
-- This is NOT the "bloat" it first looks like. Measured with pgstattuple_approx, the reusable free
-- space inside these tables is real but secondary; the dominant cost is rows nobody will read
-- again. VACUUM FULL reclaims space Postgres already reuses, needs ~2x the table size in temp disk
-- on a disk-constrained instance, and the table re-bloats. Retention is the lever; the repack is
-- what you do AFTER it, once there is less to rewrite.
--
-- WHAT A DELETE COSTS, because it is not just this table. Six FKs point at ingestion_staging and
-- the delete rules are load-bearing:
--     ingestion_events           CASCADE   453 MB   <- the per-row ingest event log
--     enrichment_audit           CASCADE    87 MB
--     news_staging_drain_audit   CASCADE   352 kB
--     ingestion_dlq              CASCADE    24 kB   <- measured EMPTY (0 rows), so no hazard
--     scraper_dedupe_decisions   SET NULL  104 MB   <- kept, link nulled
--     dedup_decisions_feedback   SET NULL   16 kB
-- So pruning staging PERMANENTLY DESTROYS the ingestion provenance for those rows -- "what did we
-- receive, and what did we do with it". That is a product decision about auditability, which is
-- exactly why this migration does not make it.
--
-- MEASURED IMPACT BY WINDOW (prod, 2026-09-10), terminal dispositions only:
--     days   staging rows   +events cascade   +audit cascade   est. freed
--      30      217,041         400,211           42,449         ~1.9 GB
--      60      176,103         328,228           29,991        ~1.55 GB
--      90       67,290         109,824            6,309         ~580 MB
--     180        3,370          14,224                0          ~36 MB
-- The distribution is sharply non-linear: almost nothing predates 180 days, so the table is
-- essentially the last ~90 days of ingestion. 90 is the conservative choice; 30 is where the
-- space actually is.

create or replace function public.prune_ingestion_staging(
  p_older_than_days integer,
  p_limit integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_deleted integer;
  v_cutoff  timestamptz;
begin
  -- Floor guard. The cascade is irreversible, so a fat-fingered small value must not be able to
  -- delete the live working set. 30 days is below every window measured above and still leaves
  -- more than a month of ingest history.
  if p_older_than_days is null or p_older_than_days < 30 then
    raise exception 'p_older_than_days must be >= 30 (got %) -- the delete cascades and cannot be undone', p_older_than_days;
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50000 then
    raise exception 'p_limit must be between 1 and 50000, got %', p_limit;
  end if;

  v_cutoff := now() - (p_older_than_days || ' days')::interval;

  -- disposition='pending' is NEVER deleted: a pending row is either still moving through the
  -- pipeline or is queued for a human, and both are live state. Only terminal rows go.
  with victims as (
    select id from public.ingestion_staging
     where disposition is distinct from 'pending'
       and created_at < v_cutoff
     order by created_at
     limit p_limit
  )
  delete from public.ingestion_staging s using victims v where s.id = v.id;

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'deleted', v_deleted,
    'cutoff', v_cutoff,
    'older_than_days', p_older_than_days,
    'remaining', (select count(*) from public.ingestion_staging
                   where disposition is distinct from 'pending' and created_at < v_cutoff)
  );
end $function$;

revoke all on function public.prune_ingestion_staging(integer, integer) from public, anon, authenticated;
grant execute on function public.prune_ingestion_staging(integer, integer) to service_role;

comment on function public.prune_ingestion_staging(integer, integer) is
  'Deletes terminally-dispositioned ingestion_staging rows older than N days (>=30 enforced). '
  'CASCADES to ingestion_events, enrichment_audit, news_staging_drain_audit and ingestion_dlq, '
  'permanently destroying ingestion provenance for those rows. Batch-capped. Registered DISABLED '
  'in admin_automations as `ingestion_staging_retention` -- enabling it is a deliberate decision '
  'about how long ingest history is kept, not a cleanup.';

-- Registered DISABLED, following the auto_assign_usernames precedent (registered off, enabled
-- later by a human). The registry row exists so the job is discoverable and so enabling it is a
-- one-line UPDATE rather than a new migration -- but nothing is scheduled until someone chooses
-- a window. `action.command` carries a 90-day default so sync_automations_to_cron() can build the
-- cron itself once enabled; change the number there to change the window.
--
-- NOTE for whoever enables it: an rpc-type row with no cron job yet means branch (d) of
-- sync_automations_to_cron() will CREATE the job on the next reconciler pass after enabled=true.
-- Read the `recreated` list it returns rather than assuming.
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values (
  'ingestion_staging_retention',
  'Prune aged ingestion_staging rows',
  'DISABLED pending a retention-window decision. Deletes terminally-dispositioned staging rows older than the configured window; cascades to ingestion_events and enrichment_audit, destroying ingestion provenance for those rows. Measured 2026-09-10: 90d frees ~580 MB, 30d frees ~1.9 GB.',
  'system',
  false,
  '{"type": "schedule"}'::jsonb,
  '[]'::jsonb,
  '{"fn": "prune_ingestion_staging", "type": "rpc", "command": "SELECT public.prune_ingestion_staging(90, 5000);", "jobname": "ingestion_staging_retention"}'::jsonb,
  '20 2 * * *'
)
on conflict (slug) do nothing;

do $$
begin
  if (select enabled from public.admin_automations where slug = 'ingestion_staging_retention') then
    raise exception 'ingestion_staging_retention must ship DISABLED -- the retention window is a human decision';
  end if;

  if exists (select 1 from cron.job where jobname = 'ingestion_staging_retention') then
    raise exception 'a cron job was scheduled for a disabled retention automation';
  end if;

  -- Prove the floor guard is live rather than merely written.
  begin
    perform public.prune_ingestion_staging(1, 1);
    raise exception 'floor guard did not fire for p_older_than_days=1';
  exception when others then
    if position('must be >= 30' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
