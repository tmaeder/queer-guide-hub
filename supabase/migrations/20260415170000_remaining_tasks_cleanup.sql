-- Remaining data-ops housekeeping.
-- 1. Legacy venue_subtype column restored so old adapters stop failing.
-- 2. Meilisearch: hide venues when flagged as duplicates (trigger on duplicate_of_id).
-- 3. Audit trigger for review_status changes (reject / bulk_* paths without edge-fn hook).

ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS venue_subtype TEXT;

CREATE OR REPLACE FUNCTION public.notify_meilisearch_duplicate_hide()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.duplicate_of_id IS NOT NULL
     AND (OLD.duplicate_of_id IS NULL OR OLD.duplicate_of_id <> NEW.duplicate_of_id) THEN
    PERFORM extensions.http_post(
      url     := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/meilisearch-sync',
      body    := jsonb_build_object('action','delete','index','venues','id', NEW.id::text),
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_venues_hide_duplicate ON public.venues;
CREATE TRIGGER trg_venues_hide_duplicate
AFTER UPDATE OF duplicate_of_id ON public.venues
FOR EACH ROW EXECUTE FUNCTION public.notify_meilisearch_duplicate_hide();

CREATE OR REPLACE FUNCTION public.audit_staging_review_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.review_status IS DISTINCT FROM OLD.review_status
     AND NEW.review_status IN ('approved','rejected') THEN
    INSERT INTO public.ingestion_events (staging_id, stage, old_status, new_status, actor, payload)
    VALUES (NEW.id, 'review', OLD.review_status, NEW.review_status,
            coalesce(NEW.reviewed_by::text, 'unknown'),
            jsonb_build_object('notes', NEW.review_notes));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_staging_review_audit ON public.ingestion_staging;
CREATE TRIGGER trg_staging_review_audit
AFTER UPDATE OF review_status ON public.ingestion_staging
FOR EACH ROW EXECUTE FUNCTION public.audit_staging_review_change();
