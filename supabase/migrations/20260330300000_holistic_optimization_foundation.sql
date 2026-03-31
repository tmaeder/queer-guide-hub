-- ============================================================================
-- Holistic Optimization Foundation
-- Areas: 1 (Villages geo), 2 (Email ingestion links), 9 (Content warnings),
--        10 (Recurring events parent/child model)
-- ============================================================================

-- ── 1. Queer Villages: Add region_id for full geographic hierarchy ──────────

ALTER TABLE public.queer_villages
  ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES public.regions(id);

-- Backfill region_id from country → region relationship
UPDATE public.queer_villages qv
SET region_id = c.region_id
FROM public.countries c
WHERE qv.country_id = c.id
  AND qv.region_id IS NULL
  AND c.region_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_queer_villages_region_id
  ON public.queer_villages(region_id);

COMMENT ON COLUMN public.queer_villages.region_id IS
  'Geographic region, auto-filled from country.region_id via geo-link-content';

-- ── 2. Recurring Events: Parent/child model ─────────────────────────────────

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS parent_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS recurrence_rule JSONB DEFAULT NULL;

COMMENT ON COLUMN public.events.parent_event_id IS
  'For recurring event instances: references the series template event';

COMMENT ON COLUMN public.events.recurrence_rule IS
  'Structured recurrence rule: {freq, interval, byDay[], until, exceptions[]}';

CREATE INDEX IF NOT EXISTS idx_events_parent_event_id
  ON public.events(parent_event_id)
  WHERE parent_event_id IS NOT NULL;

-- Unique constraint: one instance per parent per start_date
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_parent_start_unique
  ON public.events(parent_event_id, start_date)
  WHERE parent_event_id IS NOT NULL;

-- ── 3. Email Ingestion: Link to ingestion sources ───────────────────────────

ALTER TABLE public.email_ingestions
  ADD COLUMN IF NOT EXISTS ingestion_source_id UUID REFERENCES public.ingestion_sources(id);

CREATE INDEX IF NOT EXISTS idx_email_ingestions_source_id
  ON public.email_ingestions(ingestion_source_id)
  WHERE ingestion_source_id IS NOT NULL;

-- Add optional mailbox address link to ingestion sources
ALTER TABLE public.ingestion_sources
  ADD COLUMN IF NOT EXISTS mailbox_address_id UUID REFERENCES public.mailbox_reserved_addresses(id);

COMMENT ON COLUMN public.ingestion_sources.mailbox_address_id IS
  'Links an ingestion source to a claimed mailbox address for email-based ingestion';

-- ── 4. Content Warnings: Public-facing sensitivity indicators ───────────────
-- (Separate from sensitivity_flags which are admin-side classification results)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'content_warnings') THEN
    ALTER TABLE public.venues ADD COLUMN content_warnings JSONB DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'content_warnings') THEN
    ALTER TABLE public.events ADD COLUMN content_warnings JSONB DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'news_articles' AND column_name = 'content_warnings') THEN
    ALTER TABLE public.news_articles ADD COLUMN content_warnings JSONB DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'marketplace_listings' AND column_name = 'content_warnings') THEN
    ALTER TABLE public.marketplace_listings ADD COLUMN content_warnings JSONB DEFAULT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.venues.content_warnings IS
  'Public-facing content warnings: {legal: bool, medical: bool, nsfw: bool, warnings: string[]}';
COMMENT ON COLUMN public.events.content_warnings IS
  'Public-facing content warnings: {legal: bool, medical: bool, nsfw: bool, warnings: string[]}';
COMMENT ON COLUMN public.news_articles.content_warnings IS
  'Public-facing content warnings: {legal: bool, medical: bool, nsfw: bool, warnings: string[]}';
COMMENT ON COLUMN public.marketplace_listings.content_warnings IS
  'Public-facing content warnings: {legal: bool, medical: bool, nsfw: bool, warnings: string[]}';

-- ── 5. Add lgbti_relevance_reason to content tables ─────────────────────────
-- (lgbti_relevance_score already added by 20260330100000)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'lgbti_relevance_reason') THEN
    ALTER TABLE public.venues ADD COLUMN lgbti_relevance_reason TEXT DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'lgbti_relevance_reason') THEN
    ALTER TABLE public.events ADD COLUMN lgbti_relevance_reason TEXT DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'news_articles' AND column_name = 'lgbti_relevance_reason') THEN
    ALTER TABLE public.news_articles ADD COLUMN lgbti_relevance_reason TEXT DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'personalities' AND column_name = 'lgbti_relevance_reason') THEN
    ALTER TABLE public.personalities ADD COLUMN lgbti_relevance_reason TEXT DEFAULT NULL;
  END IF;
END $$;
