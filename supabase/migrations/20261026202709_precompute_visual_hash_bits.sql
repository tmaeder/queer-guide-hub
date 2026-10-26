-- Convert each image's hash once rather than invoking even the native helper
-- for every pair. This leaves headroom below the authenticated 8s timeout.
CREATE OR REPLACE FUNCTION api_private.find_visual_duplicates(
  p_hamming_threshold integer DEFAULT 8, p_limit integer DEFAULT 200
)
RETURNS TABLE (
  asset_a uuid, asset_b uuid, url_a text, url_b text,
  thumb_a text, thumb_b text, hamming_distance integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH hashed AS MATERIALIZED (
    SELECT id, url, thumbnail_url,
      ('x' || pg_catalog.lpad(phash, 16, '0'))::bit(64) AS bits
    FROM public.image_assets
    WHERE status = 'active' AND phash IS NOT NULL
  )
  SELECT a.id, b.id, a.url, b.url, a.thumbnail_url, b.thumbnail_url,
    pg_catalog.bit_count(a.bits # b.bits)::integer AS hamming_distance
  FROM hashed a JOIN hashed b ON a.id < b.id
  WHERE pg_catalog.bit_count(a.bits # b.bits) <= p_hamming_threshold
  ORDER BY hamming_distance, a.id, b.id
  LIMIT p_limit;
$$;
