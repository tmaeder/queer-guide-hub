-- Decode HTML entities in news_articles.image_url (2026-08-04)
--
-- 846 stored image_urls carry literal `&amp;` from RSS `<media:content>` /
-- `<enclosure>` attributes: `extractMediaUrl` in source-rss-news never called
-- decodeUrlEntities (its siblings extractItunesImage/extractAudioEnclosure do),
-- and the news_articles_decode_entities trigger only covered title + excerpt.
-- Browsers fetch the entity-mangled URL, the publisher returns a non-image
-- error page, and Chrome drops it via ORB (net::ERR_BLOCKED_BY_ORB) — every
-- affected card renders the fallback texture.
--
-- The parser is fixed alongside this migration; the trigger is the backstop
-- for every other write path. The one-time backfill of the 846 existing rows
-- runs as batched operator SQL (search_documents sync trigger fires per row —
-- keep batches <= 300), not in this migration.
--
-- NOTE: deliberately NOT reusing news_decode_entities() here — it is
-- text-oriented (strips tags, collapses whitespace, decodes typographic
-- entities into unicode) and would corrupt URLs. URLs need exactly the
-- ampersand forms, single pass so `&amp;#38;` cannot double-collapse.
--
-- Idempotent: safe to re-apply.

CREATE OR REPLACE FUNCTION public.news_decode_url_entities(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN p IS NULL OR p = '' THEN p
    ELSE regexp_replace(p, '&(amp|#0*38|#[xX]0*26);', '&', 'g')
  END;
$$;

COMMENT ON FUNCTION public.news_decode_url_entities(text) IS
  'Single-pass decode of &amp;/&#38;/&#x26; inside URL columns. URL-safe subset of news_decode_entities (which strips tags/whitespace and must not touch URLs).';

CREATE OR REPLACE FUNCTION public.decode_news_entities_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.title IS NOT NULL THEN
    NEW.title := public.news_decode_entities(NEW.title);
  END IF;
  IF NEW.excerpt IS NOT NULL THEN
    NEW.excerpt := public.news_decode_entities(NEW.excerpt);
  END IF;
  IF NEW.image_url IS NOT NULL THEN
    NEW.image_url := public.news_decode_url_entities(NEW.image_url);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS news_articles_decode_entities ON public.news_articles;
CREATE TRIGGER news_articles_decode_entities
  BEFORE INSERT OR UPDATE OF title, excerpt, image_url
  ON public.news_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.decode_news_entities_trigger();
