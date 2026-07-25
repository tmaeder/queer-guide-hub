-- DAM visual similarity: nearest active image_assets by perceptual-hash Hamming
-- distance. Reuses the existing immutable public.hamming_hex(text,text) helper
-- (20260530171000). SECURITY INVOKER so the caller's RLS naturally hides
-- partner/internal-tier assets they can't see. Returns nothing until phash is
-- populated (see the image-phash-backfill engine + cron below).

CREATE OR REPLACE FUNCTION public.find_similar_images(
  p_asset_id uuid,
  p_max_distance int DEFAULT 8,
  p_limit int DEFAULT 24
)
RETURNS TABLE (id uuid, url text, optimized_url text, thumbnail_url text, phash text, distance int)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH src AS (SELECT phash FROM public.image_assets WHERE id = p_asset_id)
  SELECT a.id, a.url, a.optimized_url, a.thumbnail_url, a.phash,
         public.hamming_hex(a.phash, s.phash) AS distance
  FROM public.image_assets a, src s
  WHERE s.phash IS NOT NULL
    AND a.phash IS NOT NULL
    AND a.id <> p_asset_id
    AND a.status = 'active'
    AND length(a.phash) = length(s.phash)
    AND public.hamming_hex(a.phash, s.phash) <= p_max_distance
  ORDER BY distance ASC, a.id
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

REVOKE ALL ON FUNCTION public.find_similar_images(uuid,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_similar_images(uuid,int,int) TO authenticated;

-- Partial index keeps the not-null scan cheap while phash is sparse.
CREATE INDEX IF NOT EXISTS image_assets_phash_notnull_idx
  ON public.image_assets (phash) WHERE phash IS NOT NULL;

-- Hourly, capped phash backfill (no AI cost — pure image decode + average hash).
-- Two-header convention: anon bearer to pass the gateway + internal-secret to
-- pass the function's requireInternalOrAdmin gate.
select cron.schedule('image_phash_backfill', '30 * * * *', $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/image-phash-backfill',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"limit":60}'::jsonb,
    timeout_milliseconds := 55000
  );
$cron$);
