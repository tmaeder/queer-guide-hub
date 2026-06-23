-- Belt-and-suspenders HTML-entity / tag sanitizer for news_articles (2026-06-23)
--
-- Some articles render literal entities/tags as visible text — titles like
-- `Kristi Noem &#038; where…`, bylines like `Jane &amp; John`, encoded `&lt;p&gt;`.
-- The ingestion sanitizer only cleaned title+content (never excerpt/author), the
-- author trigger never decoded entities, and translation carried entities into
-- title_i18n. This adds a deterministic BEFORE trigger so NO write path (ingestion,
-- translation, admin edit, legacy re-commit) can land an entity/tag in title or
-- excerpt, and extends the author trigger the same way.
--
-- Idempotent: safe to re-apply.

-- Decode the common numeric (decimal + hex) and named HTML entities, then strip
-- any remaining real tags. Pure + IMMUTABLE so it is safe inside row triggers.
-- Multi-pass (max 3) to resolve double-encoding (&amp;#038; → &#038; → &).
CREATE OR REPLACE FUNCTION public.news_decode_entities(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  s     text := p;
  prev  text;
  m     text[];
  n     int;
BEGIN
  IF s IS NULL OR s = '' THEN
    RETURN s;
  END IF;

  FOR pass IN 1..3 LOOP
    prev := s;

    -- Hex numeric refs: &#x1F4A9;
    FOR m IN SELECT regexp_matches(s, '&#[xX]([0-9a-fA-F]+);', 'g') LOOP
      n := ('x' || lpad(m[1], 8, '0'))::bit(32)::int;
      IF n > 0 AND n < 1114112 THEN
        s := replace(s, '&#x' || m[1] || ';', chr(n));
        s := replace(s, '&#X' || m[1] || ';', chr(n));
      END IF;
    END LOOP;

    -- Decimal numeric refs: &#038; &#8217;
    FOR m IN SELECT regexp_matches(s, '&#([0-9]+);', 'g') LOOP
      n := m[1]::int;
      IF n > 0 AND n < 1114112 THEN
        s := replace(s, '&#' || m[1] || ';', chr(n));
      END IF;
    END LOOP;

    -- Named refs (high-frequency set seen in scraped feeds).
    s := replace(s, '&amp;',   '&');
    s := replace(s, '&lt;',    '<');
    s := replace(s, '&gt;',    '>');
    s := replace(s, '&quot;',  '"');
    s := replace(s, '&apos;',  '''');
    s := replace(s, '&#39;',   '''');
    s := replace(s, '&nbsp;',  ' ');
    s := replace(s, '&ndash;', '–');
    s := replace(s, '&mdash;', '—');
    s := replace(s, '&hellip;','…');
    s := replace(s, '&rsquo;', '’');
    s := replace(s, '&lsquo;', '‘');
    s := replace(s, '&rdquo;', '”');
    s := replace(s, '&ldquo;', '“');
    s := replace(s, '&laquo;', '«');
    s := replace(s, '&raquo;', '»');
    s := replace(s, '&copy;',  '©');
    s := replace(s, '&reg;',   '®');
    s := replace(s, '&trade;', '™');
    s := replace(s, '&deg;',   '°');
    s := replace(s, '&euro;',  '€');
    s := replace(s, '&pound;', '£');

    EXIT WHEN s = prev;
  END LOOP;

  -- Strip HTML comments (`<!-- SC_OFF -->`), then any UNTERMINATED comment tail
  -- (`<!-- SC_OF` with no close) — neither is caught by the tag rule below.
  s := regexp_replace(s, '<!--.*?-->', '', 'g');
  s := regexp_replace(s, '<!--.*$', '', 'g');
  -- Strip any remaining real HTML tags (require a letter or / after `<` so that
  -- prose like "a < b" is left untouched).
  s := regexp_replace(s, '</?[a-zA-Z][^>]*>', '', 'g');
  -- Strip an UNTERMINATED tag at the end (truncated RSS feeds leave a dangling
  -- `<a href="…google-blob` with no closing `>`). Same letter-after-`<` guard.
  s := regexp_replace(s, '</?[a-zA-Z][^>]*$', '', 'g');
  -- Remove any leftover numeric entity ref (complete ones were decoded above; a
  -- survivor is truncated like `&#82` or out-of-range — junk either way).
  s := regexp_replace(s, '&#[xX]?[0-9a-fA-F]+;?', '', 'g');
  s := replace(s, chr(160), ' ');
  s := regexp_replace(s, '[ \t]{2,}', ' ', 'g');

  RETURN btrim(s);
END;
$$;

COMMENT ON FUNCTION public.news_decode_entities(text) IS
  'Decode common numeric/named HTML entities + strip real tags. IMMUTABLE; used by news_articles BEFORE triggers and the resanitize backfill.';

-- BEFORE trigger: clean title + excerpt on every insert/update.
-- Named `news_articles_decode_entities` so it fires (alphabetically) before
-- trg_news_articles_slug / trg_set_publisher_name → slug + publisher derive from
-- the decoded title.
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS news_articles_decode_entities ON public.news_articles;
CREATE TRIGGER news_articles_decode_entities
  BEFORE INSERT OR UPDATE OF title, excerpt
  ON public.news_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.decode_news_entities_trigger();

-- Extend the existing author trigger to decode entities (it already strips junk
-- bylines but left `&amp;` etc. intact). Recreated in full so the new behaviour
-- is self-contained.
CREATE OR REPLACE FUNCTION public.sanitize_news_author()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.author IS NOT NULL THEN
    NEW.author := public.news_decode_entities(NEW.author);
    IF NEW.author ~ ';'
       OR NEW.author ILIKE '/u/%'
       OR NEW.author ILIKE '/r/%'
       OR NEW.author ~ '^/[a-z0-9_-]+$'
       OR lower(btrim(NEW.author)) IN ('none','null','undefined','unknown')
       OR btrim(NEW.author) = '' THEN
      NEW.author := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
