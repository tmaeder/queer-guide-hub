-- Put the staging commit behind the same door as every other city writer.
--
-- `commit_city_staging_item` is the path that got this right first: advisory
-- lock, then geo_sources by source key, then the staging row's own
-- dedup_match_id, then (country_id, name_normalized). Nothing here is being
-- corrected. What it lacks is the two arms that catch the class that actually
-- survives -- city_aliases and wikidata_qid -- and, like every probe written
-- before 20260811100400, its name arm filters `duplicate_of_id IS NULL`, which
-- matches the PARTIAL unique index and is blind to the two TOTAL ones. A city
-- whose only twin has been merged away probes clean here and then collides on
-- insert; that is the exact shape that aborted a 798-row batch with 23505.
--
-- It is also, right now, DORMANT: ingestion_staging holds 1,000 rows for
-- target_table='cities' and the newest is 2026-04-21. That is the reason to
-- convert it rather than to skip it. A dormant path is one nobody is watching,
-- and the next source that revives it would otherwise arrive through a door
-- that has been quietly diverging from the others for months.
--
-- IDENTITY MOVES TO THE RESOLVER, THE COLUMN WRITES STAY HERE. `city_resolve_or_create`
-- knows nothing about population, timezone, area_km2 or is_capital, and it
-- should not: those are what the staging payload carries, and the fill-if-empty
-- semantics below are this function's own contract with the pipeline. So the
-- resolver answers "which city is this", and everything after that is unchanged
-- from the previous definition.
--
-- The advisory lock is now taken twice on the same key -- once here, once
-- inside the resolver. That is free (pg_advisory_xact_lock is reentrant within
-- a transaction) and the outer one is kept deliberately: it still covers the
-- geo_sources and dedup_match_id probes, which run before the resolver is
-- called and are not its business.
--
-- A REFUSAL IS NOT AN INSERT. Where this used to create unconditionally, an
-- ambiguous or evidence-free row now raises, and the batch handler dispositions
-- the staging row with the reason. That is a real behaviour change and the
-- intended one: a staged city we cannot place is recoverable, a staged city
-- attached to the wrong row is not.

CREATE OR REPLACE FUNCTION public.commit_city_staging_item(
  p_staging_id uuid,
  p_actor text DEFAULT 'pipeline-commit'
)
RETURNS TABLE(out_city_id uuid, action text)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_stage RECORD; v_norm JSONB; v_enr JSONB; v_loc JSONB; v_meta JSONB;
  v_name TEXT; v_country_code TEXT; v_country_name TEXT; v_country_id UUID;
  v_lat NUMERIC; v_lng NUMERIC; v_population BIGINT; v_area NUMERIC;
  v_timezone TEXT; v_region TEXT; v_is_capital BOOLEAN;
  v_source_slug TEXT; v_source_eid TEXT; v_existing_id UUID;
  v_lock_key BIGINT; v_action TEXT; v_result_id UUID; v_payload JSONB; v_hash TEXT;
  v_res RECORD;
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

  -- Probes this function owns: the source's own id for the row, and the
  -- dedup verdict the pipeline already reached. Neither is something the
  -- generic resolver can see.
  IF v_source_eid IS NOT NULL THEN
    SELECT gs.city_id INTO v_existing_id FROM public.geo_sources gs
    WHERE gs.entity_type='city' AND gs.source_slug=v_source_slug AND gs.source_entity_id=v_source_eid LIMIT 1;
  END IF;
  IF v_existing_id IS NULL AND v_stage.dedup_match_id IS NOT NULL
     AND coalesce(v_stage.dedup_match_table,'cities') = 'cities'
     AND v_stage.dedup_status IN ('duplicate','merge_candidate') THEN
    v_existing_id := v_stage.dedup_match_id;
  END IF;

  -- Identity: one shared ladder instead of this function's own name probe.
  IF v_existing_id IS NULL THEN
    SELECT * INTO v_res FROM public.city_resolve_or_create(
      p_name             => v_name,
      p_country_id       => v_country_id,
      p_region_hint      => v_region,
      p_lat              => v_lat,
      p_lng              => v_lng,
      p_source_slug      => v_source_slug,
      p_source_entity_id => v_source_eid,
      p_actor            => 'pipeline-commit'
    );
    IF v_res.city_id IS NULL THEN
      -- Surfaced as an exception so commit_city_staging_batch's handler writes
      -- the reason onto the staging row, the same way it already reports
      -- city_missing_name and city_unresolved_country.
      RAISE EXCEPTION 'city_unresolved: staging=% reason=% name=%', p_staging_id, v_res.reason, v_name;
    END IF;
    v_existing_id := v_res.city_id;
    -- 'created' still reports as 'inserted' downstream: the disposition
    -- vocabulary belongs to ingestion_staging, not to the resolver.
    IF v_res.action = 'created' THEN v_action := 'inserted'; END IF;
  END IF;

  v_payload := jsonb_build_object('raw', v_stage.raw_data, 'normalized', v_norm, 'enriched', v_enr);
  v_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');
  v_result_id := v_existing_id;

  -- Fill-if-empty, unchanged. It runs for a freshly created row too: the
  -- resolver writes only name/country/region/coords/qid, so population,
  -- timezone, area and is_capital still arrive from here.
  UPDATE public.cities SET
    region_name = coalesce(region_name, v_region), population = coalesce(population, v_population),
    latitude = coalesce(latitude, v_lat), longitude = coalesce(longitude, v_lng),
    timezone = coalesce(timezone, v_timezone), area_km2 = coalesce(area_km2, v_area),
    is_capital = CASE WHEN v_is_capital THEN true ELSE is_capital END,
    last_synced_at = now(), last_refreshed_at = now(), updated_at = now()
  WHERE id = v_result_id;
  v_action := coalesce(v_action, 'updated');

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

COMMENT ON FUNCTION public.commit_city_staging_item(uuid, text) IS
  'Commits one cities staging row. Identity is delegated to '
  'city_resolve_or_create (alias + QID + both TOTAL unique keys, resolving '
  'through duplicate_of_id); the source-key and dedup_match_id probes and all '
  'column writes stay here. An unresolvable row RAISEs city_unresolved rather '
  'than inserting.';
