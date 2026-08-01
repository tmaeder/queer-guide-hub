-- City Wikidata link cache.
--
-- city-factual-backfill re-resolved every city's Wikidata QID by fuzzy
-- wbsearchentities name search on EVERY run and then threw the result away, so
-- each pass paid search + sitelink + summary (3-5 requests) even for the ~913
-- cities it had already matched. Caching the QID + the enwiki title collapses a
-- repeat visit to a single wbgetentities call and — more importantly — lets the
-- enrichment loop tell "not yet linked" apart from "cannot be linked".
--
-- Mirrored onto geo_city_profiles: sync_geo_spine_city() enumerates profile
-- columns explicitly and geo_spine_drift_check() only compares name/slug/
-- parent_id, so a column missing from the profile would never alarm — and geo P4
-- swaps cities to a view over the spine, where the gap becomes a hard failure.
-- Deliberately NOT on geo_places: the spine row is identity-only.

ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS wikidata_qid    text,
  ADD COLUMN IF NOT EXISTS wikipedia_title text;

ALTER TABLE public.geo_city_profiles
  ADD COLUMN IF NOT EXISTS wikidata_qid    text,
  ADD COLUMN IF NOT EXISTS wikipedia_title text;

DO $$ BEGIN
  ALTER TABLE public.cities ADD CONSTRAINT cities_wikidata_qid_format
    CHECK (wikidata_qid IS NULL OR wikidata_qid ~ '^Q[1-9][0-9]*$') NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Two live cities claiming the same QID is a duplicate, not two cities.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cities_wikidata_qid
  ON public.cities(wikidata_qid)
  WHERE wikidata_qid IS NOT NULL AND duplicate_of_id IS NULL;

COMMENT ON COLUMN public.cities.wikidata_qid IS
  'Cached Wikidata entity id (Q…). Written by city-factual-backfill once resolved; skips re-searching.';
COMMENT ON COLUMN public.cities.wikipedia_title IS
  'Cached en.wikipedia sitelink title. Wikipedia is fetched by this, never by cities.name (dirty names 404).';

-- Re-create the dual-write trigger fn with the two new profile columns.
-- Body transcribed from pg_proc.prosrc (verified identical to
-- 20260725112333_geo_places_backfill_dualwrite.sql) + 3 added lines per clause.
CREATE OR REPLACE FUNCTION public.sync_geo_spine_city()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if tg_op = 'DELETE' then
    delete from public.geo_places where id = old.id and place_type = 'city';
    return old;
  end if;
  insert into public.geo_places as gp (id, place_type, parent_id, name, name_normalized, name_en,
    name_de, name_i18n, description, description_i18n, slug, latitude, longitude, image_url,
    image_metadata, image_flagged, curated_image_url, duplicate_of_id, seo_indexable, data_source,
    last_refreshed_at, created_at, updated_at)
  values (new.id, 'city', new.country_id, new.name, new.name_normalized, new.name_en, new.name_de,
    new.name_i18n, new.description, new.description_i18n, new.slug, new.latitude, new.longitude,
    new.image_url, new.image_metadata, new.image_flagged, new.curated_image_url,
    new.duplicate_of_id, new.seo_indexable, new.data_source, new.last_refreshed_at,
    new.created_at, new.updated_at)
  on conflict (id) do update set
    parent_id = excluded.parent_id, name = excluded.name, name_normalized = excluded.name_normalized,
    name_en = excluded.name_en, name_de = excluded.name_de, name_i18n = excluded.name_i18n,
    description = excluded.description, description_i18n = excluded.description_i18n,
    slug = excluded.slug, latitude = excluded.latitude, longitude = excluded.longitude,
    image_url = excluded.image_url, image_metadata = excluded.image_metadata,
    image_flagged = excluded.image_flagged, curated_image_url = excluded.curated_image_url,
    duplicate_of_id = excluded.duplicate_of_id, seo_indexable = excluded.seo_indexable,
    data_source = excluded.data_source, last_refreshed_at = excluded.last_refreshed_at,
    updated_at = excluded.updated_at
  where gp.place_type = 'city';

  insert into public.geo_city_profiles as p (place_id, region_name, population, is_capital,
    is_major_city, timezone, elevation_m, climate_type, founded_year, area_km2, local_language,
    official_website, mayor, postal_codes, area_codes, sister_cities, notable_landmarks,
    economy_sectors, universities, transportation_info, demographics, cost_of_living,
    lgbt_friendly_rating, best_time_to_visit, local_customs, airport_codes, major_airport_code,
    wolfram_enriched_at, last_synced_at, historical_names, editorial_hook, trust_score,
    completeness_score, last_verified_at, shell_status, needs_attention, field_provenance,
    enrichment_status, safety_notes, social_links, wikidata_qid, wikipedia_title)
  values (new.id, new.region_name, new.population, new.is_capital, new.is_major_city, new.timezone,
    new.elevation_m, new.climate_type, new.founded_year, new.area_km2, new.local_language,
    new.official_website, new.mayor, new.postal_codes, new.area_codes, new.sister_cities,
    new.notable_landmarks, new.economy_sectors, new.universities, new.transportation_info,
    new.demographics, new.cost_of_living, new.lgbt_friendly_rating, new.best_time_to_visit,
    new.local_customs, new.airport_codes, new.major_airport_code, new.wolfram_enriched_at,
    new.last_synced_at, new.historical_names, new.editorial_hook, new.trust_score,
    new.completeness_score, new.last_verified_at, new.shell_status, new.needs_attention,
    new.field_provenance, new.enrichment_status, new.safety_notes, new.social_links,
    new.wikidata_qid, new.wikipedia_title)
  on conflict (place_id) do update set
    region_name = excluded.region_name, population = excluded.population,
    is_capital = excluded.is_capital, is_major_city = excluded.is_major_city,
    timezone = excluded.timezone, elevation_m = excluded.elevation_m,
    climate_type = excluded.climate_type, founded_year = excluded.founded_year,
    area_km2 = excluded.area_km2, local_language = excluded.local_language,
    official_website = excluded.official_website, mayor = excluded.mayor,
    postal_codes = excluded.postal_codes, area_codes = excluded.area_codes,
    sister_cities = excluded.sister_cities, notable_landmarks = excluded.notable_landmarks,
    economy_sectors = excluded.economy_sectors, universities = excluded.universities,
    transportation_info = excluded.transportation_info, demographics = excluded.demographics,
    cost_of_living = excluded.cost_of_living, lgbt_friendly_rating = excluded.lgbt_friendly_rating,
    best_time_to_visit = excluded.best_time_to_visit, local_customs = excluded.local_customs,
    airport_codes = excluded.airport_codes, major_airport_code = excluded.major_airport_code,
    wolfram_enriched_at = excluded.wolfram_enriched_at, last_synced_at = excluded.last_synced_at,
    historical_names = excluded.historical_names, editorial_hook = excluded.editorial_hook,
    trust_score = excluded.trust_score, completeness_score = excluded.completeness_score,
    last_verified_at = excluded.last_verified_at, shell_status = excluded.shell_status,
    needs_attention = excluded.needs_attention, field_provenance = excluded.field_provenance,
    enrichment_status = excluded.enrichment_status, safety_notes = excluded.safety_notes,
    social_links = excluded.social_links, wikidata_qid = excluded.wikidata_qid,
    wikipedia_title = excluded.wikipedia_title;
  return new;
end;
$$;

-- Seed the geo/reference-source breakers. checkCircuit() allows by default when
-- no row exists and recordFailure()'s fallback bails on a missing row, so these
-- three call sites in city-factual-backfill were decorative: a Wikipedia outage
-- could never trip anything. wikidata.sparql is separate from wikidata.api on
-- purpose — WDQS is slow and flaky, and a query-service timeout storm must not
-- block the cheap entity API.
INSERT INTO public.api_circuit_breakers (api_name, state, threshold, reset_timeout_seconds)
VALUES
  ('wikipedia.api',    'closed', 10, 600),
  ('wikidata.api',     'closed', 10, 600),
  ('wikidata.sparql',  'closed',  5, 900),
  ('osm.nominatim',    'closed', 10, 600)
ON CONFLICT (api_name) DO NOTHING;
