-- ============================================================================
-- Unified Review Inbox v2 — A1: SQL foundation (2026-07-24)
-- ----------------------------------------------------------------------------
-- Each triage queue's membership predicate now lives in exactly ONE place: a
-- `triage_src_<key>` view. Both get_unified_triage_queue (the inbox) and
-- get_admin_counts (every badge) read the same views, so queue contents and
-- badge counts can never drift again (the 2026-07-13 hygiene pass fixed 42k
-- ghost items caused by duplicated predicates).
--
-- New `triage_sources` registry table carries per-queue metadata (label,
-- priority weight, SLA, count key, capabilities). Rows are added ONLY via
-- migrations — no client role can write it.
--
-- Behavior-preserving EXCEPT one deliberate fix: review_moderation previously
-- counted status='OPEN' only while the queue showed OPEN + IN_REVIEW; the
-- badge now matches the queue (that is the point of this refactor).
--
-- Views carry a `risk_flags jsonb` column ('{}' for all nine existing queues)
-- — consumed by the A2 action-contract migration (confirm-gated approvals).
-- ============================================================================

-- ── Registry ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.triage_sources (
  queue_key       text PRIMARY KEY,
  view_name       text NOT NULL,
  label           text NOT NULL,
  -- Base weight in the cross-queue priority sort (higher = more urgent).
  priority_weight int  NOT NULL DEFAULT 50,
  sla_hours       int  NOT NULL DEFAULT 72,
  -- Key suffix used in get_admin_counts output: review_<count_key>.
  -- Kept separate from queue_key for backward compat ('content' -> 'cms').
  count_key       text NOT NULL,
  capabilities    jsonb NOT NULL DEFAULT '{}'::jsonb,
  active          boolean NOT NULL DEFAULT true
);

ALTER TABLE public.triage_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS triage_sources_admin_read ON public.triage_sources;
CREATE POLICY triage_sources_admin_read ON public.triage_sources
  FOR SELECT USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]));

REVOKE ALL ON public.triage_sources FROM anon, authenticated;
GRANT SELECT ON public.triage_sources TO authenticated;

INSERT INTO public.triage_sources
  (queue_key, view_name, label, priority_weight, sla_hours, count_key, capabilities)
VALUES
  ('staging',      'triage_src_staging',      'Staging',       60, 48, 'staging',      '{"can_reopen": true,  "can_bulk": true}'),
  ('moderation',   'triage_src_moderation',   'Reports',      100, 24, 'moderation',   '{"can_reopen": true}'),
  ('submissions',  'triage_src_submissions',  'Submissions',   80, 24, 'submissions',  '{"can_reopen": true}'),
  ('content',      'triage_src_content',      'CMS Review',    50, 72, 'cms',          '{"can_reopen": true}'),
  ('automation',   'triage_src_automation',   'Automation',    10, 72, 'automation',   '{"can_reopen": true}'),
  ('tags',         'triage_src_tags',         'Tags',          30, 72, 'tags',         '{"can_reopen": false}'),
  ('duplicates',   'triage_src_duplicates',   'Duplicates',    20, 72, 'duplicates',   '{"can_reopen": false}'),
  ('news-quality', 'triage_src_news_quality', 'News quality',  30, 72, 'news_quality', '{"can_reopen": true}'),
  ('entity-links', 'triage_src_entity_links', 'Entity links',  20, 72, 'entity_links', '{"can_reopen": true}')
ON CONFLICT (queue_key) DO UPDATE SET
  view_name = EXCLUDED.view_name,
  label = EXCLUDED.label,
  priority_weight = EXCLUDED.priority_weight,
  sla_hours = EXCLUDED.sla_hours,
  count_key = EXCLUDED.count_key,
  capabilities = EXCLUDED.capabilities;

-- ── Queue views (canonical TriageItem shape + risk_flags) ────────────────────
-- Predicates extracted VERBATIM from get_unified_triage_queue (20260713190524).
-- Not exposed to client roles; only the SECURITY DEFINER RPCs read them.

CREATE OR REPLACE VIEW public.triage_src_staging AS
SELECT
  s.id,
  'staging'::text AS queue_type,
  s.target_table AS content_type,
  coalesce(
    s.normalized_data->>'name',
    s.normalized_data->>'title',
    s.raw_data->>'name',
    s.raw_data->>'title',
    'Untitled'
  ) AS title,
  coalesce(s.source_type, '') AS subtitle,
  s.review_status AS status,
  s.ai_confidence_score::numeric AS confidence_score,
  s.created_at,
  s.source_type AS source,
  NULL::uuid AS entity_id,
  s.target_table AS entity_table,
  (s.dedup_status = 'merge_candidate')::boolean AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'dedup_status', s.dedup_status,
    'dedup_match_score', s.dedup_match_score,
    'enrichment_status', s.enrichment_status
  ) AS meta,
  NULL::text AS flag_type,
  '{}'::jsonb AS risk_flags
FROM ingestion_staging s
WHERE s.review_status = 'pending_review'
  AND s.disposition = 'pending';

CREATE OR REPLACE VIEW public.triage_src_moderation AS
SELECT
  mf.id,
  'moderation'::text AS queue_type,
  mf.content_type,
  mf.reason AS title,
  mf.flag_type AS subtitle,
  mf.status,
  NULL::numeric AS confidence_score,
  mf.created_at,
  mf.source,
  mf.content_id AS entity_id,
  mf.content_type AS entity_table,
  (mf.suggested_changes IS NOT NULL)::boolean AS has_diff,
  mf.reporter_user_id AS reporter_id,
  jsonb_build_object(
    'flag_type', mf.flag_type,
    'suggested_changes', mf.suggested_changes
  ) AS meta,
  mf.flag_type,
  '{}'::jsonb AS risk_flags
FROM moderation_flags mf
WHERE mf.status IN ('OPEN', 'IN_REVIEW');

CREATE OR REPLACE VIEW public.triage_src_submissions AS
SELECT
  cs.id,
  'submissions'::text AS queue_type,
  cs.content_type,
  coalesce(cs.data->>'name', cs.data->>'title', cs.source_url, 'Submission') AS title,
  coalesce(cs.platform, cs.sub_source_type, '') AS subtitle,
  cs.status,
  cs.confidence_score,
  cs.submitted_at AS created_at,
  coalesce(cs.platform, 'web') AS source,
  cs.promoted_to_id AS entity_id,
  cs.promoted_to_table AS entity_table,
  false AS has_diff,
  cs.submitted_by AS reporter_id,
  jsonb_build_object(
    'priority', cs.priority,
    'labels', cs.labels,
    'source_url', cs.source_url
  ) AS meta,
  NULL::text AS flag_type,
  '{}'::jsonb AS risk_flags
FROM community_submissions cs
WHERE cs.status = 'pending'
  -- operational/feedback rows live on the feedback board, not content triage
  AND cs.content_type NOT IN ('feedback', 'api_error', 'pipeline_failure');

CREATE OR REPLACE VIEW public.triage_src_content AS
SELECT
  cm.id,
  'content'::text AS queue_type,
  cm.source_table AS content_type,
  coalesce(cm.meta_title, cm.source_table || ' content') AS title,
  cm.workflow_state::text AS subtitle,
  cm.workflow_state::text AS status,
  NULL::numeric AS confidence_score,
  cm.updated_at AS created_at,
  'cms'::text AS source,
  cm.source_id AS entity_id,
  cm.source_table AS entity_table,
  false AS has_diff,
  cm.last_edited_by AS reporter_id,
  jsonb_build_object('editor_notes', cm.editor_notes) AS meta,
  NULL::text AS flag_type,
  '{}'::jsonb AS risk_flags
FROM cms_content_metadata cm
WHERE cm.workflow_state = 'review';

CREATE OR REPLACE VIEW public.triage_src_automation AS
SELECT
  cf.id,
  'automation'::text AS queue_type,
  cf.content_type,
  cf.title,
  cf.flag_type AS subtitle,
  cf.status,
  cf.confidence AS confidence_score,
  cf.created_at,
  cf.module_name AS source,
  cf.content_id AS entity_id,
  cf.content_type AS entity_table,
  (cf.suggested_value IS NOT NULL)::boolean AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'severity', cf.severity,
    'current_value', cf.current_value,
    'suggested_value', cf.suggested_value
  ) AS meta,
  cf.flag_type,
  '{}'::jsonb AS risk_flags
FROM content_flags cf
WHERE cf.status = 'pending';

CREATE OR REPLACE VIEW public.triage_src_tags AS
SELECT
  ts.id,
  'tags'::text AS queue_type,
  coalesce(ts.entity_type, 'unknown') AS content_type,
  coalesce(ts.suggested_tag_name, ts.suggested_name, 'Tag suggestion') AS title,
  ts.source AS subtitle,
  ts.status,
  ts.confidence AS confidence_score,
  ts.created_at,
  ts.source,
  ts.entity_id,
  ts.entity_type AS entity_table,
  false AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'tag_id', ts.tag_id,
    'reason', ts.reason,
    'ai_model', ts.ai_model
  ) AS meta,
  NULL::text AS flag_type,
  '{}'::jsonb AS risk_flags
FROM tag_suggestions ts
WHERE ts.status = 'pending';

CREATE OR REPLACE VIEW public.triage_src_duplicates AS
SELECT
  dd.id,
  'duplicates'::text AS queue_type,
  dd.entity_type AS content_type,
  'Duplicate: ' || dd.entity_type || ' (' || round(dd.confidence::numeric * 100) || '%)' AS title,
  dd.match_method AS subtitle,
  dd.decision AS status,
  dd.confidence::numeric AS confidence_score,
  dd.created_at,
  coalesce(dd.incoming_source_name, 'system') AS source,
  dd.entity_a_id AS entity_id,
  dd.entity_type AS entity_table,
  true AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'entity_b_id', dd.entity_b_id,
    'match_method', dd.match_method,
    'rules_fired', dd.rules_fired,
    'staging_id', dd.staging_id
  ) AS meta,
  NULL::text AS flag_type,
  '{}'::jsonb AS risk_flags
FROM scraper_dedupe_decisions dd
WHERE dd.decision = 'pending';

CREATE OR REPLACE VIEW public.triage_src_news_quality AS
SELECT
  na.id,
  'news-quality'::text AS queue_type,
  'news_articles'::text AS content_type,
  na.title,
  coalesce(na.quality_status, '') AS subtitle,
  na.quality_status AS status,
  na.quality_score::numeric AS confidence_score,
  na.last_quality_run_at AS created_at,
  'news-pipeline'::text AS source,
  na.id AS entity_id,
  'news_articles'::text AS entity_table,
  (na.quality_decision IS NOT NULL)::boolean AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'quality_status', na.quality_status,
    'relevance_score', na.relevance_score,
    'sentiment', na.sentiment,
    'auto_publish_blocked_reasons', na.auto_publish_blocked_reasons
  ) AS meta,
  NULL::text AS flag_type,
  '{}'::jsonb AS risk_flags
FROM news_articles na
-- rejected articles are decided (auto-rejected by the quality gate); only
-- genuine review candidates belong in the triage queue
WHERE na.quality_status = 'review';

CREATE OR REPLACE VIEW public.triage_src_entity_links AS
SELECT
  el.id,
  'entity-links'::text AS queue_type,
  el.entity_type AS content_type,
  el.candidate_name AS title,
  el.entity_type AS subtitle,
  el.status,
  el.score AS confidence_score,
  el.created_at,
  'news-pipeline'::text AS source,
  el.article_id AS entity_id,
  'news_articles'::text AS entity_table,
  false AS has_diff,
  NULL::uuid AS reporter_id,
  jsonb_build_object(
    'candidate_id', el.candidate_id,
    'context_snippet', el.context_snippet
  ) AS meta,
  NULL::text AS flag_type,
  '{}'::jsonb AS risk_flags
FROM entity_link_review el
WHERE el.status = 'pending';

-- Views are read only by the SECURITY DEFINER RPCs — keep them off PostgREST.
REVOKE ALL ON
  public.triage_src_staging, public.triage_src_moderation,
  public.triage_src_submissions, public.triage_src_content,
  public.triage_src_automation, public.triage_src_tags,
  public.triage_src_duplicates, public.triage_src_news_quality,
  public.triage_src_entity_links
FROM anon, authenticated;

-- ── get_unified_triage_queue: union over the views, weight from registry ─────

CREATE OR REPLACE FUNCTION public.get_unified_triage_queue(
  p_queue_types text[] DEFAULT NULL::text[],
  p_content_types text[] DEFAULT NULL::text[],
  p_search text DEFAULT NULL::text,
  p_sort text DEFAULT 'priority'::text,
  p_page integer DEFAULT 1,
  p_per_page integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offset INT;
  v_result jsonb;
  v_search TEXT;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  v_offset := (p_page - 1) * p_per_page;
  v_search := CASE WHEN p_search IS NOT NULL AND p_search != ''
              THEN '%' || lower(p_search) || '%' ELSE NULL END;

  WITH unified AS (
    SELECT * FROM triage_src_staging
    UNION ALL SELECT * FROM triage_src_moderation
    UNION ALL SELECT * FROM triage_src_submissions
    UNION ALL SELECT * FROM triage_src_content
    UNION ALL SELECT * FROM triage_src_automation
    UNION ALL SELECT * FROM triage_src_tags
    UNION ALL SELECT * FROM triage_src_duplicates
    UNION ALL SELECT * FROM triage_src_news_quality
    UNION ALL SELECT * FROM triage_src_entity_links
  ),
  filtered AS (
    SELECT u.*, r.priority_weight
    FROM unified u
    JOIN triage_sources r ON r.queue_key = u.queue_type AND r.active
    WHERE (p_queue_types IS NULL OR u.queue_type = ANY(p_queue_types))
      AND (p_content_types IS NULL OR u.content_type = ANY(p_content_types))
      AND (v_search IS NULL OR lower(u.title) LIKE v_search OR lower(u.subtitle) LIKE v_search)
  ),
  counted AS (
    SELECT count(*) AS total FROM filtered
  ),
  sorted AS (
    SELECT f.*
    FROM filtered f
    ORDER BY
      CASE WHEN p_sort = 'priority' THEN
        (f.priority_weight
        + LEAST(EXTRACT(EPOCH FROM now() - f.created_at) / 86400.0, 20)
        + CASE WHEN f.confidence_score IS NOT NULL AND f.confidence_score < 0.5 THEN 15
               WHEN f.confidence_score IS NOT NULL AND f.confidence_score < 0.7 THEN 8
               ELSE 0 END
        + CASE WHEN f.flag_type = 'DELETE_REQUEST' THEN 20
               WHEN f.flag_type = 'CORRECTION' THEN 10
               ELSE 0 END
        )
      ELSE 0 END DESC,
      CASE WHEN p_sort = 'age' THEN f.created_at END ASC,
      CASE WHEN p_sort = 'confidence' THEN coalesce(f.confidence_score, 0) END ASC,
      f.created_at DESC
    LIMIT p_per_page
    OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'queue_type', s.queue_type,
        'content_type', s.content_type,
        'title', s.title,
        'subtitle', s.subtitle,
        'status', s.status,
        'confidence_score', s.confidence_score,
        'created_at', s.created_at,
        'source', s.source,
        'entity_id', s.entity_id,
        'entity_table', s.entity_table,
        'has_diff', s.has_diff,
        'reporter_id', s.reporter_id,
        'meta', s.meta,
        'risk_flags', s.risk_flags
      )
    ) FROM sorted s), '[]'::jsonb),
    'total', (SELECT total FROM counted),
    'page', p_page,
    'per_page', p_per_page
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- ── get_admin_counts: loops the registry — the single count source ───────────
-- Every active queue automatically emits review_<count_key> / _overdue keys
-- computed from the SAME view the inbox reads. Feedback keeps its dedicated
-- count (it is a board, not a triage queue).

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

  RETURN result;
END;
$function$;
