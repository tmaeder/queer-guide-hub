-- Add optimization tracking to image_assets
-- Allows tracking which images have been mirrored to our own storage
-- and which are served from reliable external CDNs.

ALTER TABLE public.image_assets
  ADD COLUMN IF NOT EXISTS optimization_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS optimized_url text,
  ADD COLUMN IF NOT EXISTS optimized_at timestamptz;

ALTER TABLE public.image_assets
  ADD CONSTRAINT image_assets_optimization_status_check
  CHECK (optimization_status IN ('pending', 'processing', 'optimized', 'cdn_optimized', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_image_assets_optimization_status
  ON public.image_assets (optimization_status);

INSERT INTO storage.buckets (id, name, public)
VALUES ('optimized-images', 'optimized-images', true)
ON CONFLICT (id) DO NOTHING;

-- THE TWO STORAGE POLICIES THIS FILE ORIGINALLY ENDED WITH NEVER RAN, and they
-- are removed rather than repaired so this file describes what actually
-- happened. Measured on prod 2026-09-14 before touching anything:
--
--   pg_policy on storage.objects named by this file .... 0 rows
--   optimization columns on image_assets ............... 3 of 3 present
--   storage.buckets row `optimized-images` ............. present, public=true
--   objects in that bucket ............................. 0
--
-- Statements 1-4 applied; 5 and 6 could not have. Both were written as
--
--   CREATE POLICY IF NOT EXISTS "Public read optimized images"
--     ON storage.objects FOR SELECT TO anon, authenticated
--     USING (bucket_id = 'optimized-images');
--
--   CREATE POLICY IF NOT EXISTS "Service upload optimized images"
--     ON storage.objects FOR INSERT TO service_role
--     USING (bucket_id = 'optimized-images')
--     WITH CHECK (bucket_id = 'optimized-images');
--
-- and CREATE POLICY HAS NO `IF NOT EXISTS` CLAUSE in any PostgreSQL version.
-- Verified against this project's own server, not inferred: the statement
-- raises 42601 `syntax error at or near "not"`, while the same statement
-- without the clause reaches name resolution (42P01). That parse error is why
-- the file could not be read by `db push` at all, and `db push` stops at the
-- first unparseable file and strands every migration queued behind it.
--
-- The second one had a second defect that a syntax fix would NOT have caught:
-- a FOR INSERT policy may carry only WITH CHECK, never USING. That form does
-- parse (so it is invisible to the SQL parse gate) and fails at execution.
--
-- Restoring them is deliberately NOT done here. It would make a rebuild from
-- migrations diverge from production, which is the one thing this corpus
-- exists to prevent. Nothing depends on them today: the bucket is public and
-- empty, and this platform mirrors images to R2 (img.queer.guide), not to
-- Supabase storage. If the bucket is ever used, add the policies in a NEW
-- migration where they can be reviewed on their own merits.
