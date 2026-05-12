-- Fix get_unified_triage_queue RPC:
-- 1. cms_content_metadata uses id/source_table/source_id, not content_id/content_type
-- 2. workflow_state is enum cms_workflow_state, needs ::text cast

CREATE OR REPLACE FUNCTION get_unified_triage_queue(
  p_queue_types TEXT[] DEFAULT NULL,
  p_content_types TEXT[] DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT 'priority',
  p_page INT DEFAULT 1,
  p_per_page INT DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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
      AND cs.content_type != 'feedback'

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
    WHERE na.quality_status IN ('review', 'rejected')

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
$$;

-- Also fix triage_action: content case used content_id instead of id
CREATE OR REPLACE FUNCTION triage_action(
  p_item_id UUID,
  p_queue_type TEXT,
  p_action TEXT,
  p_user_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_canned_slug TEXT DEFAULT NULL,
  p_notify BOOLEAN DEFAULT TRUE
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notes TEXT;
  v_result jsonb := '{"ok": true}'::jsonb;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('approve', 'reject', 'skip', 'flag') THEN
    RAISE EXCEPTION 'invalid action: %', p_action;
  END IF;

  v_notes := p_notes;
  IF p_canned_slug IS NOT NULL AND v_notes IS NULL THEN
    SELECT template INTO v_notes
    FROM canned_responses
    WHERE slug = p_canned_slug AND active = true;
  END IF;

  CASE p_queue_type
    WHEN 'staging' THEN
      IF p_action = 'approve' THEN
        UPDATE ingestion_staging
        SET review_status = 'approved',
            reviewed_by = p_user_id,
            reviewed_at = now(),
            review_notes = coalesce(v_notes, review_notes)
        WHERE id = p_item_id;
      ELSIF p_action = 'reject' THEN
        UPDATE ingestion_staging
        SET review_status = 'rejected',
            disposition = 'rejected',
            reviewed_by = p_user_id,
            reviewed_at = now(),
            review_notes = coalesce(v_notes, review_notes)
        WHERE id = p_item_id;
      END IF;

    WHEN 'moderation' THEN
      IF p_action = 'approve' THEN
        UPDATE moderation_flags
        SET status = 'RESOLVED',
            resolved_by = p_user_id,
            resolved_at = now(),
            resolution_note = coalesce(v_notes, resolution_note),
            updated_at = now()
        WHERE id = p_item_id;
      ELSIF p_action = 'reject' THEN
        UPDATE moderation_flags
        SET status = 'REJECTED',
            resolved_by = p_user_id,
            resolved_at = now(),
            resolution_note = coalesce(v_notes, resolution_note),
            updated_at = now()
        WHERE id = p_item_id;
      END IF;

    WHEN 'submissions' THEN
      IF p_action = 'approve' THEN
        UPDATE community_submissions
        SET status = 'approved',
            reviewed_by = p_user_id,
            reviewed_at = now(),
            reviewer_notes = coalesce(v_notes, reviewer_notes)
        WHERE id = p_item_id;
      ELSIF p_action = 'reject' THEN
        UPDATE community_submissions
        SET status = 'rejected',
            reviewed_by = p_user_id,
            reviewed_at = now(),
            reviewer_notes = coalesce(v_notes, reviewer_notes)
        WHERE id = p_item_id;
      END IF;

    WHEN 'automation' THEN
      IF p_action = 'approve' THEN
        UPDATE content_flags
        SET status = 'approved',
            reviewed_by = p_user_id,
            reviewed_at = now(),
            updated_at = now()
        WHERE id = p_item_id;
      ELSIF p_action = 'reject' THEN
        UPDATE content_flags
        SET status = 'rejected',
            reviewed_by = p_user_id,
            reviewed_at = now(),
            updated_at = now()
        WHERE id = p_item_id;
      END IF;

    WHEN 'tags' THEN
      IF p_action = 'approve' THEN
        PERFORM approve_tag_suggestions(ARRAY[p_item_id], p_user_id);
      ELSIF p_action = 'reject' THEN
        UPDATE tag_suggestions
        SET status = 'rejected',
            reviewed_by = p_user_id,
            reviewed_at = now()
        WHERE id = p_item_id;
      END IF;

    WHEN 'duplicates' THEN
      IF p_action = 'approve' THEN
        UPDATE scraper_dedupe_decisions
        SET decision = 'merged', decided_by = 'admin'
        WHERE id = p_item_id;
      ELSIF p_action = 'reject' THEN
        UPDATE scraper_dedupe_decisions
        SET decision = 'not_duplicate', decided_by = 'admin'
        WHERE id = p_item_id;
      END IF;

    WHEN 'news-quality' THEN
      IF p_action = 'approve' THEN
        UPDATE news_articles
        SET quality_status = 'passed'
        WHERE id = p_item_id;
      ELSIF p_action = 'reject' THEN
        UPDATE news_articles
        SET quality_status = 'rejected'
        WHERE id = p_item_id;
      END IF;

    WHEN 'entity-links' THEN
      IF p_action = 'approve' THEN
        UPDATE entity_link_review
        SET status = 'approved',
            resolved_by = p_user_id,
            resolved_at = now()
        WHERE id = p_item_id;
      ELSIF p_action = 'reject' THEN
        UPDATE entity_link_review
        SET status = 'rejected',
            resolved_by = p_user_id,
            resolved_at = now()
        WHERE id = p_item_id;
      END IF;

    WHEN 'content' THEN
      IF p_action = 'approve' THEN
        UPDATE cms_content_metadata
        SET workflow_state = 'published',
            published_at = now(),
            published_by = p_user_id
        WHERE id = p_item_id AND workflow_state = 'review';
      ELSIF p_action = 'reject' THEN
        UPDATE cms_content_metadata
        SET workflow_state = 'draft',
            editor_notes = coalesce(v_notes, editor_notes)
        WHERE id = p_item_id AND workflow_state = 'review';
      END IF;

    ELSE
      RAISE EXCEPTION 'unknown queue_type: %', p_queue_type;
  END CASE;

  v_result := jsonb_build_object(
    'ok', true,
    'action', p_action,
    'queue_type', p_queue_type,
    'item_id', p_item_id
  );

  RETURN v_result;
END;
$$;
