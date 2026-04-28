-- Run in Supabase SQL editor after deploying the ingest worker.
-- Creates DB webhooks on each indexed table using pg_net + http.
--
-- Requires: set your ingest URL and token below.

DO $$
DECLARE
  v_url  text := 'https://queer-guide-search-ingest.workers.dev/webhook';
  v_token text := current_setting('app.ingest_token', true);  -- set via: ALTER DATABASE postgres SET app.ingest_token = 'xxx';
  v_tables text[] := ARRAY[
    'venues','events','cities','countries','personalities',
    'news_articles','marketplace_listings','queer_villages','unified_tags'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS qg_ingest_webhook_%I ON public.%I', t, t);
    EXECUTE format($f$
      CREATE TRIGGER qg_ingest_webhook_%I
        AFTER INSERT OR UPDATE OR DELETE ON public.%I
        FOR EACH ROW
        EXECUTE FUNCTION supabase_functions.http_request(
          %L,                       -- url
          'POST',
          '{"Content-Type":"application/json","X-QG-Token":"%s"}',
          '{}',                     -- params
          '5000'                    -- timeout ms
        )
    $f$, t, t, v_url, v_token);
  END LOOP;
END $$;
