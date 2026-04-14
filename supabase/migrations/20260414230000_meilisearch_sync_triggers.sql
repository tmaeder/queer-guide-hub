-- Meilisearch incremental sync triggers
-- Uses pg_net to call meilisearch-sync edge function on INSERT/UPDATE/DELETE

-- Trigger function: sends upsert/delete to meilisearch-sync edge function
CREATE OR REPLACE FUNCTION notify_meilisearch_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _supabase_url text := current_setting('app.settings.supabase_url', true);
  _service_key text := current_setting('app.settings.service_role_key', true);
  _webhook_secret text := current_setting('app.settings.webhook_secret', true);
  _type text;
  _id uuid;
  _action text;
BEGIN
  -- Map table name to Meilisearch index type
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

  -- Fire-and-forget HTTP call via pg_net
  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/meilisearch-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', _webhook_secret
    ),
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

-- Create triggers for each searchable table
DO $$
DECLARE
  _tables text[] := ARRAY[
    'venues', 'events', 'cities', 'countries',
    'news_articles', 'marketplace_listings', 'personalities',
    'unified_tags', 'queer_villages'
  ];
  _t text;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_meilisearch_sync ON %I',
      _t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_meilisearch_sync
       AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW
       EXECUTE FUNCTION notify_meilisearch_sync()',
      _t
    );
  END LOOP;
END;
$$;
