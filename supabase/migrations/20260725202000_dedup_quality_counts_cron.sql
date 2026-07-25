-- Dedup Truth Engine — P3: counts, inbox visibility, cron (2026-07-25)
--
--  * triage_sources row 'dedup-review' + triage_src_dedup_review view — the
--    suggestion queue shows up in the unified inbox + registry-driven counts
--    (view + counts only; decisions run through approve/reject_dedup_review,
--    the inbox deep-links to /admin/duplicates).
--  * get_admin_counts gains 'quality_duplicates' in the static Truth-Engine
--    block (same convention as quality_city etc.; registry fold is A3).
--  * admin_automations 'dedup_truth_sweep' (mode in conditions — flip
--    queue_only -> full with a plain UPDATE) + cron 05:50 UTC, before the
--    existing 06:00/06:15 marketplace/event sweeps.

-- ── 1. Inbox view + registry row ─────────────────────────────────────────────

CREATE OR REPLACE VIEW public.triage_src_dedup_review AS
SELECT
  q.id,
  'dedup-review'::text AS queue_type,
  q.entity_type AS content_type,
  coalesce(q.cluster->'keep'->>'title','?') || ' ⇄ ' || coalesce(q.cluster->'drop'->>'title','?') AS title,
  q.reason AS subtitle,
  q.status,
  q.confidence AS confidence_score,
  q.created_at,
  q.source,
  q.keep_id AS entity_id,
  q.entity_type AS entity_table,
  false AS has_diff,
  NULL::uuid AS reporter_id,
  q.cluster AS meta,
  NULL::text AS flag_type,
  CASE WHEN q.entity_type = 'personality'
       THEN '{"namesake": true}'::jsonb ELSE '{}'::jsonb END AS risk_flags
FROM public.dedup_review_queue q
WHERE q.status = 'open';

INSERT INTO public.triage_sources
  (queue_key, view_name, label, priority_weight, sla_hours, count_key, capabilities)
VALUES
  ('dedup-review', 'triage_src_dedup_review', 'Dup merge review', 40, 168, 'dedup_review',
   '{"can_reopen": false, "external_console": "/admin/duplicates?view=suggested"}')
ON CONFLICT (queue_key) DO UPDATE SET
  view_name = EXCLUDED.view_name,
  label = EXCLUDED.label,
  priority_weight = EXCLUDED.priority_weight,
  sla_hours = EXCLUDED.sla_hours,
  count_key = EXCLUDED.count_key,
  capabilities = EXCLUDED.capabilities;

-- ── 2. get_admin_counts + quality_duplicates ─────────────────────────────────
-- Body copied from 20260724150000 (registry loop + static Truth-Engine block);
-- only change: quality_duplicates added to the static block.

CREATE OR REPLACE FUNCTION public.get_admin_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  estimates jsonb;
  v_sla jsonb := '{}'::jsonb;
  v_cnt bigint;
  v_overdue bigint;
  r record;
  sla_feedback_h constant int := 48;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role,'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_object_agg(relname, reltuples::bigint)
  INTO estimates
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relname = ANY (ARRAY[
      'venues','events','news_articles','personalities','cities','countries',
      'hotels','queer_villages','marketplace_listings','community_groups',
      'unified_tags','cms_pages','email_ingestions','workflow_runs',
      'scrape_sources','content_links','community_submissions','redirects'
    ]);

  result := coalesce(estimates, '{}'::jsonb);

  FOR r IN
    SELECT queue_key, view_name, count_key, sla_hours
    FROM triage_sources WHERE active ORDER BY queue_key
  LOOP
    EXECUTE format(
      'SELECT count(*), count(*) FILTER (WHERE created_at < now() - %L::interval) FROM public.%I',
      r.sla_hours || ' hours', r.view_name
    ) INTO v_cnt, v_overdue;
    result := result
      || jsonb_build_object('review_' || r.count_key, v_cnt)
      || jsonb_build_object('review_' || r.count_key || '_overdue', v_overdue);
    v_sla := v_sla || jsonb_build_object(r.count_key, r.sla_hours);
  END LOOP;

  result := result || jsonb_build_object(
    'review_feedback',
      (SELECT count(*) FROM community_submissions
        WHERE content_type='feedback' AND feedback_status IN ('new','under_review')),
    'review_feedback_overdue',
      (SELECT count(*) FROM community_submissions
        WHERE content_type='feedback' AND feedback_status IN ('new','under_review')
          AND submitted_at < now() - (sla_feedback_h || ' hours')::interval),
    'sla_hours', v_sla || jsonb_build_object('feedback', sla_feedback_h)
  );

  -- Static Truth-Engine block (kept until the A3 registry fold): quality hub,
  -- group-requests badge and cockpit read these from this single count source.
  result := result || jsonb_build_object(
    'review_group_requests',
      (SELECT count(*) FROM group_join_requests WHERE status='pending'),
    'quality_city',
      (SELECT count(*) FROM city_review_queue WHERE status='open'),
    'quality_venue',
      (SELECT count(*) FROM venue_review_queue WHERE status='open'),
    'quality_village',
      (SELECT count(*) FROM village_review_queue WHERE status='open'),
    'quality_personality',
      (SELECT count(*) FROM personality_review_queue WHERE status='open'),
    'quality_marketplace',
      (SELECT count(*) FROM marketplace_review_queue WHERE status='open'),
    'quality_existence',
      (SELECT count(*) FROM entity_existence_audit
        WHERE action='flag' AND reverted_at IS NULL),
    'quality_editorial',
      (SELECT count(*) FROM editorial_drafts WHERE status='pending'),
    'quality_duplicates',
      (SELECT count(*) FROM dedup_review_queue WHERE status='open')
  );

  RETURN result;
END;
$function$;

-- ── 3. Automation registration + cron ────────────────────────────────────────

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES ('dedup_truth_sweep', 'Dedup truth sweep',
        'Nightly: scores duplicate pairs across all 12 content types. Exact-identity pairs auto-merge (mode=full), ambiguous pairs queue in dedup_review_queue. Mode lives in conditions.mode: dry_run | queue_only | full.',
        'system', true, '{"type":"schedule"}'::jsonb, '{"mode":"queue_only"}'::jsonb,
        '{"type":"rpc","fn":"run_dedup_truth_sweep_all"}'::jsonb, '50 5 * * *')
ON CONFLICT (slug) DO UPDATE SET schedule=EXCLUDED.schedule,
  description=EXCLUDED.description, name=EXCLUDED.name, action=EXCLUDED.action, trigger=EXCLUDED.trigger;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dedup_truth_sweep') THEN
    PERFORM cron.unschedule('dedup_truth_sweep');
  END IF;
  PERFORM cron.schedule('dedup_truth_sweep', '50 5 * * *', 'SELECT public.run_dedup_truth_sweep_all();');
END $cron$;
