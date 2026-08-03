-- News articles were rendering raw CSS and JS as body text — e.g.
-- /news/brighton-pride-saturday-highlights-… ended with Attitude's injected
-- `#att-unique-wrapper-2026 { all: initial !important; … }` stylesheet, and a dozen
-- Queerty/LGBTQ-Nation pieces carried the Shopify buy-button IIFE mid-article.
--
-- Root cause is in `_shared/news-quality/sanitize.ts`: `stripHtmlTags` is a state
-- machine that emits every character OUTSIDE a `<…>` tag, so `<style>`/`<script>`
-- lost their delimiters and kept their CONTENTS as visible prose. Fixed in code
-- (`stripRawTextElements` removes those elements whole; `stripCodeResidue` cleans
-- bodies whose tags are already gone).
--
-- This migration is the observability half. A denormalized flag rather than a live
-- regex over the view: `news_quality_scorecard` is polled every 60s by the admin
-- panel and a regex across 38k article bodies is ~190 MB of TOAST reads per poll on
-- a disk-constrained instance.

ALTER TABLE public.news_articles
  ADD COLUMN IF NOT EXISTS has_code_residue boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.news_articles.has_code_residue IS
  'Body still contains CSS/JS after sanitizing. Maintained by trigger; mirrors '
  'detectCodeResidue() in _shared/news-quality/code-residue.ts. Should be 0 — a '
  'non-zero count means a source is injecting markup the sanitizer cannot strip yet.';

-- Mirrors detectCodeResidue(). NOTE: Postgres caps regex repetition counts at 255,
-- so the bounded runs here are {0,250}, not the {0,400} the TypeScript uses.
CREATE OR REPLACE FUNCTION public.news_content_has_code_residue(p_content text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_content IS NOT NULL
     AND p_content LIKE '%{%'   -- cheap gate: every shape below lives in a brace block
     AND (
          p_content ~ '!important'
       OR p_content ~ '@media\s*(only\s+)?(screen|all|print|\()'
       OR p_content ~ '\{[^{}]{0,250}[A-Za-z-]{2,}\s*:\s*[^;{}]{1,200};[^{}]{0,250}\}'
       OR p_content ~ '(document\.(getElementById|querySelector|createElement|write)|window\.(location|dataLayer|ShopifyBuy)|googletag|adsbygoogle|GoogleAnalyticsObject)'
       OR p_content ~ 'function\s*\([^)]{0,120}\)\s*\{'
     );
$$;

-- BEFORE triggers fire in NAME order and `news_articles_decode_entities` rewrites
-- `content` — sort after it (`zzz_`) so we read the final body.
--
-- Deliberately NOT scoped `UPDATE OF content`: a column-scoped trigger fires on the
-- columns named in the UPDATE *statement*, not on what an earlier BEFORE trigger
-- mutated, so a `SET title = …` that decode_entities also rewrites content on would
-- silently skip it. The regex short-circuits on `LIKE '%{%'`, so this is cheap.
CREATE OR REPLACE FUNCTION public.news_articles_set_code_residue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.has_code_residue := public.news_content_has_code_residue(NEW.content);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS news_articles_zzz_code_residue ON public.news_articles;
CREATE TRIGGER news_articles_zzz_code_residue
  BEFORE INSERT OR UPDATE ON public.news_articles
  FOR EACH ROW EXECUTE FUNCTION public.news_articles_set_code_residue();

CREATE INDEX IF NOT EXISTS idx_news_articles_code_residue
  ON public.news_articles (id) WHERE has_code_residue;

-- Backfill. Scoped to the ~170 rows that contain a brace at all, so the
-- search_documents sync trigger fires on those and nothing else.
UPDATE public.news_articles
   SET has_code_residue = true
 WHERE content LIKE '%{%'
   AND public.news_content_has_code_residue(content)
   AND has_code_residue IS DISTINCT FROM true;

-- Surface it on the panel the news admin already renders.
CREATE OR REPLACE VIEW public.news_quality_scorecard AS
SELECT count(*) AS total_live,
    count(*) FILTER (WHERE COALESCE(array_length(country_ids, 1), 0) = 0) AS no_geo,
    count(*) FILTER (WHERE COALESCE(array_length(city_ids, 1), 0) = 0) AS no_city,
    count(*) FILTER (WHERE length(COALESCE(TRIM(BOTH FROM author), ''::text)) = 0) AS no_author,
    count(*) FILTER (WHERE length(COALESCE(content, ''::text)) < 200) AS thin_lt200,
    count(*) FILTER (WHERE length(COALESCE(content, ''::text)) < 500) AS thin_lt500,
    count(*) FILTER (WHERE COALESCE(TRIM(BOTH FROM image_url), ''::text) = ''::text) AS no_image,
    count(*) FILTER (WHERE COALESCE(array_length(tags, 1), 0) = 0) AS no_tags,
    count(*) FILTER (WHERE length(COALESCE(TRIM(BOTH FROM excerpt), ''::text)) = 0) AS no_excerpt,
    round(avg(quality_score), 1) AS avg_quality,
    round(avg(relevance_score), 3) AS avg_relevance,
    count(*) FILTER (WHERE quality_status = 'passed'::text) AS qstatus_passed,
    count(*) FILTER (WHERE quality_status = 'review'::text) AS qstatus_review,
    count(*) FILTER (WHERE quality_status = 'rejected'::text) AS qstatus_rejected,
    count(*) FILTER (WHERE quality_status IS NULL) AS qstatus_null,
    count(*) FILTER (WHERE corroboration_count >= 2) AS corroborated,
    count(*) FILTER (WHERE published_at > (now() - '30 days'::interval)) AS last_30d,
    count(*) FILTER (WHERE needs_attention) AS needs_attention,
    max(last_quality_run_at) AS last_run_at,
    count(*) FILTER (WHERE has_code_residue) AS code_residue
   FROM news_articles
  WHERE duplicate_of_id IS NULL;

GRANT SELECT ON public.news_quality_scorecard TO authenticated;
