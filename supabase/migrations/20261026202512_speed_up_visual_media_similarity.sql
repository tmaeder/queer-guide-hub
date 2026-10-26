-- Visual Similarity compares every active hashed-image pair before LIMIT.
-- The interpreted per-bit loop exceeded the browser role's 8s statement timeout
-- with ~1,200 hashed images. Native XOR/popcount preserves the 64-bit distance.
-- Keep this invoker expression inlineable (no function-local SET configuration).
CREATE OR REPLACE FUNCTION public.phash_hamming(a text, b text)
RETURNS integer
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT pg_catalog.bit_count(
    ('x' || pg_catalog.lpad(a, 16, '0'))::bit(64)
    # ('x' || pg_catalog.lpad(b, 16, '0'))::bit(64)
  )::integer;
$$;
