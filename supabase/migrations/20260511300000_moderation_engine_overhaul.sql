-- Moderation Engine Overhaul
-- Unified triage queue, canned responses, user trust overrides

-- 1. canned_responses — pre-built rejection templates
CREATE TABLE public.canned_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  label       TEXT NOT NULL,
  template    TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'rejection'
    CHECK (category IN ('rejection', 'info', 'followup')),
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.canned_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canned_responses_select"
  ON public.canned_responses FOR SELECT USING (true);

CREATE POLICY "canned_responses_admin_all"
  ON public.canned_responses FOR ALL
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));

INSERT INTO public.canned_responses (slug, label, template, sort_order) VALUES
  ('missing_contact', 'Missing contact info', 'This submission is missing required contact information.', 1),
  ('duplicate_entry', 'Duplicate entry', 'This appears to be a duplicate of an existing listing.', 2),
  ('guidelines_violation', 'Fails community guidelines', 'This submission does not meet our community guidelines.', 3),
  ('insufficient_quality', 'Insufficient quality', 'This submission does not meet our minimum quality standards.', 4),
  ('incomplete_data', 'Incomplete data', 'This submission is missing key information needed for publication.', 5);


-- 2. user_trust_overrides — admin per-user auto-approve toggle
CREATE TABLE public.user_trust_overrides (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  auto_approve    BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason TEXT,
  set_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  set_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_trust_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_trust_overrides_admin_all"
  ON public.user_trust_overrides FOR ALL
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));


-- 3. Indexes for the UNION query performance
CREATE INDEX IF NOT EXISTS idx_ingestion_staging_triage
  ON public.ingestion_staging (created_at DESC)
  WHERE review_status = 'pending_review' AND disposition = 'pending';

CREATE INDEX IF NOT EXISTS idx_community_submissions_triage
  ON public.community_submissions (submitted_at DESC)
  WHERE status = 'pending' AND content_type != 'feedback';

CREATE INDEX IF NOT EXISTS idx_content_flags_triage
  ON public.content_flags (created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tag_suggestions_triage
  ON public.tag_suggestions (created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_entity_link_review_triage
  ON public.entity_link_review (created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_news_articles_quality_review
  ON public.news_articles (last_quality_run_at DESC NULLS LAST)
  WHERE quality_status IN ('review', 'rejected');


-- 4. get_unified_triage_queue — single RPC for all review queues
CREATE OR REPLACE FUNCTION public.get_unified_triage_queue(
  p_queue_types  TEXT[]  DEFAULT NULL,
  p_content_types TEXT[] DEFAULT NULL,
  p_search       TEXT    DEFAULT NULL,
  p_sort         TEXT    DEFAULT 'priority',
  p_page         INT     DEFAULT 1,
  p_per_page     INT     DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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
    -- Staging items pending review
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

    -- Moderation flags (user/system reports)
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

    -- Community submissions (not feedback)
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

    -- CMS content in review state
    SELECT
      cm.content_id AS id,
      'content'::text,
      cm.content_type,
      coalesce(cm.meta_title, cm.content_type || ' content') AS title,
      cm.workflow_state AS subtitle,
      cm.workflow_state AS status,
      NULL::numeric,
      cm.updated_at,
      'cms',
      cm.content_id,
      cm.content_type,
      false,
      cm.last_edited_by,
      jsonb_build_object('editor_notes', cm.editor_notes),
      NULL::text
    FROM cms_content_metadata cm
    WHERE cm.workflow_state = 'review'

    UNION ALL

    -- Content flags (automation suggestions)
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

    -- Tag suggestions
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

    -- Dedupe decisions pending
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

    -- News quality review
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

    -- Entity link review
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


-- 5. triage_action — dispatch approve/reject/skip/flag for any queue type
CREATE OR REPLACE FUNCTION public.triage_action(
  p_item_id     UUID,
  p_queue_type  TEXT,
  p_action      TEXT,
  p_user_id     UUID,
  p_notes       TEXT    DEFAULT NULL,
  p_canned_slug TEXT    DEFAULT NULL,
  p_notify      BOOLEAN DEFAULT TRUE
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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

  -- Resolve canned response template if provided
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
      ELSIF p_action = 'skip' THEN
        -- no-op, item stays in queue
        NULL;
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
        WHERE content_id = p_item_id AND workflow_state = 'review';
      ELSIF p_action = 'reject' THEN
        UPDATE cms_content_metadata
        SET workflow_state = 'draft',
            editor_notes = coalesce(v_notes, editor_notes)
        WHERE content_id = p_item_id AND workflow_state = 'review';
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


-- 6. Grants
GRANT EXECUTE ON FUNCTION public.get_unified_triage_queue TO authenticated;
GRANT EXECUTE ON FUNCTION public.triage_action TO authenticated;
GRANT SELECT ON public.canned_responses TO authenticated;
GRANT ALL ON public.user_trust_overrides TO authenticated;
