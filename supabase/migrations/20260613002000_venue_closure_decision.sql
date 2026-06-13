-- Venue data-quality remediation — Phase 2: closure decision engine (2026-06-13)
--
-- Phase 0 made the closure SIGNALS fire (url_status='broken' from the url-checker,
-- needs_attention from detect_stale_venues) but nothing turns signals into a
-- closure — staleness alone is deliberately too weak to auto-close, and the Venue
-- Truth Engine consensus path is dead (its tables were never applied in prod).
--
-- This adds a single pure-SQL decision pass over the FREE signals:
--   * AUTO-CLOSE when TWO independent strong signals agree — a dead website
--     (404/410) AND no source has listed the venue in >90 days. Guarded: never
--     auto-close a featured venue or one with community signal (reviews/checkins);
--     those go to needs_attention for a human instead (Phase 0 already flags them).
--   * REOPEN safety — if a venue auto-closed by this rule later shows life (URL
--     recovers to ok/redirect, or a fresh source sighting lands after closed_at),
--     clear closed_at and mark the audit reverted. Only reverses THIS rule's
--     closures, never a manual/admin closure.
-- Reversible + audited in venue_closed_audit. Registered as a nightly automation.

CREATE OR REPLACE FUNCTION public.run_venue_closure_decision(p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_close_eligible int := 0;
  v_closed int := 0;
  v_reopened int := 0;
begin
  perform public.assert_admin_or_internal();

  -- How many would close (always computed, for dry-run + reporting).
  with last_src as (
    select vs.venue_id, max(vs.last_seen_at) max_seen from public.venue_sources vs group by vs.venue_id
  )
  select count(*) into v_close_eligible
  from public.venues v
  left join last_src ls on ls.venue_id = v.id
  where v.duplicate_of_id is null and v.closed_at is null
    and v.url_status = 'broken'
    and coalesce(ls.max_seen, v.created_at) < now() - interval '90 days'
    and not coalesce(v.is_featured, false)
    and not exists (select 1 from public.venue_reviews r where r.venue_id = v.id)
    and not exists (select 1 from public.venue_checkins c where c.venue_id = v.id);

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'close_eligible', v_close_eligible, 'closed', 0, 'reopened', 0);
  end if;

  -- 1. REOPEN first, so a re-listed venue isn't immediately re-closed below.
  update public.venues v
     set closed_at = null, updated_at = now()
  from (
    select v2.id,
           (select a.id from public.venue_closed_audit a
              where a.venue_id = v2.id and a.reverted_at is null
              order by a.created_at desc limit 1) aid
    from public.venues v2 where v2.closed_at is not null
  ) pick
  join public.venue_closed_audit a on a.id = pick.aid
   and a.reason = 'multi_signal_broken_url_and_stale'
  left join (select venue_id, max(last_seen_at) max_seen from public.venue_sources group by 1) ls
    on ls.venue_id = pick.id
  where v.id = pick.id
    and (v.url_status in ('ok', 'redirect') or coalesce(ls.max_seen, to_timestamp(0)) > v.closed_at);
  get diagnostics v_reopened = row_count;

  update public.venue_closed_audit a set reverted_at = now()
  from public.venues v
  where a.venue_id = v.id and a.reverted_at is null
    and a.reason = 'multi_signal_broken_url_and_stale' and v.closed_at is null;

  -- 2. AUTO-CLOSE: dead website AND stale source, not featured, no community signal.
  with last_src as (
    select vs.venue_id, max(vs.last_seen_at) max_seen from public.venue_sources vs group by vs.venue_id
  ),
  cand as (
    select v.id vid, coalesce(ls.max_seen, v.created_at) last_seen
    from public.venues v
    left join last_src ls on ls.venue_id = v.id
    where v.duplicate_of_id is null and v.closed_at is null
      and v.url_status = 'broken'
      and coalesce(ls.max_seen, v.created_at) < now() - interval '90 days'
      and not coalesce(v.is_featured, false)
      and not exists (select 1 from public.venue_reviews r where r.venue_id = v.id)
      and not exists (select 1 from public.venue_checkins c where c.venue_id = v.id)
  ),
  upd as (
    update public.venues v set closed_at = now(), needs_attention = true, updated_at = now()
    from cand where v.id = cand.vid
    returning v.id
  )
  insert into public.venue_closed_audit (venue_id, closed_at, reason, detail)
  select c.vid, now(), 'multi_signal_broken_url_and_stale',
         jsonb_build_object(
           'signals', jsonb_build_array('url_status=broken', 'no_source_sighting>90d'),
           'last_seen_at', c.last_seen,
           'detected_by', 'run_venue_closure_decision')
  from cand c;
  get diagnostics v_closed = row_count;

  return jsonb_build_object(
    'dry_run', false,
    'close_eligible', v_close_eligible,
    'closed', v_closed,
    'reopened', v_reopened
  );
end; $function$;

-- Nightly, after url-checker (*/20) + detect-stale-venues (04:30) have refreshed signals.
SELECT cron.unschedule('venue_closure_decision') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'venue_closure_decision'
);
SELECT cron.schedule('venue_closure_decision', '45 4 * * *',
  $$ SELECT public.run_venue_closure_decision(); $$);

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, action, schedule)
VALUES (
  'venue_closure_decision',
  'Venue closure decision',
  'Auto-closes venues with a dead website AND no source sighting in 90 days (2 strong signals); reopens auto-closed venues that show life again. Conservative: featured/reviewed venues route to needs_attention instead.',
  'system', true,
  '{"type":"schedule"}'::jsonb,
  '{"type":"rpc","fn":"run_venue_closure_decision"}'::jsonb,
  '45 4 * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name = excluded.name, description = excluded.description,
      trigger = excluded.trigger, action = excluded.action, schedule = excluded.schedule;
