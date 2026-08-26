-- Capital scope: separate the national flag from a new regional one.
--
-- `cities.is_capital` has existed since the baseline as an undifferentiated
-- boolean with no scope column, so nothing distinguished Berlin (national) from
-- Munich (capital of Bavaria). Measured 2026-08-25: 199 of 5,552 live cities
-- flagged, and all 16 German Land capitals sat at false because the concept did
-- not exist. This adds it.
--
-- TWO booleans, not one enum: Berlin, Vienna, Hamburg and Bremen are national
-- AND regional capitals at once, so a single scope value cannot express them.
--
-- `capital_of_region` is not redundant with `region_name`. `region_name` is
-- filled on only 2,958 of 5,552 live rows and on many capitals holds numeric
-- FIPS-style codes ('13', '09', '50') rather than a region name. The new column
-- carries the Wikidata label of the unit the city is the capital OF, which is
-- the evidence for the flag rather than a display convenience.
--
-- Lockstep (a missing satellite column would never alarm: geo_spine_drift_check()
-- only compares name/slug/parent_id):
--   cities + geo_city_profiles + sync_geo_spine_city() + cities_admin view
--   + cities_directory() + commit_city_staging_item().

-- ---------------------------------------------------------------- columns

ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS is_regional_capital boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capital_of_region   text;

ALTER TABLE public.geo_city_profiles
  ADD COLUMN IF NOT EXISTS is_regional_capital boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capital_of_region   text;

COMMENT ON COLUMN public.cities.is_capital IS
  'Capital of a sovereign state / dependent territory (national). Independent of is_regional_capital — a city-state capital is both.';
COMMENT ON COLUMN public.cities.is_regional_capital IS
  'Capital of a FIRST-LEVEL administrative subdivision (Bundesland, US state, région, provincia). County/district seats are deliberately excluded. Written by the Wikidata P1376 backfill; enrichment_status.capital_scope records whether a row was ever probed, because NOT NULL DEFAULT false cannot distinguish "no" from "never asked".';
COMMENT ON COLUMN public.cities.capital_of_region IS
  'English Wikidata label of the first-level unit this city is the capital of. The evidence for is_regional_capital — NOT a display copy of region_name, which is half-empty and partly FIPS codes.';

-- ---------------------------------------------------------------- name key
--
-- One shared spelling key for every capital comparison. `countries.capital` and
-- `cities.name` disagree on diacritics in real data (Iceland: 'Reykjavik' vs
-- 'Reykjavík') and both spellings are legitimate, so the comparison is
-- unaccented rather than the data being "corrected" to one side.
--
-- The TWO-ARG unaccent form is required: these callers run with
-- `SET search_path TO 'public'`, where the one-arg form cannot find its
-- dictionary. Verified against this database before committing.
CREATE OR REPLACE FUNCTION public.city_name_key(p_name text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT nullif(
    lower(btrim(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_name, '')))),
    ''
  );
$$;

COMMENT ON FUNCTION public.city_name_key(text) IS
  'Diacritic- and case-insensitive key for comparing a city name against countries.capital. Used by the capital repair, the coverage radar gap check and city_capital_gaps().';

GRANT EXECUTE ON FUNCTION public.city_name_key(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------- spine sync

CREATE OR REPLACE FUNCTION public.sync_geo_spine_city()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    is_regional_capital, capital_of_region,
    is_major_city, timezone, elevation_m, climate_type, founded_year, area_km2, local_language,
    official_website, mayor, postal_codes, area_codes, sister_cities, notable_landmarks,
    economy_sectors, universities, transportation_info, demographics, cost_of_living,
    lgbt_friendly_rating, best_time_to_visit, local_customs, airport_codes, major_airport_code,
    wolfram_enriched_at, last_synced_at, historical_names, editorial_hook, trust_score,
    completeness_score, last_verified_at, shell_status, needs_attention, field_provenance,
    enrichment_status, safety_notes, social_links, wikidata_qid, wikipedia_title)
  values (new.id, new.region_name, new.population, new.is_capital,
    new.is_regional_capital, new.capital_of_region,
    new.is_major_city, new.timezone,
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
    is_capital = excluded.is_capital,
    is_regional_capital = excluded.is_regional_capital,
    capital_of_region = excluded.capital_of_region,
    is_major_city = excluded.is_major_city,
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
$function$;

-- Backfill the satellite for rows the trigger will not touch until their next
-- write. Both new columns are currently uniform, so this is a single cheap pass
-- and does NOT go through `cities` (no spine/search cascade).
UPDATE public.geo_city_profiles p
   SET is_regional_capital = c.is_regional_capital,
       capital_of_region   = c.capital_of_region
  FROM public.cities c
 WHERE c.id = p.place_id
   AND (p.is_regional_capital IS DISTINCT FROM c.is_regional_capital
        OR p.capital_of_region IS DISTINCT FROM c.capital_of_region);

-- ---------------------------------------------------------------- cities_admin
--
-- CREATE OR REPLACE VIEW can only APPEND columns, never insert them mid-list,
-- so the two land at the end rather than beside is_capital. Dropping and
-- recreating to get a prettier column order would take the view's grants with
-- it for the length of the transaction; the order is not worth that.

CREATE OR REPLACE VIEW public.cities_admin AS
 SELECT c.id,
    c.name,
    c.country_id,
    c.region_name,
    c.population,
    c.latitude,
    c.longitude,
    c.timezone,
    c.is_capital,
    c.is_major_city,
    c.major_airport_code,
    c.created_at,
    c.updated_at,
    co.name AS country_name,
        CASE
            WHEN co.lgbti_same_sex_unions IS NULL THEN NULL::text
            WHEN "left"(co.lgbti_same_sex_unions, 1) = '{'::text THEN co.lgbti_same_sex_unions::jsonb ->> 'summary'::text
            ELSE co.lgbti_same_sex_unions
        END AS lgbt_legal_status,
        CASE
            WHEN co.equality_score >= 80 THEN 'High protections'::text
            WHEN co.equality_score >= 60 THEN 'Moderate protections'::text
            WHEN co.equality_score >= 40 THEN 'Limited protections'::text
            WHEN co.equality_score >= 20 THEN 'Restricted'::text
            WHEN co.equality_score IS NOT NULL THEN 'Hostile'::text
            ELSE NULL::text
        END AS lgbt_rights_status,
    co.equality_score,
    co.continent_id,
    COALESCE(v.venue_count, 0::bigint) AS venue_count,
    COALESCE(e.event_count, 0::bigint) AS event_count,
    c.is_regional_capital,
    c.capital_of_region
   FROM cities c
     LEFT JOIN countries co ON co.id = c.country_id
     LEFT JOIN ( SELECT venues.city_id,
            count(*) AS venue_count
           FROM venues
          WHERE venues.city_id IS NOT NULL
          GROUP BY venues.city_id) v ON v.city_id = c.id
     LEFT JOIN ( SELECT events.city_id,
            count(*) AS event_count
           FROM events
          WHERE events.city_id IS NOT NULL
          GROUP BY events.city_id) e ON e.city_id = c.id;

-- ---------------------------------------------------------------- directory RPC
--
-- `is_regional_capital` is emitted as NULL when false so jsonb_strip_nulls drops
-- it: the directory returns ~3,000 rows and the overwhelming majority are not
-- regional capitals. `is_capital` keeps its existing raw shape — changing an
-- established key's presence would be a client-visible contract change for no
-- gain here.

CREATE OR REPLACE FUNCTION public.cities_directory()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with vc as (
    select v.city_id, count(*)::int as n
    from public.venues v
    where v.review_status = 'approved'
      and v.city_id is not null
    group by v.city_id
  ),
  -- Upcoming only. The events corpus is ~99% past (36.5k rows scraped from the
  -- Wayback Machine), so a lifetime count would say nothing about whether there is
  -- anything to go to; 157 cities have a future event.
  ec as (
    select e.city_id, count(*)::int as n
    from public.events e
    where e.city_id is not null
      and e.start_date >= now() - interval '1 day'
    group by e.city_id
  ),
  qv as (
    select q.city_id, count(*)::int as n
    from public.queer_villages q
    where q.city_id is not null
    group by q.city_id
  ),
  rows as (
    select
      c.id,
      c.slug,
      c.name,
      c.name_en,
      c.name_de,
      c.region_name,
      c.population,
      c.latitude,
      c.longitude,
      c.is_capital,
      nullif(c.is_regional_capital, false) as is_regional_capital,
      c.capital_of_region,
      c.editorial_hook,
      co.id            as country_id,
      co.name          as country_name,
      co.slug          as country_slug,
      co.equality_score,
      cont.code        as continent_code,
      cont.name        as continent_name,
      coalesce(vc.n, 0) as venue_count,
      coalesce(ec.n, 0) as upcoming_event_count,
      coalesce(qv.n, 0) as village_count,
      -- Resolved here, not in the client, so the card cannot disagree with the RLS
      -- predicate that decides whether that city's venues are gated at all.
      public.location_is_high_risk(c.country_id, c.id) as high_risk
    from public.cities c
    left join public.countries  co   on co.id   = c.country_id
    left join public.continents cont on cont.id = co.continent_id
    left join vc on vc.city_id = c.id
    left join ec on ec.city_id = c.id
    left join qv on qv.city_id = c.id
    where c.duplicate_of_id is null
      and c.slug is not null
      and c.slug not like 'tmp-%'
      -- Coordinates were a map requirement; they stay because they are also the best
      -- available completeness proxy for a stub row. Only 2 of 3,070 rows lack them,
      -- so this is not what was truncating the directory — the limit was.
      and c.latitude is not null
      and c.longitude is not null
      and c.seo_indexable is true
      -- `not in` would swallow NULLs; shell_status is NOT NULL on every row (verified),
      -- so this is safe, and it is the same expression the places sitemap uses.
      and c.shell_status not in ('ghost', 'merged')
    order by coalesce(vc.n, 0) desc, c.population desc nulls last, c.name asc
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(rows))), '[]'::jsonb) from rows;
$function$;

-- ---------------------------------------------------------------- staging commit
--
-- Only change: carry is_regional_capital / capital_of_region through from
-- staging metadata.
--
-- The existing `is_capital` UPDATE branch is a ONE-WAY LATCH
-- (`CASE WHEN v_is_capital THEN true ELSE is_capital END`) — once true it can
-- never go back. That is left exactly as it is, but it is NOT copied for the new
-- column, because the new column has a backfill writing it and a latch would
-- make a correction impossible.
--
-- Instead the write is gated on the key being PRESENT in the metadata, not on
-- its value. A plain `coalesce(..., false)` would be worse than the latch: most
-- sources never emit these keys, so every re-ingest of a city would silently
-- reset a backfilled `true`. Present -> authoritative (false included);
-- absent -> leave the row alone.

CREATE OR REPLACE FUNCTION public.commit_city_staging_item(p_staging_id uuid, p_actor text DEFAULT 'pipeline-commit'::text)
 RETURNS TABLE(out_city_id uuid, action text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_stage RECORD; v_norm JSONB; v_enr JSONB; v_loc JSONB; v_meta JSONB;
  v_name TEXT; v_country_code TEXT; v_country_name TEXT; v_country_id UUID;
  v_lat NUMERIC; v_lng NUMERIC; v_population BIGINT; v_area NUMERIC;
  v_timezone TEXT; v_region TEXT; v_is_capital BOOLEAN;
  v_has_regional BOOLEAN; v_is_regional_capital BOOLEAN;
  v_has_capital_of BOOLEAN; v_capital_of_region TEXT;
  v_source_slug TEXT; v_source_eid TEXT; v_existing_id UUID;
  v_lock_key BIGINT; v_action TEXT; v_result_id UUID; v_payload JSONB; v_hash TEXT;
BEGIN
  SELECT * INTO v_stage FROM public.ingestion_staging WHERE id = p_staging_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staging_item_not_found: %', p_staging_id; END IF;
  IF v_stage.target_table <> 'cities' THEN RAISE EXCEPTION 'not_a_city_staging_item: target=%', v_stage.target_table; END IF;
  IF v_stage.disposition IN ('inserted','updated','committed','rejected') THEN
    RETURN QUERY SELECT v_stage.target_record_id, 'noop'::text; RETURN;
  END IF;
  v_norm := coalesce(v_stage.normalized_data, '{}'::jsonb);
  v_enr  := coalesce(v_stage.enriched_data, '{}'::jsonb);
  v_loc  := coalesce(v_norm->'location', '{}'::jsonb);
  v_meta := coalesce(v_norm->'metadata', v_stage.raw_data, '{}'::jsonb);
  v_name := nullif(btrim(v_norm->>'name'), '');
  v_lat  := nullif(v_loc->>'lat','')::NUMERIC;
  v_lng  := nullif(v_loc->>'lng','')::NUMERIC;
  v_population := nullif(coalesce(v_norm->>'population', v_meta->>'population'), '')::BIGINT;
  v_area := nullif(coalesce(v_norm->>'area_km2', v_meta->>'area'), '')::NUMERIC;
  v_timezone := nullif(btrim(coalesce(v_norm->>'timezone', v_meta->>'timezone')), '');
  v_region := nullif(btrim(coalesce(v_norm->>'region_name', v_meta->>'region_name', v_meta->>'state', v_meta->>'admin1')), '');
  v_is_capital := coalesce((v_meta->>'is_capital')::BOOLEAN, false);
  v_has_regional := (v_meta ? 'is_regional_capital') AND (v_meta->>'is_regional_capital') IS NOT NULL;
  v_is_regional_capital := coalesce((v_meta->>'is_regional_capital')::BOOLEAN, false);
  v_has_capital_of := (v_meta ? 'capital_of_region');
  v_capital_of_region := nullif(btrim(coalesce(v_meta->>'capital_of_region','')), '');
  v_country_code := upper(btrim(coalesce(v_loc->>'country_code', v_meta->>'country_code', v_meta->>'countryCode', v_meta->>'cca2')));
  IF v_country_code = '' THEN v_country_code := NULL; END IF;
  v_country_name := nullif(btrim(coalesce(v_loc->>'country', v_meta->>'country')), '');
  v_source_slug := coalesce(v_stage.source_name, v_stage.source_type, 'unknown');
  v_source_eid := coalesce(v_stage.source_entity_id, v_meta->>'id', v_meta->>'external_id', v_meta->>'geonameid');
  IF v_name IS NULL THEN RAISE EXCEPTION 'city_missing_name: staging=%', p_staging_id; END IF;
  IF v_country_code IS NOT NULL THEN
    SELECT c.id INTO v_country_id FROM public.countries c WHERE c.code = v_country_code AND c.duplicate_of_id IS NULL LIMIT 1;
  END IF;
  IF v_country_id IS NULL AND v_country_name IS NOT NULL THEN
    SELECT c.id INTO v_country_id FROM public.countries c WHERE c.name_normalized = public.normalize_name(v_country_name) AND c.duplicate_of_id IS NULL LIMIT 1;
  END IF;
  IF v_country_id IS NULL THEN
    RAISE EXCEPTION 'city_unresolved_country: staging=% code=% name=%', p_staging_id, v_country_code, v_country_name;
  END IF;
  v_lock_key := hashtextextended(v_country_id::text || '|' || public.normalize_name(v_name), 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);
  IF v_source_eid IS NOT NULL THEN
    SELECT gs.city_id INTO v_existing_id FROM public.geo_sources gs
    WHERE gs.entity_type='city' AND gs.source_slug=v_source_slug AND gs.source_entity_id=v_source_eid LIMIT 1;
  END IF;
  IF v_existing_id IS NULL AND v_stage.dedup_match_id IS NOT NULL
     AND coalesce(v_stage.dedup_match_table,'cities') = 'cities'
     AND v_stage.dedup_status IN ('duplicate','merge_candidate') THEN
    v_existing_id := v_stage.dedup_match_id;
  END IF;
  IF v_existing_id IS NULL THEN
    SELECT c.id INTO v_existing_id FROM public.cities c
    WHERE c.country_id = v_country_id AND c.name_normalized = public.normalize_name(v_name) AND c.duplicate_of_id IS NULL LIMIT 1;
  END IF;
  v_payload := jsonb_build_object('raw', v_stage.raw_data, 'normalized', v_norm, 'enriched', v_enr);
  v_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');
  IF v_existing_id IS NULL THEN
    INSERT INTO public.cities (name, country_id, region_name, population, is_capital, is_regional_capital, capital_of_region, latitude, longitude, timezone, area_km2, data_source, last_synced_at, last_refreshed_at, created_at, updated_at)
    VALUES (v_name, v_country_id, v_region, v_population, v_is_capital, v_is_regional_capital, v_capital_of_region, v_lat, v_lng, v_timezone, v_area, v_source_slug, now(), now(), now(), now())
    RETURNING id INTO v_result_id;
    v_action := 'inserted';
  ELSE
    UPDATE public.cities SET
      region_name = coalesce(region_name, v_region), population = coalesce(population, v_population),
      latitude = coalesce(latitude, v_lat), longitude = coalesce(longitude, v_lng),
      timezone = coalesce(timezone, v_timezone), area_km2 = coalesce(area_km2, v_area),
      is_capital = CASE WHEN v_is_capital THEN true ELSE is_capital END,
      is_regional_capital = CASE WHEN v_has_regional THEN v_is_regional_capital ELSE is_regional_capital END,
      capital_of_region = CASE WHEN v_has_capital_of THEN v_capital_of_region ELSE capital_of_region END,
      last_synced_at = now(), last_refreshed_at = now(), updated_at = now()
    WHERE id = v_existing_id;
    v_result_id := v_existing_id; v_action := 'updated';
  END IF;
  IF v_source_eid IS NOT NULL THEN
    INSERT INTO public.geo_sources (entity_type, city_id, source_slug, source_entity_id, source_url, payload, payload_hash, confidence, is_primary, first_seen_at, last_seen_at)
    VALUES ('city', v_result_id, v_source_slug, v_source_eid, nullif(btrim(v_meta->>'url'),''), v_payload, v_hash, coalesce(v_stage.ai_confidence_score, 1.0), v_action = 'inserted', now(), now())
    ON CONFLICT (source_slug, source_entity_id) DO UPDATE SET payload = EXCLUDED.payload, payload_hash = EXCLUDED.payload_hash, confidence = EXCLUDED.confidence, last_seen_at = now();
  END IF;
  UPDATE public.ingestion_staging SET disposition = v_action, target_record_id = v_result_id, processed_at = now(), updated_at = now() WHERE id = p_staging_id;
  INSERT INTO public.ingestion_events (staging_id, city_id, stage, old_status, new_status, actor, payload)
  VALUES (p_staging_id, v_result_id, 'commit', v_stage.disposition, v_action, p_actor,
          jsonb_build_object('source_slug', v_source_slug, 'source_entity_id', v_source_eid, 'action', v_action));
  RETURN QUERY SELECT v_result_id, v_action;
END;
$function$;
