-- Add death_city / death_country FK columns to personalities (mirror birth pattern)
-- so the detail page can render the country flag for the place of death.

ALTER TABLE public.personalities
  ADD COLUMN IF NOT EXISTS death_city_id    uuid REFERENCES public.cities(id),
  ADD COLUMN IF NOT EXISTS death_country_id uuid REFERENCES public.countries(id);

COMMENT ON COLUMN public.personalities.death_city_id IS
  'FK to cities table for place of death. Auto-matched from death_place text by match_personality_death_city trigger.';
COMMENT ON COLUMN public.personalities.death_country_id IS
  'FK to countries table for place of death. Auto-populated from death_city_id by match_personality_death_city trigger.';

CREATE INDEX IF NOT EXISTS idx_personalities_death_city_id
  ON public.personalities (death_city_id);
CREATE INDEX IF NOT EXISTS idx_personalities_death_country_id
  ON public.personalities (death_country_id);


-- Auto-match death_place to cities. Mirrors match_personality_city() in
-- 20260510140000_personality_city_match_trigger.sql.
CREATE OR REPLACE FUNCTION public.match_personality_death_city()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _city record;
BEGIN
  IF NEW.death_city_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.death_place IS NULL OR NEW.death_place = '' THEN RETURN NEW; END IF;

  SELECT c.id, c.country_id INTO _city
  FROM public.cities c
  WHERE c.duplicate_of_id IS NULL
    AND (
      c.name ILIKE NEW.death_place
      OR (NEW.death_place LIKE '% (%)' AND c.name ILIKE trim(split_part(NEW.death_place, '(', 1)))
    )
  ORDER BY c.population DESC NULLS LAST
  LIMIT 1;

  IF _city IS NOT NULL THEN
    NEW.death_city_id := _city.id;
    IF NEW.death_country_id IS NULL THEN
      NEW.death_country_id := _city.country_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_personality_death_city_match ON public.personalities;
CREATE TRIGGER trg_personality_death_city_match
  BEFORE INSERT OR UPDATE OF death_place
  ON public.personalities
  FOR EACH ROW
  EXECUTE FUNCTION public.match_personality_death_city();


-- One-time backfill: re-fire trigger for existing rows with death_place but no FK.
UPDATE public.personalities
   SET death_place = death_place
 WHERE death_place IS NOT NULL
   AND death_place <> ''
   AND death_city_id IS NULL;
