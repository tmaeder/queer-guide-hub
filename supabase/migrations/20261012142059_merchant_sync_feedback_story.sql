-- API errors are loaded for story members but are not listed on the Triage
-- tab. Give merchant failures one permanent, visible dashboard story.
CREATE OR REPLACE FUNCTION private.ensure_merchant_sync_story()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('merchant-sync-feedback-story', 0));
  SELECT id INTO v_id FROM public.feedback_stories
  WHERE labels @> ARRAY['automatic-merchant-sync']::text[] ORDER BY created_at LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.feedback_stories(title, summary, brief_title, narrative, labels, origin, priority)
    VALUES ('Merchant sync failures',
      'Automatic merchant sync error reports. Repeated failures are grouped by merchant; verified recovery resolves each report. This story reopens when a merchant fails again.',
      'Merchant sync failures',
      'As an admin, I want merchant sync failures reported automatically here with the affected merchant, error and occurrence count, so I can investigate failures and verify recovery.',
      ARRAY['automatic-merchant-sync','marketplace'], 'manual', 1)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION private.ensure_merchant_sync_story() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.report_merchant_sync_feedback()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_fingerprint text := 'merchant-sync:' || NEW.id::text;
  v_submission uuid;
  v_story uuid;
BEGIN
  IF NEW.last_sync_status LIKE 'error:%' THEN
    v_submission := public.upsert_api_error(v_fingerprint, jsonb_build_object(
      'title', '[merchant sync] ' || NEW.display_name,
      'description', NEW.last_sync_status,
      'message', NEW.last_sync_status,
      'service', 'marketplace', 'function_name', 'marketplace-sync-merchants',
      'route', '/admin/content/organizations?tab=merchants',
      'merchant_id', NEW.id, 'merchant_slug', NEW.slug,
      'shop_domain', NEW.shop_domain, 'provider', NEW.provider,
      'reported_at', COALESCE(NEW.last_sync_at, now())
    ), 'merchant-sync');
    v_story := private.ensure_merchant_sync_story();
    INSERT INTO public.feedback_story_members(story_id, submission_id)
    VALUES (v_story, v_submission) ON CONFLICT DO NOTHING;
    UPDATE public.feedback_stories SET status='open', resolved_at=NULL,
      archived_at=NULL, archived_by=NULL, archive_reason=NULL
    WHERE id=v_story AND (status <> 'open' OR archived_at IS NOT NULL);
  ELSIF NEW.last_sync_status = 'ok' THEN
    UPDATE public.community_submissions
    SET feedback_status = 'done', resolution = 'fixed', resolved_at = now(),
        data = data || jsonb_build_object('recovery', jsonb_build_object(
          'verified_at', NEW.last_sync_at, 'items', NEW.last_sync_items))
    WHERE content_type = 'api_error' AND fingerprint = v_fingerprint
      AND feedback_status IS DISTINCT FROM 'done';
    -- Keep the story open while any merchant is still failing.
    IF NOT EXISTS (SELECT 1 FROM public.marketplace_merchants WHERE last_sync_status LIKE 'error:%') THEN
      UPDATE public.feedback_stories SET status='resolved', resolved_at=now()
      WHERE labels @> ARRAY['automatic-merchant-sync']::text[] AND status <> 'resolved';
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Feedback availability must not roll back a successful merchant sync.
  RAISE WARNING 'Merchant sync feedback failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.report_merchant_sync_feedback() FROM PUBLIC, anon, authenticated;

DO $$ DECLARE v_story uuid; BEGIN
  v_story := private.ensure_merchant_sync_story();
  INSERT INTO public.feedback_story_members(story_id, submission_id)
  SELECT v_story, id FROM public.community_submissions
  WHERE content_type='api_error' AND fingerprint LIKE 'merchant-sync:%'
  ON CONFLICT DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.marketplace_merchants WHERE last_sync_status LIKE 'error:%') THEN
    UPDATE public.feedback_stories SET status='resolved', resolved_at=now() WHERE id=v_story;
  END IF;
END $$;
