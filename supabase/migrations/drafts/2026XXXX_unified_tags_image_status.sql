-- P2-5: Add image_status column to unified_tags for admin curation
-- DRAFT — requires human review before applying.
--
-- Enables admins to mark tag hero images as approved/rejected/pending.
-- The frontend `isRealTagImage()` heuristic can then also check this column.

-- Step 1: Add the column
ALTER TABLE public.unified_tags
  ADD COLUMN IF NOT EXISTS image_status text NOT NULL DEFAULT 'pending'
  CHECK (image_status IN ('pending', 'approved', 'rejected'));

-- Step 2: Auto-approve tags that already have a non-null, non-placeholder image
UPDATE public.unified_tags
SET image_status = 'approved'
WHERE image_url IS NOT NULL
  AND image_url != ''
  AND image_url NOT LIKE 'data:%'
  AND lower(image_url) NOT LIKE '%placeholder%'
  AND lower(image_url) NOT LIKE '%gradient%';

-- Step 3: Mark tags without images as N/A (keep 'pending' — semantically correct)
-- No action needed; 'pending' is the default.

-- Step 4: Index for filtering
CREATE INDEX IF NOT EXISTS idx_unified_tags_image_status
  ON public.unified_tags (image_status)
  WHERE image_url IS NOT NULL;

COMMENT ON COLUMN public.unified_tags.image_status IS
  'Admin curation status for tag hero image: pending (default), approved, rejected. '
  'Tags with rejected images should not display the image in public views.';
