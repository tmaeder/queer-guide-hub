-- =============================================================================
-- DRAFT — DO NOT APPLY WITHOUT REVIEW
-- P0-2 server-side follow-up: per-locale CMS body for /help (and other
-- single-language CMS rows that show mixed-language content to non-DE
-- visitors).
--
-- Background: P0-2 (PR #774) fixed code-side German fallback defaults
-- in HelpHotlines.tsx and gated first paint on i18next ready. The
-- residual cause of mixed language on /help is the CMS row itself —
-- `cms_pages` stores a single body_html / body_json / title / subtitle,
-- and the help page reads them as-is regardless of active locale.
--
-- Two design options:
--   A) Add per-locale columns (body_html_en, body_html_de, ...).
--      Cheap, ugly, doesn't scale to N locales.
--   B) Sidecar table cms_pages_translations(page_id, locale, body_html,
--      body_json, title, subtitle). Clean, scales, requires a small
--      query refactor in useCMSPage and the admin editor.
--
-- This draft picks option (B). Sketch only — review before applying.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.cms_pages_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL
    REFERENCES public.cms_pages(id) ON DELETE CASCADE,
  locale text NOT NULL CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  title text,
  subtitle text,
  body_html text,
  body_json jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_cms_pages_translations_page_locale
  ON public.cms_pages_translations (page_id, locale);

-- Backfill: copy the existing single-language body into the row's
-- inferred source locale. Determined by reading the first character
-- of title (rough — review before running). For /help specifically,
-- inferred 'de' since the strings are German.
INSERT INTO public.cms_pages_translations (page_id, locale, title, subtitle, body_html, body_json)
SELECT
  id,
  CASE
    WHEN slug = 'help' THEN 'de'
    ELSE 'en'
  END AS locale,
  title,
  subtitle,
  body_html,
  body_json
FROM public.cms_pages
ON CONFLICT (page_id, locale) DO NOTHING;

-- View that always returns the row matching the current locale, falling
-- back to source-language. Frontend useCMSPage hook will be updated to
-- pass locale and read from this view.
CREATE OR REPLACE VIEW public.cms_pages_localized AS
SELECT
  p.id,
  p.slug,
  COALESCE(t.title, p.title) AS title,
  COALESCE(t.subtitle, p.subtitle) AS subtitle,
  COALESCE(t.body_html, p.body_html) AS body_html,
  COALESCE(t.body_json, p.body_json) AS body_json,
  COALESCE(t.locale, 'en') AS locale,
  p.updated_at
FROM public.cms_pages p
LEFT JOIN public.cms_pages_translations t
  ON t.page_id = p.id
 AND t.locale = current_setting('queer_guide.locale', true);

GRANT SELECT ON public.cms_pages_localized TO anon, authenticated;

COMMIT;

-- Frontend follow-up (separate PR after this lands):
--   1. useCMSPage(slug) sets `current_setting('queer_guide.locale', ...)`
--      via a SET LOCAL before SELECT, or reads via RPC that takes
--      p_locale.
--   2. Admin CMS editor exposes per-locale tabs.
--   3. `/help` Playwright spec asserts EN session shows only EN body.
