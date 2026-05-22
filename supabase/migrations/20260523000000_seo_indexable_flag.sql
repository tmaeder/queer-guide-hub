-- SEO remediation: per-row indexability gate.
--
-- Adds seo_indexable boolean (default true) to every entity that has a public
-- detail page indexed by sitemaps. The flag is the single source of truth for
-- sitemap inclusion and middleware robots-tag emission. Defaults to true so
-- existing rows continue to be indexable; backfills below flip specific rows
-- to false (news bulk-noindex per editorial decision, placeholder slugs).
--
-- See SEO-FIXES-PROGRESS.md for the broader phase-1 context.

ALTER TABLE public.venues          ADD COLUMN IF NOT EXISTS seo_indexable boolean NOT NULL DEFAULT true;
ALTER TABLE public.cities          ADD COLUMN IF NOT EXISTS seo_indexable boolean NOT NULL DEFAULT true;
ALTER TABLE public.countries       ADD COLUMN IF NOT EXISTS seo_indexable boolean NOT NULL DEFAULT true;
ALTER TABLE public.events          ADD COLUMN IF NOT EXISTS seo_indexable boolean NOT NULL DEFAULT true;
ALTER TABLE public.news_articles   ADD COLUMN IF NOT EXISTS seo_indexable boolean NOT NULL DEFAULT true;
ALTER TABLE public.personalities   ADD COLUMN IF NOT EXISTS seo_indexable boolean NOT NULL DEFAULT true;
ALTER TABLE public.hotels          ADD COLUMN IF NOT EXISTS seo_indexable boolean NOT NULL DEFAULT true;
ALTER TABLE public.queer_villages  ADD COLUMN IF NOT EXISTS seo_indexable boolean NOT NULL DEFAULT true;
ALTER TABLE public.unified_tags    ADD COLUMN IF NOT EXISTS seo_indexable boolean NOT NULL DEFAULT true;

-- Partial indexes on the negative case (the much smaller set) so sitemap
-- generators can filter on `seo_indexable=eq.true` without a seq scan once
-- non-indexable rows accumulate.
CREATE INDEX IF NOT EXISTS venues_seo_noindex_idx          ON public.venues          (id) WHERE seo_indexable = false;
CREATE INDEX IF NOT EXISTS cities_seo_noindex_idx          ON public.cities          (id) WHERE seo_indexable = false;
CREATE INDEX IF NOT EXISTS countries_seo_noindex_idx       ON public.countries       (id) WHERE seo_indexable = false;
CREATE INDEX IF NOT EXISTS events_seo_noindex_idx          ON public.events          (id) WHERE seo_indexable = false;
CREATE INDEX IF NOT EXISTS news_articles_seo_noindex_idx   ON public.news_articles   (id) WHERE seo_indexable = false;
CREATE INDEX IF NOT EXISTS personalities_seo_noindex_idx   ON public.personalities   (id) WHERE seo_indexable = false;
CREATE INDEX IF NOT EXISTS hotels_seo_noindex_idx          ON public.hotels          (id) WHERE seo_indexable = false;
CREATE INDEX IF NOT EXISTS queer_villages_seo_noindex_idx  ON public.queer_villages  (id) WHERE seo_indexable = false;
CREATE INDEX IF NOT EXISTS unified_tags_seo_noindex_idx    ON public.unified_tags    (id) WHERE seo_indexable = false;

-- P1.2 — news section is removed (HTTP 410 from middleware). Belt-and-braces:
-- flip every existing news article to non-indexable so any code path that
-- bypasses the 410 still doesn't surface them in a sitemap.
UPDATE public.news_articles SET seo_indexable = false WHERE seo_indexable = true;

-- P1.4 — placeholder records ("untitled", "untitled-1", "untitled-2", …) get
-- flipped off. The DB CHECK constraint that prevents reintroduction is held
-- back until existing placeholders are cleaned up — see SEO-FIXES-PROGRESS.md
-- "deferred constraints" section for the trigger condition.
UPDATE public.venues
   SET seo_indexable = false
 WHERE seo_indexable = true
   AND (
        name        ~* '^untitled(-[0-9]+)?$'
     OR slug        ~* '^untitled(-[0-9]+)?$'
     OR name        IS NULL
     OR coalesce(trim(name), '') = ''
   );

UPDATE public.cities
   SET seo_indexable = false
 WHERE seo_indexable = true
   AND (
        name        ~* '^untitled(-[0-9]+)?$'
     OR slug        ~* '^untitled(-[0-9]+)?$'
     OR name        IS NULL
     OR coalesce(trim(name), '') = ''
   );

UPDATE public.events
   SET seo_indexable = false
 WHERE seo_indexable = true
   AND (
        title       ~* '^untitled(-[0-9]+)?$'
     OR slug        ~* '^untitled(-[0-9]+)?$'
     OR title       IS NULL
     OR coalesce(trim(title), '') = ''
     OR status      = 'cancelled'
   );

UPDATE public.personalities
   SET seo_indexable = false
 WHERE seo_indexable = true
   AND (
        name        ~* '^untitled(-[0-9]+)?$'
     OR slug        ~* '^untitled(-[0-9]+)?$'
     OR name        IS NULL
     OR coalesce(trim(name), '') = ''
   );

UPDATE public.hotels
   SET seo_indexable = false
 WHERE seo_indexable = true
   AND (
        name        ~* '^untitled(-[0-9]+)?$'
     OR slug        ~* '^untitled(-[0-9]+)?$'
     OR name        IS NULL
     OR coalesce(trim(name), '') = ''
   );

UPDATE public.queer_villages
   SET seo_indexable = false
 WHERE seo_indexable = true
   AND (
        name        ~* '^untitled(-[0-9]+)?$'
     OR slug        ~* '^untitled(-[0-9]+)?$'
     OR name        IS NULL
     OR coalesce(trim(name), '') = ''
   );

UPDATE public.unified_tags
   SET seo_indexable = false
 WHERE seo_indexable = true
   AND (
        name        ~* '^untitled(-[0-9]+)?$'
     OR slug        ~* '^untitled(-[0-9]+)?$'
     OR name        IS NULL
     OR coalesce(trim(name), '') = ''
   );

UPDATE public.countries
   SET seo_indexable = false
 WHERE seo_indexable = true
   AND (
        name        ~* '^untitled(-[0-9]+)?$'
     OR slug        ~* '^untitled(-[0-9]+)?$'
     OR name        IS NULL
     OR coalesce(trim(name), '') = ''
   );

COMMENT ON COLUMN public.venues.seo_indexable         IS 'False = excluded from sitemaps + middleware emits noindex robots tag. See functions/_lib/detail.ts (isRowIndexable).';
COMMENT ON COLUMN public.cities.seo_indexable         IS 'False = excluded from sitemaps + middleware emits noindex robots tag.';
COMMENT ON COLUMN public.countries.seo_indexable      IS 'False = excluded from sitemaps + middleware emits noindex robots tag.';
COMMENT ON COLUMN public.events.seo_indexable         IS 'False = excluded from sitemaps + middleware emits noindex robots tag.';
COMMENT ON COLUMN public.news_articles.seo_indexable  IS 'False for the whole table while /news/* is 410-Gone (P1.2). Flip back via per-row update if the section is re-enabled.';
COMMENT ON COLUMN public.personalities.seo_indexable  IS 'False = excluded from sitemaps + middleware emits noindex robots tag.';
COMMENT ON COLUMN public.hotels.seo_indexable         IS 'False = excluded from sitemaps + middleware emits noindex robots tag.';
COMMENT ON COLUMN public.queer_villages.seo_indexable IS 'False = excluded from sitemaps + middleware emits noindex robots tag.';
COMMENT ON COLUMN public.unified_tags.seo_indexable   IS 'False = excluded from sitemaps + middleware emits noindex robots tag.';
