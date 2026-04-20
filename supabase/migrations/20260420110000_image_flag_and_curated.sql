-- Image-audit hardening: allow admins to flag wrong hero images and set
-- manual curated overrides for cities and countries.
--
-- Downstream usage:
--   * resolveEntityImage() prefers curated_image_url over image_url.
--   * fetch-*-images edge functions treat image_flagged=true as
--     forceUpdate=true and re-fetch with the hardened scorer.
--   * flag-image edge function sets image_flagged=true + nulls image_url.

ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS image_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS curated_image_url text;

ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS image_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS curated_image_url text;

CREATE INDEX IF NOT EXISTS cities_image_flagged_idx
  ON public.cities (image_flagged)
  WHERE image_flagged = true;

CREATE INDEX IF NOT EXISTS countries_image_flagged_idx
  ON public.countries (image_flagged)
  WHERE image_flagged = true;

COMMENT ON COLUMN public.cities.image_flagged IS
  'Admin flag: image_url is wrong. Treated as forceUpdate by fetch-city-images.';
COMMENT ON COLUMN public.cities.curated_image_url IS
  'Manual override. Wins over image_url in resolveEntityImage().';
COMMENT ON COLUMN public.countries.image_flagged IS
  'Admin flag: image_url is wrong. Treated as forceUpdate by fetch-country-images.';
COMMENT ON COLUMN public.countries.curated_image_url IS
  'Manual override. Wins over image_url in resolveEntityImage().';
