-- ============================================================
-- Media-aware ingestion: extend community_submissions
-- ------------------------------------------------------------
-- Adds platform/permission/media columns to support multi-channel
-- ingestion (Telegram, TikTok, social URLs) with OCR, vision
-- summaries, transcripts, and safety/relevance scoring.
-- All columns are additive + nullable. Existing flows untouched.
-- ============================================================

ALTER TABLE public.community_submissions
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS sub_source_type TEXT,
  ADD COLUMN IF NOT EXISTS sensitivity_level TEXT DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS permission_level TEXT DEFAULT 'public_share',
  ADD COLUMN IF NOT EXISTS raw_text TEXT,
  ADD COLUMN IF NOT EXISTS raw_html TEXT,
  ADD COLUMN IF NOT EXISTS raw_json JSONB,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS media_urls TEXT[],
  ADD COLUMN IF NOT EXISTS media_storage_paths TEXT[],
  ADD COLUMN IF NOT EXISTS screenshot_paths TEXT[],
  ADD COLUMN IF NOT EXISTS ocr_text TEXT,
  ADD COLUMN IF NOT EXISTS vision_summary TEXT,
  ADD COLUMN IF NOT EXISTS transcript_text TEXT,
  ADD COLUMN IF NOT EXISTS media_processing_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS media_processing_errors JSONB,
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS queer_relevance_score NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS safety_flags JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS submitter_metadata JSONB;

-- Constraints (added defensively; idempotent via NOT VALID + dedup check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_submissions_sensitivity_level_chk'
  ) THEN
    ALTER TABLE public.community_submissions
      ADD CONSTRAINT community_submissions_sensitivity_level_chk
      CHECK (sensitivity_level IN ('public','semi_public','community','private'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_submissions_permission_level_chk'
  ) THEN
    ALTER TABLE public.community_submissions
      ADD CONSTRAINT community_submissions_permission_level_chk
      CHECK (permission_level IN ('public_share','submitter_consent','community_only','do_not_publish'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_submissions_media_processing_status_chk'
  ) THEN
    ALTER TABLE public.community_submissions
      ADD CONSTRAINT community_submissions_media_processing_status_chk
      CHECK (media_processing_status IN ('pending','processing','done','partial','failed','skipped','not_applicable'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_submissions_platform_chk'
  ) THEN
    ALTER TABLE public.community_submissions
      ADD CONSTRAINT community_submissions_platform_chk
      CHECK (platform IS NULL OR platform IN (
        'instagram','facebook','x','bluesky','telegram','whatsapp','tiktok',
        'fetlife','signal','email','manual','admin','flyer','web','other'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_submissions_sub_source_type_chk'
  ) THEN
    ALTER TABLE public.community_submissions
      ADD CONSTRAINT community_submissions_sub_source_type_chk
      CHECK (sub_source_type IS NULL OR sub_source_type IN (
        'api','webhook','manual','forwarded','upload','url_import','scrape','import'
      ));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_community_submissions_platform
  ON public.community_submissions(platform);

CREATE INDEX IF NOT EXISTS idx_community_submissions_media_status
  ON public.community_submissions(media_processing_status)
  WHERE media_processing_status IN ('pending','processing','partial','failed');

CREATE INDEX IF NOT EXISTS idx_community_submissions_relevance
  ON public.community_submissions(queer_relevance_score)
  WHERE queer_relevance_score IS NOT NULL;

COMMENT ON COLUMN public.community_submissions.platform IS
  'Origin channel: instagram|facebook|x|bluesky|telegram|whatsapp|tiktok|fetlife|signal|email|manual|admin|flyer|web|other';
COMMENT ON COLUMN public.community_submissions.sub_source_type IS
  'How content arrived: api|webhook|manual|forwarded|upload|url_import|scrape|import';
COMMENT ON COLUMN public.community_submissions.permission_level IS
  'Submitter consent for publishing: public_share (free to publish) | submitter_consent (asked first) | community_only (do not surface publicly) | do_not_publish';
COMMENT ON COLUMN public.community_submissions.media_urls IS
  'Origin URLs for media (CDN/source) — may expire; mirror to R2 via media_storage_paths.';
COMMENT ON COLUMN public.community_submissions.media_storage_paths IS
  'R2/Storage object keys for mirrored media (durable).';
COMMENT ON COLUMN public.community_submissions.ocr_text IS
  'Text extracted from images/screenshots via vision model.';
COMMENT ON COLUMN public.community_submissions.vision_summary IS
  'Short factual summary of visual content (2-3 sentences).';
COMMENT ON COLUMN public.community_submissions.transcript_text IS
  'Audio transcript for video submissions (Whisper).';
COMMENT ON COLUMN public.community_submissions.safety_flags IS
  'Array of {type, severity, reason}. Types: nsfw|legal|medical|extremist|hate|violence|privacy|outing.';
COMMENT ON COLUMN public.community_submissions.queer_relevance_score IS
  '0–1 score from safety-relevance node. < 0.6 forces human review.';
COMMENT ON COLUMN public.community_submissions.confidence_score IS
  '0–1 overall extraction confidence. < 0.6 forces human review.';
COMMENT ON COLUMN public.community_submissions.submitter_metadata IS
  'Channel-specific metadata: telegram chat_id, forward_origin, oembed payload, ip, user_agent. Never published.';
