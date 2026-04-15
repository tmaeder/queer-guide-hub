-- Wave 3 — News fingerprint hardening
-- Existing news_compute_fingerprint returns NULL when title<8 chars or source_id missing,
-- which lets short-titled and source-less rows bypass the unique fingerprint index.
-- Replace with a synthetic fallback so EVERY committed news article has a non-null
-- fingerprint that participates in dedup.

BEGIN;

-- Hardened fingerprint: never returns NULL when called with non-null inputs.
CREATE OR REPLACE FUNCTION public.news_compute_fingerprint(
  p_title text,
  p_published_at timestamptz,
  p_source_id uuid,
  p_url text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_title_norm text;
  v_day text;
  v_url_norm text;
  v_source text;
BEGIN
  v_title_norm := lower(regexp_replace(coalesce(p_title, ''), '[^a-z0-9]+', '', 'gi'));
  v_day        := to_char(coalesce(p_published_at, now()), 'YYYY-MM-DD');
  v_url_norm   := lower(regexp_replace(coalesce(p_url, ''), '[#?].*$', ''));
  v_source     := coalesce(p_source_id::text, 'no-source');

  -- Primary: source + title + day. Title-poor articles fall through to URL-day
  -- or content-source synthetic so we never return NULL.
  IF length(v_title_norm) >= 8 AND p_source_id IS NOT NULL THEN
    RETURN encode(digest(v_source || ':' || v_title_norm || ':' || v_day, 'sha256'), 'hex');
  ELSIF length(v_url_norm) > 0 THEN
    RETURN encode(digest(v_source || ':url:' || v_url_norm || ':' || v_day, 'sha256'), 'hex');
  ELSIF length(v_title_norm) > 0 THEN
    RETURN encode(digest(v_source || ':short:' || v_title_norm || ':' || v_day, 'sha256'), 'hex');
  ELSE
    -- Worst case: stamp by source+day (caller will see collisions and can disambiguate).
    RETURN encode(digest(v_source || ':none:' || v_day, 'sha256'), 'hex');
  END IF;
END;
$$;

-- Backfill any NULL fingerprints on existing news_articles
UPDATE public.news_articles
   SET fingerprint = public.news_compute_fingerprint(title, published_at, source_id, url)
 WHERE fingerprint IS NULL;

-- Now enforce NOT NULL
ALTER TABLE public.news_articles
  ALTER COLUMN fingerprint SET NOT NULL;

-- Strong unique index (idempotent commit relies on this)
DROP INDEX IF EXISTS news_articles_fingerprint_idx;
CREATE UNIQUE INDEX IF NOT EXISTS ux_news_articles_fingerprint
  ON public.news_articles(fingerprint);

COMMIT;
