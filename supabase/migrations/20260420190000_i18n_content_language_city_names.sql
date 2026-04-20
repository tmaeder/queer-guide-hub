-- i18n follow-up: content-language signalling + localized city names.
--
-- Goal:
--   1. Let events/venues carry the language their content was authored in
--      so the frontend can badge mixed-locale cards deterministically
--      (instead of the heuristic client detector).
--   2. Give cities localized names (name_en / name_de) so the UI can render
--      "Zürich" on /de and "Zurich" on /en without a hardcoded dictionary.
--
-- This migration is purely additive: columns are nullable, no existing row
-- is modified beyond a small backfill for the handful of high-traffic DACH
-- cities whose English/German spellings most often diverge.
--
-- Follow-ups (NOT in this migration):
--   - Scraper/pipeline should set content_language at ingest time based on
--     source-feed locale.
--   - Curated seed of ~200 localized city names sourced from Wikidata.

BEGIN;

-- 1. events.content_language ------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS content_language TEXT;

COMMENT ON COLUMN public.events.content_language IS
  'ISO 639-1 code of the language the human-authored fields (title, description) are written in. Set by the scraper/pipeline or admin. NULL means unknown — UI falls back to client-side detection.';

CREATE INDEX IF NOT EXISTS idx_events_content_language
  ON public.events (content_language)
  WHERE content_language IS NOT NULL;

-- 2. venues.content_language ------------------------------------------------
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS content_language TEXT;

COMMENT ON COLUMN public.venues.content_language IS
  'ISO 639-1 code of the language the venue description is written in.';

CREATE INDEX IF NOT EXISTS idx_venues_content_language
  ON public.venues (content_language)
  WHERE content_language IS NOT NULL;

-- 3. cities.name_en / cities.name_de ---------------------------------------
ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS name_de TEXT;

COMMENT ON COLUMN public.cities.name_en IS
  'Canonical English spelling (e.g. "Zurich", "Munich"). NULL means not curated — frontend falls back to cities.name.';
COMMENT ON COLUMN public.cities.name_de IS
  'Canonical German spelling (e.g. "Zürich", "München"). NULL means not curated.';

-- Backfill curated DACH spellings. Matches the seed list on the frontend
-- (src/utils/cityDisplay.ts) so we can drop the hardcoded dictionary once
-- scraper coverage is broader.
UPDATE public.cities AS c
   SET name_en = COALESCE(c.name_en, v.en),
       name_de = COALESCE(c.name_de, v.de)
  FROM (VALUES
    ('Zurich',    'Zurich',  'Zürich'),
    ('Zürich',    'Zurich',  'Zürich'),
    ('Munich',    'Munich',  'München'),
    ('München',   'Munich',  'München'),
    ('Cologne',   'Cologne', 'Köln'),
    ('Köln',      'Cologne', 'Köln'),
    ('Vienna',    'Vienna',  'Wien'),
    ('Wien',      'Vienna',  'Wien'),
    ('Geneva',    'Geneva',  'Genf'),
    ('Genf',      'Geneva',  'Genf'),
    ('Prague',    'Prague',  'Prag'),
    ('Prag',      'Prague',  'Prag'),
    ('Moscow',    'Moscow',  'Moskau'),
    ('Moskau',    'Moscow',  'Moskau')
  ) AS v(match_name, en, de)
 WHERE lower(c.name) = lower(v.match_name);

COMMIT;
