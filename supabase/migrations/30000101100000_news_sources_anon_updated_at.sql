-- sitemap-podcasts.xml served 0 URLs because `updated_at` was not granted.
--
-- 22000101100200 replaced anon's table-wide SELECT on news_sources with a
-- 13-column allowlist. That closed a real leak (last_error, reliability_score,
-- auto_paused_reason, consecutive_failures, auto_publish were all anon-readable
-- through `select=*`), and every reader in src/ was converted in the same
-- commit.
--
-- WHAT WAS MISSED IS THE CLASS WORTH REMEMBERING: the Pages Functions are also
-- readers. `functions/_lib/sitemap.ts` PREFERS the service-role key and FALLS
-- BACK to anon, and in production it is running on anon — so
-- sitemap-podcasts.xml's `select=slug,updated_at` drew
-- `42501 permission denied for table news_sources` and the generator emitted an
-- empty urlset. HTTP 200, well-formed XML, zero <loc>. Measured on prod:
-- `select=slug` 200, `select=slug,updated_at` 401.
--
-- Note the failure shape. PostgREST answers a missing COLUMN privilege with
-- `permission denied for table …`, naming the table and never the column, and
-- the sitemap's own output is a valid document — so nothing about the symptom
-- points at the grant. When narrowing a grant, enumerate the readers in
-- functions/ and workers/ as well as src/.
--
-- `updated_at` carries no operational signal: it is a row mtime, it is already
-- implied by every other sitemap we publish, and `lastmod` is the reason the
-- crawler is being told anything at all. Adding it does not reopen the leak —
-- the nine operational columns stay revoked, and the postcondition below
-- re-asserts that rather than assuming it.

BEGIN;

GRANT SELECT (updated_at) ON public.news_sources TO anon;

DO $$
DECLARE v_leaked text[]; v_missing text[];
BEGIN
  -- The leak stays closed.
  SELECT array_agg(column_name ORDER BY column_name) INTO v_leaked
    FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND table_name = 'news_sources'
     AND grantee = 'anon' AND privilege_type = 'SELECT'
     AND column_name IN ('last_error','keywords','auto_paused_reason','reliability_score',
                         'consecutive_failures','auto_publish','backoff_until',
                         'consecutive_empty_fetches','avg_articles_per_fetch');
  IF v_leaked IS NOT NULL THEN
    RAISE EXCEPTION 'news_sources still exposes operational columns to anon: %', v_leaked;
  END IF;

  -- And every column the public surfaces actually select is reachable. Listed
  -- explicitly so a future narrowing has to confront this set.
  SELECT array_agg(c ORDER BY c) INTO v_missing
    FROM unnest(ARRAY['id','name','slug','description','url','website_url','category',
                      'feed_type','artwork_url','is_active','is_aggregator',
                      'organization_id','episode_count','updated_at']) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.column_privileges
      WHERE table_schema = 'public' AND table_name = 'news_sources'
        AND grantee = 'anon' AND privilege_type = 'SELECT' AND column_name = c);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'news_sources: anon cannot read columns the public surfaces select: %', v_missing;
  END IF;
END $$;

COMMIT;
