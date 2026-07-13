-- ============================================================================
-- Triage queue hygiene (admin review cleanup, 2026-07-13)
-- ----------------------------------------------------------------------------
-- The /admin/review surface had accumulated ~42k pending items, ~95% structural
-- noise. Root-cause fixes so the queues stay clean:
--
-- 1. get_unified_triage_queue:
--    - news-quality branch showed quality_status='rejected' articles (11.4k
--      auto-rejected, relevance 0.00) forever — show only 'review'.
--    - submissions branch showed feedback-board operational rows (api_error /
--      pipeline_failure) that already have their own surface at /admin/feedback
--      — exclude them alongside the existing 'feedback' exclusion.
-- 2. get_admin_counts: review_submissions badge matches the same exclusion.
-- 3. Sync trigger: closing an operational item on the feedback board
--    (feedback_status -> done/dismissed) also closes its content-review status,
--    so resolved items can never re-clog the triage queue (3,997 were stuck
--    this way).
-- ============================================================================

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
  v_total  bigint;
  v_search TEXT;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  v_offset := (p_page - 1) * p_per_page;
  v_search := CASE WHEN p_search IS NOT NULL AND p_search != ''
              THEN '%' || lower(p_search) || '%' ELSE NULL END;

  WITH unified AS (
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
      NULL::text AS flag_type
    FROM ingestion_staging s
    WHERE s.review_status = 'pending_review'
      AND s.disposition = 'pending'

    UNION ALL

    SELECT
      mf.id,
      'moderation'::text,
      mf.content_type,
      mf.reason AS title,
      mf.flag_type AS subtitle,
      mf.status,
      NULL::numeric,
      mf.created_at,
      mf.source,
      mf.content_id,
      mf.content_type,
      (mf.suggested_changes IS NOT NULL)::boolean,
      mf.reporter_user_id,
      jsonb_build_object(
        'flag_type', mf.flag_type,
        'suggested_changes', mf.suggested_changes
      ),
      mf.flag_type
    FROM moderation_flags mf
    WHERE mf.status IN ('OPEN', 'IN_REVIEW')

    UNION ALL

    SELECT
      cs.id,
      'submissions'::text,
      cs.content_type,
      coalesce(cs.data->>'name', cs.data->>'title', cs.source_url, 'Submission') AS title,
      coalesce(cs.platform, cs.sub_source_type, '') AS subtitle,
      cs.status,
      cs.confidence_score,
      cs.submitted_at,
      coalesce(cs.platform, 'web'),
      cs.promoted_to_id,
      cs.promoted_to_table,
      false,
      cs.submitted_by,
      jsonb_build_object(
        'priority', cs.priority,
        'labels', cs.labels,
        'source_url', cs.source_url
      ),
      NULL::text
    FROM community_submissions cs
    WHERE cs.status = 'pending'
      -- operational/feedback rows live on the feedback board, not content triage
      AND cs.content_type NOT IN ('feedback', 'api_error', 'pipeline_failure')

    UNION ALL

    SELECT
      cm.id,
      'content'::text,
      cm.source_table AS content_type,
      coalesce(cm.meta_title, cm.source_table || ' content') AS title,
      cm.workflow_state::text AS subtitle,
      cm.workflow_state::text AS status,
      NULL::numeric,
      cm.updated_at,
      'cms',
      cm.source_id,
      cm.source_table,
      false,
      cm.last_edited_by,
      jsonb_build_object('editor_notes', cm.editor_notes),
      NULL::text
    FROM cms_content_metadata cm
    WHERE cm.workflow_state = 'review'

    UNION ALL

    SELECT
      cf.id,
      'automation'::text,
      cf.content_type,
      cf.title,
      cf.flag_type AS subtitle,
      cf.status,
      cf.confidence,
      cf.created_at,
      cf.module_name,
      cf.content_id,
      cf.content_type,
      (cf.suggested_value IS NOT NULL)::boolean,
      NULL::uuid,
      jsonb_build_object(
        'severity', cf.severity,
        'current_value', cf.current_value,
        'suggested_value', cf.suggested_value
      ),
      cf.flag_type
    FROM content_flags cf
    WHERE cf.status = 'pending'

    UNION ALL

    SELECT
      ts.id,
      'tags'::text,
      coalesce(ts.entity_type, 'unknown'),
      coalesce(ts.suggested_tag_name, ts.suggested_name, 'Tag suggestion') AS title,
      ts.source AS subtitle,
      ts.status,
      ts.confidence,
      ts.created_at,
      ts.source,
      ts.entity_id,
      ts.entity_type,
      false,
      NULL::uuid,
      jsonb_build_object(
        'tag_id', ts.tag_id,
        'reason', ts.reason,
        'ai_model', ts.ai_model
      ),
      NULL::text
    FROM tag_suggestions ts
    WHERE ts.status = 'pending'

    UNION ALL

    SELECT
      dd.id,
      'duplicates'::text,
      dd.entity_type AS content_type,
      'Duplicate: ' || dd.entity_type || ' (' || round(dd.confidence::numeric * 100) || '%)' AS title,
      dd.match_method AS subtitle,
      dd.decision AS status,
      dd.confidence::numeric,
      dd.created_at,
      coalesce(dd.incoming_source_name, 'system'),
      dd.entity_a_id,
      dd.entity_type,
      true,
      NULL::uuid,
      jsonb_build_object(
        'entity_b_id', dd.entity_b_id,
        'match_method', dd.match_method,
        'rules_fired', dd.rules_fired,
        'staging_id', dd.staging_id
      ),
      NULL::text
    FROM scraper_dedupe_decisions dd
    WHERE dd.decision = 'pending'

    UNION ALL

    SELECT
      na.id,
      'news-quality'::text,
      'news_articles'::text,
      na.title,
      coalesce(na.quality_status, '') AS subtitle,
      na.quality_status AS status,
      na.quality_score::numeric,
      na.last_quality_run_at,
      'news-pipeline',
      na.id,
      'news_articles',
      (na.quality_decision IS NOT NULL)::boolean,
      NULL::uuid,
      jsonb_build_object(
        'quality_status', na.quality_status,
        'relevance_score', na.relevance_score,
        'sentiment', na.sentiment,
        'auto_publish_blocked_reasons', na.auto_publish_blocked_reasons
      ),
      NULL::text
    FROM news_articles na
    -- rejected articles are decided (auto-rejected by the quality gate); only
    -- genuine review candidates belong in the triage queue
    WHERE na.quality_status = 'review'

    UNION ALL

    SELECT
      el.id,
      'entity-links'::text,
      el.entity_type AS content_type,
      el.candidate_name AS title,
      el.entity_type AS subtitle,
      el.status,
      el.score,
      el.created_at,
      'news-pipeline',
      el.article_id,
      'news_articles',
      false,
      NULL::uuid,
      jsonb_build_object(
        'candidate_id', el.candidate_id,
        'context_snippet', el.context_snippet
      ),
      NULL::text
    FROM entity_link_review el
    WHERE el.status = 'pending'
  ),
  filtered AS (
    SELECT u.*
    FROM unified u
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
        (CASE f.queue_type
          WHEN 'moderation' THEN 100
          WHEN 'submissions' THEN 80
          WHEN 'staging' THEN 60
          WHEN 'content' THEN 50
          WHEN 'tags' THEN 30
          WHEN 'news-quality' THEN 30
          WHEN 'entity-links' THEN 20
          WHEN 'duplicates' THEN 20
          WHEN 'automation' THEN 10
          ELSE 0
        END
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
        'meta', s.meta
      )
    ) FROM sorted s), '[]'::jsonb),
    'total', (SELECT total FROM counted),
    'page', p_page,
    'per_page', p_per_page
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- ── get_admin_counts: badge matches the queue's submission exclusion ─────────

CREATE OR REPLACE FUNCTION public.get_admin_counts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  estimates jsonb;
  sla_staging_h     constant int := 48;
  sla_cms_h         constant int := 72;
  sla_moderation_h  constant int := 24;
  sla_tags_h        constant int := 72;
  sla_duplicates_h  constant int := 72;
  sla_feedback_h    constant int := 48;
  sla_submissions_h constant int := 24;
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

  SELECT estimates || jsonb_build_object(
    'review_staging',
      (SELECT count(*) FROM ingestion_staging
        WHERE review_status='pending_review' AND disposition='pending'),
    'review_staging_overdue',
      (SELECT count(*) FROM ingestion_staging
        WHERE review_status='pending_review' AND disposition='pending'
          AND created_at < now() - (sla_staging_h || ' hours')::interval),
    'review_cms',
      (SELECT count(*) FROM cms_content_metadata WHERE workflow_state='review'),
    'review_cms_overdue',
      (SELECT count(*) FROM cms_content_metadata
        WHERE workflow_state='review'
          AND created_at < now() - (sla_cms_h || ' hours')::interval),
    'review_moderation',
      (SELECT count(*) FROM moderation_flags WHERE status='OPEN'),
    'review_moderation_overdue',
      (SELECT count(*) FROM moderation_flags
        WHERE status='OPEN'
          AND created_at < now() - (sla_moderation_h || ' hours')::interval),
    'review_tags',
      (SELECT count(*) FROM tag_suggestions WHERE status='pending'),
    'review_tags_overdue',
      (SELECT count(*) FROM tag_suggestions
        WHERE status='pending'
          AND created_at < now() - (sla_tags_h || ' hours')::interval),
    'review_duplicates',
      (SELECT count(*) FROM scraper_dedupe_decisions WHERE decision='pending'),
    'review_duplicates_overdue',
      (SELECT count(*) FROM scraper_dedupe_decisions
        WHERE decision='pending'
          AND created_at IS NOT NULL
          AND created_at < now() - (sla_duplicates_h || ' hours')::interval),
    'review_feedback',
      (SELECT count(*) FROM community_submissions
        WHERE content_type='feedback' AND feedback_status IN ('new','under_review')),
    'review_feedback_overdue',
      (SELECT count(*) FROM community_submissions
        WHERE content_type='feedback' AND feedback_status IN ('new','under_review')
          AND submitted_at < now() - (sla_feedback_h || ' hours')::interval),
    'review_submissions',
      (SELECT count(*) FROM community_submissions
        WHERE status='pending'
          AND content_type NOT IN ('feedback','api_error','pipeline_failure')),
    'review_submissions_overdue',
      (SELECT count(*) FROM community_submissions
        WHERE status='pending'
          AND content_type NOT IN ('feedback','api_error','pipeline_failure')
          AND submitted_at < now() - (sla_submissions_h || ' hours')::interval),
    'sla_hours', jsonb_build_object(
      'staging', sla_staging_h,
      'cms', sla_cms_h,
      'moderation', sla_moderation_h,
      'tags', sla_tags_h,
      'duplicates', sla_duplicates_h,
      'feedback', sla_feedback_h,
      'submissions', sla_submissions_h
    )
  )
  INTO result;

  RETURN result;
END;
$function$;

-- ── Feedback-board close also closes the content-review status ───────────────
-- Operational rows (api_error / pipeline_failure / feedback) are worked on the
-- feedback board via feedback_status; the triage `status` column stayed
-- 'pending' forever (3,997 rows). Keep them in sync going forward.

CREATE OR REPLACE FUNCTION public.sync_feedback_close_to_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.content_type IN ('feedback','api_error','pipeline_failure')
     AND NEW.feedback_status IN ('done','dismissed','wont_fix','duplicate')
     AND NEW.status = 'pending' THEN
    NEW.status := 'approved';
    NEW.reviewed_at := coalesce(NEW.reviewed_at, now());
    NEW.reviewer_notes := coalesce(NEW.reviewer_notes, 'auto-closed: resolved on feedback board');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_feedback_close_to_status ON public.community_submissions;
CREATE TRIGGER trg_sync_feedback_close_to_status
  BEFORE UPDATE OF feedback_status ON public.community_submissions
  FOR EACH ROW EXECUTE FUNCTION public.sync_feedback_close_to_status();
