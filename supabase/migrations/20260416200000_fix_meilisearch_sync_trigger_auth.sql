-- Fix notify_meilisearch_sync trigger: add Authorization header so Supabase
-- gateway lets the request through. The anon key satisfies the gateway;
-- the x-webhook-secret header satisfies the function's own auth check.
-- Previously the trigger had no auth headers, causing 401 at the gateway level.

CREATE OR REPLACE FUNCTION notify_meilisearch_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _type text;
  _id uuid;
  _action text;
BEGIN
  _type := CASE TG_TABLE_NAME
    WHEN 'venues' THEN 'venues'
    WHEN 'events' THEN 'events'
    WHEN 'cities' THEN 'cities'
    WHEN 'countries' THEN 'countries'
    WHEN 'news_articles' THEN 'news'
    WHEN 'marketplace_listings' THEN 'marketplace'
    WHEN 'personalities' THEN 'personalities'
    WHEN 'unified_tags' THEN 'tags'
    WHEN 'queer_villages' THEN 'queer_villages'
    ELSE TG_TABLE_NAME
  END;

  IF TG_OP = 'DELETE' THEN
    _id := OLD.id;
    _action := 'delete';
  ELSE
    _id := NEW.id;
    _action := 'upsert';
  END IF;

  PERFORM net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/meilisearch-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8", "x-webhook-secret": "meilisearch-sync-webhook-2026"}'::jsonb,
    body := jsonb_build_object(
      'action', _action,
      'type', _type,
      'id', _id::text
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
