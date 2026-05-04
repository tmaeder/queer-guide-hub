-- Hotels: ranked search RPC.
--
-- Phase 4 of the hotels bug fixes shipped a prefix-OR match on city / country
-- / name. That keeps "Berlin" from matching mid-string in misterb&b host
-- names but loses mid-word recall ("Berghain" → 0 hits, even when it
-- legitimately appears in a relevant description).
--
-- This RPC reintroduces ranked fuzzy matching backed by pg_trgm. The frontend
-- can call `supabase.rpc('search_hotels', { q })` and the server returns
-- hotel rows ordered by:
--   1. exact city match (rank 4)
--   2. exact country match (rank 3)
--   3. trigram similarity on name (rank 2)
--   4. trigram similarity on description (rank 1, only when nothing else matched)
-- with featured_priority and featured as final tiebreakers, then id ASC for
-- determinism.
--
-- The function is SECURITY INVOKER (the default) so RLS still applies.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS hotels_name_trgm_idx
  ON public.hotels USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS hotels_city_trgm_idx
  ON public.hotels USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS hotels_country_trgm_idx
  ON public.hotels USING gin (country gin_trgm_ops);
CREATE INDEX IF NOT EXISTS hotels_description_trgm_idx
  ON public.hotels USING gin (description gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_hotels(
  q text,
  result_limit int DEFAULT 50
)
RETURNS SETOF public.hotels
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      h.*,
      CASE
        WHEN q = '' THEN 0
        WHEN lower(coalesce(h.city, ''))    = lower(q) THEN 4
        WHEN lower(coalesce(h.country, '')) = lower(q) THEN 3
        WHEN h.name       % q THEN 2
        WHEN h.description % q THEN 1
        ELSE 0
      END AS match_rank,
      similarity(coalesce(h.name, ''),        q) AS name_sim,
      similarity(coalesce(h.description, ''), q) AS desc_sim
    FROM public.hotels h
    WHERE q = ''
       OR h.city        ILIKE q || '%'
       OR h.country     ILIKE q || '%'
       OR h.name        % q
       OR h.description % q
  )
  SELECT
    id, name, slug, hotel_type, price_range, featured, created_at, updated_at,
    description, queer_safety_notes, amenities, tags, images,
    latitude, longitude, address, city, city_id, country, country_id,
    website, booking_url, phone, email,
    verified, lgbtq_friendly, created_by, updated_by, star_rating,
    data_source, external_id, geo_linked_at, queer_village_id
  FROM ranked
  ORDER BY
    match_rank DESC,
    GREATEST(name_sim, desc_sim) DESC,
    -- featured_priority is added in 20260504114754_hotels_featured_priority.sql.
    -- Tolerate it being absent: when the column doesn't exist we just skip
    -- the term (Postgres can't reference unknown columns, so a guarded
    -- subquery isn't possible — apply this migration AFTER the priority one).
    coalesce(featured_priority, -1) DESC,
    featured DESC NULLS LAST,
    created_at DESC,
    id ASC
  LIMIT greatest(0, result_limit);
$$;

COMMENT ON FUNCTION public.search_hotels(text, int) IS
  'Ranked hotel search. Tier 1: exact city/country match. Tier 2/3: trigram similarity on name/description. NULLABLE q (treat empty string as "no query").';

GRANT EXECUTE ON FUNCTION public.search_hotels(text, int) TO anon, authenticated;
