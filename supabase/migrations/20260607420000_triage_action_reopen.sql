-- Add a 'reopen' action to triage_action so the inbox can undo an accidental
-- approve/reject. Each branch reverts the row to the exact pending token the
-- get_unified_triage_queue selector requires, so the item reliably reappears.
--
-- tags + duplicates are intentionally NOT reopenable: approving them has
-- irreversible side effects (approve_tag_suggestions creates tags; a dedupe
-- 'merged' decision merges entities), so resurfacing the queue row would let a
-- re-approve double-apply. Those raise a clear error instead.

CREATE OR REPLACE FUNCTION public.triage_action(
  p_item_id uuid,
  p_queue_type text,
  p_action text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text,
  p_canned_slug text DEFAULT NULL::text,
  p_notify boolean DEFAULT true
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
