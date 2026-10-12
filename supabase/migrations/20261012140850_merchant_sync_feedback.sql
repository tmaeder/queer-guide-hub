-- Persisted merchant failures must reach the feedback inbox even when the
-- enclosing batch returns HTTP 200 or the source worker is terminated.
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.report_merchant_sync_feedback()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_fingerprint text := 'merchant-sync:' || NEW.id::text;
BEGIN
  IF NEW.last_sync_status LIKE 'error:%' THEN
    PERFORM public.upsert_api_error(v_fingerprint, jsonb_build_object(
      'title', '[merchant sync] ' || NEW.display_name,
      'description', NEW.last_sync_status,
      'message', NEW.last_sync_status,
      'service', 'marketplace', 'function_name', 'marketplace-sync-merchants',
      'route', '/admin/content/organizations?tab=merchants',
      'merchant_id', NEW.id, 'merchant_slug', NEW.slug,
      'shop_domain', NEW.shop_domain, 'provider', NEW.provider,
      'reported_at', COALESCE(NEW.last_sync_at, now())
    ), 'merchant-sync');
  ELSIF NEW.last_sync_status = 'ok' THEN
    UPDATE public.community_submissions
    SET feedback_status = 'done', resolution = 'fixed', resolved_at = now(),
        data = data || jsonb_build_object('recovery', jsonb_build_object(
          'verified_at', NEW.last_sync_at, 'items', NEW.last_sync_items))
    WHERE content_type = 'api_error' AND fingerprint = v_fingerprint
      AND feedback_status IS DISTINCT FROM 'done';
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Feedback availability must not roll back a successful merchant sync.
  RAISE WARNING 'Merchant sync feedback failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.report_merchant_sync_feedback() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS merchant_sync_feedback ON public.marketplace_merchants;
CREATE TRIGGER merchant_sync_feedback
AFTER INSERT OR UPDATE OF last_sync_status, last_sync_at ON public.marketplace_merchants
FOR EACH ROW EXECUTE FUNCTION private.report_merchant_sync_feedback();

-- Backfill current errors without changing any merchant's sync status.
SELECT public.upsert_api_error('merchant-sync:' || id::text, jsonb_build_object(
  'title', '[merchant sync] ' || display_name,
  'description', last_sync_status, 'message', last_sync_status,
  'service', 'marketplace', 'function_name', 'marketplace-sync-merchants',
  'route', '/admin/content/organizations?tab=merchants',
  'merchant_id', id, 'merchant_slug', slug, 'shop_domain', shop_domain,
  'provider', provider, 'reported_at', COALESCE(last_sync_at, now())
), 'merchant-sync') FROM public.marketplace_merchants
WHERE last_sync_status LIKE 'error:%';
