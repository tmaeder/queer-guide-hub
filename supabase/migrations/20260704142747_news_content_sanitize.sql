-- News CONTENT/EXCERPT sanitize hardening (2026-07-04)
--
-- Follow-up to 20260623063400 (title/excerpt/author entity decode). The article
-- BODY was still broken in two ways the user could see:
--   1. "ONLY AVAILABLE IN PAID PLANS" (and other paywall markers) stored as the
--      entire content — a scraper placeholder committed verbatim.
--   2. Bracket-stripped HTML markup left as visible text: the RSS `cleanText`
--      used to strip only `<`/`>` (and `&lt;`/`&gt;`), leaving tag guts
--      (`figure class="…"`, `pThe headline/p`) fused into the prose. Root cause
--      fixed in source-rss-news/rss-parse.ts (whole-tag state-machine strip);
--      this migration adds the DB-side guarantees + cleanup helpers.
--
-- Idempotent.

-- Strip paywall + link-widget junk phrases; returns NULL when nothing is left.
CREATE OR REPLACE FUNCTION public.news_strip_junk(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT nullif(btrim(regexp_replace(coalesce(p, ''),
    '(?i)(only available in paid plans|this (article|content) is for subscribers only|'
    || 'subscribe to (read|continue)[^.\n]*|nur für abonnenten|réservé aux abonnés|'
    || 'solo para suscriptores|solo per abbonati|\(opens? in (a )?new (window|tab)\))',
    ' ', 'g')), '');
$$;

-- Detect content/excerpt corrupted by the old bracket-stripping sanitizer
-- (tag guts / attributes / glued tag tokens left as text). Used by the one-time
-- backfill to NULL irrecoverable fields — NOT used at write time, so a false
-- positive never costs live data during ingestion.
CREATE OR REPLACE FUNCTION public.news_is_corrupted_markup(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p IS NOT NULL AND (
       p ~ 'class="'
    OR p ~ 'wp-block'
    OR p ~ 'decoding='
    OR p ~ 'srcset='
    OR p ~ 'fetchpriority'
    OR p ~ 'sizes="'
    OR p ~ 'loading="lazy"'
    OR p ~ '="https?://'
    OR p ~ '!\[CDATA\['
    OR p ~ '\?xml'
    OR p ~ '/(p|figure|figcaption|div|em|strong|span|li|ul|ol|blockquote|table|tr|td|img|h[1-6])\M'  -- closing-tag residue
    OR p ~ '\m(figure|figcaption|iframe|img)\M'                                                       -- standalone tag token
    OR p ~ '\m(?:p|em|strong|span|div|figure|li|h[1-6])(?=[A-Z])'                                     -- glued opening residue
  );
$$;

-- Extend the BEFORE trigger to also sanitize content (+ junk-strip excerpt),
-- decoding entities, stripping real tags, removing paywall/widget junk, and
-- nulling fields that reduce to nothing. Title keeps plain entity-decode.
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
    NEW.excerpt := public.news_strip_junk(public.news_decode_entities(NEW.excerpt));
  END IF;
  IF NEW.content IS NOT NULL THEN
    NEW.content := public.news_strip_junk(public.news_decode_entities(NEW.content));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS news_articles_decode_entities ON public.news_articles;
CREATE TRIGGER news_articles_decode_entities
  BEFORE INSERT OR UPDATE OF title, excerpt, content
  ON public.news_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.decode_news_entities_trigger();
