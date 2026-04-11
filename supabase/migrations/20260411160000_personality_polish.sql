-- Personality directory polish:
--   1) Seed additional featured historical icons (~24 total for rail).
--   2) Cap scraper-inflated view_count at 1M (some adult performers sat at 60M+).
--   3) Add a generated name_initial char(1) column for the A-Z jump bar so that
--      accented names like "Alvaro" / "Ostlund" bucket into A/O instead of "#".

-- 1) Featured icons
UPDATE public.personalities
SET is_featured = true
WHERE id IN (
  '2e87418c-0037-4b99-a240-e0ba237f63ff', -- Alice Walker
  '1270ce64-0a3a-4045-b7f4-68c5ba4045e5', -- Bayard Rustin
  'eaff1915-514e-4b60-ade7-f8fbc1ee39b5', -- Billie Jean King
  '69755582-c086-422e-bae0-1a1df448deea', -- Chelsea Manning
  '292cc8b7-42de-4648-a2aa-d0b6285fbd93', -- Christine Jorgensen
  '395dce34-ceba-4f1f-bf4b-131472dcee4a', -- Hunter Schafer
  'b57052c8-a42e-4720-ac57-5be1d68f0fe5', -- Indya Moore
  '168d28dc-229c-434a-8488-fbbf8dbdebe3', -- Janelle Monae
  '49d6b4e5-8871-4209-bcfc-50b6a00973d2', -- Kate McKinnon
  'a1246f88-123b-4634-b433-4a99baf93a1b', -- Kim Petras
  'f67dc7fe-b8f9-4758-ae92-510f707125e5', -- Larry Kramer
  'b79c08c0-4544-490c-a8cf-545b7ad91a66', -- Magnus Hirschfeld
  'ad89f493-ed50-4520-a267-9858fcff5370'  -- Sam Smith
);

-- 2) Cap inflated view_count
UPDATE public.personalities
SET view_count = 1000000
WHERE view_count > 1000000;

-- 3) Immutable unaccent wrapper (plain unaccent is STABLE, not IMMUTABLE,
--    so it cannot be used directly in a generated column).
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, $1);
$$;

-- Generated column: uppercase first letter of the unaccented name.
ALTER TABLE public.personalities
  ADD COLUMN IF NOT EXISTS name_initial char(1)
  GENERATED ALWAYS AS (
    UPPER(LEFT(public.immutable_unaccent(COALESCE(name, '')), 1))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_personalities_name_initial_public
  ON public.personalities (name_initial)
  WHERE visibility = 'public';
