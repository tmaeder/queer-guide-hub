-- Submission lifecycle -> inbox notifications.
-- A DB trigger is the single choke point for all status writers
-- (submission-action edge fn, admin SQL, pipeline promotion).

-- 1. Widen notifications type vocabulary (full list from 20260623133216 + submission_update)
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'message','event','system','trip_nudge','event_reminder','watch_import','dm',
    'friend_request','friend_accepted','new_match','wave','someone_nearby',
    'traveler_incoming','sos','submission_update'
  ]));

-- 2. Trigger function
CREATE OR REPLACE FUNCTION public.tg_submission_status_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outcome    text;
  v_title      text;
  v_content    text;
  v_action_url text := '/me/contributions';
  v_item_title text;
  v_slug       text;
  v_existing   record;
  v_ids        jsonb;
  v_count      int;
BEGIN
  IF NEW.submitted_by IS NULL
     OR NOT NEW.notify_submitter
     OR NEW.is_spam
     OR NEW.content_type = 'feedback' THEN  -- feedback has its own notify path
    RETURN NEW;
  END IF;

  v_item_title := COALESCE(NEW.data->>'title', NEW.data->>'name', initcap(NEW.content_type));

  IF NEW.promoted_to_id IS NOT NULL
     AND OLD.promoted_to_id IS DISTINCT FROM NEW.promoted_to_id THEN
    v_outcome := 'published';
    IF NEW.promoted_to_table IN ('events','venues','marketplace_listings','news_articles','personalities') THEN
      BEGIN
        EXECUTE format('SELECT slug FROM public.%I WHERE id = $1', NEW.promoted_to_table)
          INTO v_slug USING NEW.promoted_to_id;
      EXCEPTION WHEN OTHERS THEN
        v_slug := NULL;
      END;
      IF v_slug IS NOT NULL THEN
        v_action_url := '/' || (CASE NEW.promoted_to_table
            WHEN 'events' THEN 'events'
            WHEN 'venues' THEN 'venues'
            WHEN 'marketplace_listings' THEN 'marketplace'
            WHEN 'news_articles' THEN 'news'
            WHEN 'personalities' THEN 'personalities'
          END) || '/' || v_slug;
      END IF;
    END IF;
    v_title   := 'Your submission is live: ' || v_item_title;
    v_content := 'It is now published on Queer Guide.';
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved' THEN
    v_outcome := 'approved';
    v_title   := 'Submission approved: ' || v_item_title;
    v_content := 'It will go live shortly.';
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('rejected','duplicate') THEN
    v_outcome := 'rejected';
    v_title   := 'Submission not published: ' || v_item_title;
    v_content := NULLIF(left(COALESCE(NEW.reviewer_notes, ''), 240), '');
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'needs_info' THEN
    v_outcome := 'needs_info';
    v_title   := 'More info needed: ' || v_item_title;
    v_content := NULLIF(left(COALESCE(NEW.reviewer_notes, ''), 240), '');
  ELSE
    RETURN NEW;
  END IF;

  -- Batch anti-spam: fold into a recent unread notification with the same outcome
  -- (one flyer-scan review session => one inbox row).
  SELECT id, metadata INTO v_existing
    FROM public.notifications
   WHERE user_id = NEW.submitted_by
     AND type = 'submission_update'
     AND read = false
     AND metadata->>'outcome' = v_outcome
     AND created_at > now() - interval '30 minutes'
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND THEN
    v_ids := COALESCE(v_existing.metadata->'submission_ids', '[]'::jsonb);
    IF NOT (v_ids ? NEW.id::text) THEN
      v_ids   := v_ids || to_jsonb(NEW.id::text);
      v_count := jsonb_array_length(v_ids);
      UPDATE public.notifications
         SET metadata   = v_existing.metadata || jsonb_build_object('submission_ids', v_ids),
             title      = v_count || ' submissions ' || (CASE v_outcome
                            WHEN 'published'  THEN 'published'
                            WHEN 'approved'   THEN 'approved'
                            WHEN 'needs_info' THEN 'need more info'
                            ELSE 'reviewed' END),
             content    = NULL,
             action_url = '/me/contributions',
             updated_at = now()
       WHERE id = v_existing.id;
    END IF;
  ELSE
    INSERT INTO public.notifications (user_id, type, title, content, action_url, related_id, metadata)
    VALUES (
      NEW.submitted_by, 'submission_update', v_title, v_content, v_action_url, NEW.id,
      jsonb_build_object(
        'outcome',           v_outcome,
        'submission_ids',    jsonb_build_array(NEW.id::text),
        'content_type',      NEW.content_type,
        'item_title',        v_item_title,
        'promoted_to_table', NEW.promoted_to_table,
        'promoted_to_id',    NEW.promoted_to_id,
        'reviewer_notes',    CASE WHEN v_outcome IN ('rejected','needs_info')
                               THEN NULLIF(left(COALESCE(NEW.reviewer_notes, ''), 240), '') END
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block a review/promotion transaction over a notification failure.
  RAISE WARNING 'tg_submission_status_notify failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_submission_status_notify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS submission_status_notify ON public.community_submissions;
CREATE TRIGGER submission_status_notify
  AFTER UPDATE OF status, promoted_to_id ON public.community_submissions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status
        OR OLD.promoted_to_id IS DISTINCT FROM NEW.promoted_to_id)
  EXECUTE FUNCTION public.tg_submission_status_notify();
