-- ============================================================================
-- Unified Review Inbox v2 — A2: action contract (2026-07-24)
-- ----------------------------------------------------------------------------
-- triage_action gains two params, preparing the per-queue folding (A3):
--   p_confirm boolean — explicit high-risk confirmation. Branches that wrap
--     safety-gated entity RPCs (city criminalizing safety notes, personality
--     consent publish) will pass it through; the invariant itself STAYS inside
--     those RPCs (defense in depth).
--   p_payload jsonb — queue-specific extras (e.g. chosen merge target).
-- The nine existing branches are unchanged and ignore both params.
--
-- NOTE: adding defaulted params via CREATE OR REPLACE would create a second
-- overload and break PostgREST dispatch — the old signature must be dropped.
-- ============================================================================

DROP FUNCTION IF EXISTS public.triage_action(uuid, text, text, uuid, text, text, boolean);

CREATE OR REPLACE FUNCTION public.triage_action(
  p_item_id uuid,
  p_queue_type text,
  p_action text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text,
  p_canned_slug text DEFAULT NULL::text,
  p_notify boolean DEFAULT true,
  p_confirm boolean DEFAULT false,
  p_payload jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_notes TEXT;
  v_result jsonb := '{"ok": true}'::jsonb;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('approve', 'reject', 'skip', 'flag', 'reopen') THEN
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
      ELSIF p_action = 'reopen' THEN
        UPDATE ingestion_staging
        SET review_status = 'pending_review',
            disposition = 'pending',
            reviewed_by = NULL,
            reviewed_at = NULL
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
      ELSIF p_action = 'reopen' THEN
        UPDATE moderation_flags
        SET status = 'OPEN',
            resolved_by = NULL,
            resolved_at = NULL,
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
      ELSIF p_action = 'reopen' THEN
        UPDATE community_submissions
        SET status = 'pending',
            reviewed_by = NULL,
            reviewed_at = NULL
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
      ELSIF p_action = 'reopen' THEN
        UPDATE content_flags
        SET status = 'pending',
            reviewed_by = NULL,
            reviewed_at = NULL,
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
      ELSIF p_action = 'reopen' THEN
        RAISE EXCEPTION 'reopen not supported for tags (approving creates tags)'
          USING ERRCODE = '22023';
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
      ELSIF p_action = 'reopen' THEN
        RAISE EXCEPTION 'reopen not supported for duplicates (approving merges entities)'
          USING ERRCODE = '22023';
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
      ELSIF p_action = 'reopen' THEN
        UPDATE news_articles
        SET quality_status = 'review'
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
      ELSIF p_action = 'reopen' THEN
        UPDATE entity_link_review
        SET status = 'pending',
            resolved_by = NULL,
            resolved_at = NULL
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
        WHERE id = p_item_id;
      ELSIF p_action = 'reopen' THEN
        UPDATE cms_content_metadata
        SET workflow_state = 'review',
            published_at = NULL,
            published_by = NULL
        WHERE id = p_item_id;
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
$function$;

-- DROP FUNCTION removes grants; the RPC self-gates via has_any_role_jwt, so
-- EXECUTE for authenticated is safe and required (see admin-rpc-revoke-403).
REVOKE ALL ON FUNCTION public.triage_action(uuid, text, text, uuid, text, text, boolean, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.triage_action(uuid, text, text, uuid, text, text, boolean, boolean, jsonb) TO authenticated, service_role;
