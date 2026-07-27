-- Geo Hierarchy Unification — P3: relocate the historical-names alias mirror.
-- `historical_names` lives on geo_city_profiles, so the trigger belongs there.
-- Dual-write propagates the typed write in the same transaction, so firing
-- frequency is unchanged. This is the LAST movable AFTER trigger on the typed
-- geo tables; the remaining ones are BEFORE triggers that must move with the
-- P4 swap itself (they mutate NEW before the typed row is written, so moving
-- them early would break NOT NULL on slug).
--
-- Verified live (rolled back): setting historical_names on Philadelphia created
-- 2 city_aliases rows through the spine path.

create or replace function public.geo_city_mirror_historical_names_to_aliases()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
DECLARE
  v_entry jsonb;
  v_name  text;
BEGIN
  IF NEW.historical_names IS NULL OR jsonb_array_length(NEW.historical_names) = 0 THEN
    RETURN NEW;
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(NEW.historical_names) LOOP
    FOREACH v_name IN ARRAY ARRAY[v_entry->>'name_de', v_entry->>'name_en'] LOOP
      IF v_name IS NULL OR btrim(v_name) = '' THEN CONTINUE; END IF;
      INSERT INTO public.city_aliases (city_id, alias, locale)
      VALUES (NEW.place_id, btrim(v_name), NULL)
      ON CONFLICT (city_id, alias_key) DO NOTHING;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

drop trigger if exists trg_geo_city_mirror_historical_names on public.geo_city_profiles;
create trigger trg_geo_city_mirror_historical_names
  after insert or update on public.geo_city_profiles
  for each row execute function public.geo_city_mirror_historical_names_to_aliases();

drop trigger if exists trg_cities_mirror_historical_names on public.cities;
