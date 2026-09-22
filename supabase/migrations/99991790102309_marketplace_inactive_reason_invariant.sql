-- Every inactive listing must carry an explicit, reconstructible lifecycle
-- reason. A single failed link check is deliberately insufficient evidence for
-- link_broken_confirmed; the durable link checker still requires two checks.

CREATE OR REPLACE FUNCTION public.marketplace_require_inactive_reason()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public
AS $$
BEGIN
  IF NEW.status='inactive' AND NEW.archived_reason IS NULL THEN
    NEW.archived_reason := CASE
      WHEN NEW.deprecated_at IS NOT NULL THEN 'source_deprecated'
      WHEN NEW.link_health='broken' AND coalesce(NEW.link_broken_streak,0)>=2
        THEN 'link_broken_confirmed'
      WHEN coalesce(NEW.in_stock,true)=false
        OR NEW.availability IN('discontinued','unavailable') THEN 'source_unavailable'
      WHEN NEW.last_seen_at IS NOT NULL AND NEW.last_seen_at<now()-interval '30 days'
        THEN 'source_feed_stale'
      ELSE 'lifecycle_unspecified'
    END;
    NEW.archived_at := coalesce(NEW.archived_at,now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_require_inactive_reason_trg
  ON public.marketplace_listings;
CREATE TRIGGER marketplace_require_inactive_reason_trg
BEFORE INSERT OR UPDATE OF status,archived_reason,deprecated_at,link_health,
  link_broken_streak,in_stock,availability,last_seen_at
ON public.marketplace_listings
FOR EACH ROW EXECUTE FUNCTION public.marketplace_require_inactive_reason();

UPDATE public.marketplace_listings
SET archived_reason=CASE
    WHEN deprecated_at IS NOT NULL THEN 'source_deprecated'
    WHEN link_health='broken' AND coalesce(link_broken_streak,0)>=2
      THEN 'link_broken_confirmed'
    WHEN coalesce(in_stock,true)=false OR availability IN('discontinued','unavailable')
      THEN 'source_unavailable'
    WHEN last_seen_at IS NOT NULL AND last_seen_at<now()-interval '30 days'
      THEN 'source_feed_stale'
    ELSE 'lifecycle_unspecified'
  END,
  archived_at=coalesce(archived_at,updated_at,now())
WHERE status='inactive' AND archived_reason IS NULL;

SELECT public.run_marketplace_quality_snapshot();
