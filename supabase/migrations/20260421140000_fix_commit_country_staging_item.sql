-- Fix "column reference country_id is ambiguous" in commit_country_staging_item.
-- RETURNS TABLE defined country_id as OUT var conflicting with ingestion_events.country_id.
-- Renamed to out_country_id. Updated batch function to match.

DROP FUNCTION IF EXISTS public.commit_country_staging_item(uuid, text);

CREATE FUNCTION public.commit_country_staging_item(
  p_staging_id uuid,
  p_actor text DEFAULT 'pipeline-commit'
)
RETURNS TABLE(out_country_id uuid, action text)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_stage RECORD; v_norm JSONB; v_enr JSONB; v_meta JSONB;
  v_name TEXT; v_code TEXT; v_source_slug TEXT; v_source_eid TEXT;
  v_existing_id UUID; v_lat NUMERIC; v_lng NUMERIC;
  v_capital TEXT; v_population BIGINT; v_area NUMERIC;
  v_currency TEXT; v_languages TEXT[]; v_timezone TEXT;
  v_lock_key BIGINT; v_action TEXT; v_result_id UUID; v_payload JSONB; v_hash TEXT;
BEGIN
  SELECT * INTO v_stage FROM public.ingestion_staging WHERE id = p_staging_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staging_item_not_found: %', p_staging_id; END IF;
  IF v_stage.target_table <> 'countries' THEN RAISE EXCEPTION 'not_a_country_staging_item: target=%', v_stage.target_table; END IF;
  IF v_stage.disposition IN ('inserted','updated','committed','rejected') THEN
    RETURN QUERY SELECT v_stage.target_record_id, 'noop'::text; RETURN;
  END IF;
  v_norm := coalesce(v_stage.normalized_data, '{}'::jsonb);
  v_enr  := coalesce(v_stage.enriched_data, '{}'::jsonb);
  v_meta := coalesce(v_norm->'metadata', v_stage.raw_data, '{}'::jsonb);
  v_name := nullif(btrim(v_norm->>'name'), '');
  v_code := upper(btrim(coalesce(v_norm->>'code', v_meta->>'code', v_meta->>'cca2', v_meta->>'iso_a2')));
  IF v_code = '' THEN v_code := NULL; END IF;
  v_capital    := nullif(btrim(coalesce(v_norm->>'capital', v_meta->>'capital')), '');
  v_population := nullif(coalesce(v_norm->>'population', v_meta->>'population'), '')::BIGINT;
  v_area       := nullif(coalesce(v_norm->>'area_km2', v_meta->>'area'), '')::NUMERIC;
  v_currency   := nullif(btrim(coalesce(v_norm->>'currency', v_meta->>'currency')), '');
  v_timezone   := nullif(btrim(coalesce(v_norm->>'timezone', v_meta->>'timezone')), '');
  v_lat        := nullif(coalesce(v_norm->'location'->>'lat', v_meta->>'latitude'), '')::NUMERIC;
  v_lng        := nullif(coalesce(v_norm->'location'->>'lng', v_meta->>'longitude'), '')::NUMERIC;
  IF jsonb_typeof(v_norm->'languages') = 'array' THEN
    SELECT array_agg(x::text) INTO v_languages FROM jsonb_array_elements_text(v_norm->'languages') AS x;
  ELSIF jsonb_typeof(v_meta->'languages') = 'array' THEN
    SELECT array_agg(x::text) INTO v_languages FROM jsonb_array_elements_text(v_meta->'languages') AS x;
  END IF;
  v_source_slug := coalesce(v_stage.source_name, v_stage.source_type, 'unknown');
  v_source_eid  := coalesce(v_stage.source_entity_id, v_code, v_meta->>'id', v_meta->>'external_id');
  IF v_name IS NULL THEN RAISE EXCEPTION 'country_missing_name: staging=%', p_staging_id; END IF;
  v_lock_key := hashtextextended(coalesce(v_code, public.normalize_name(v_name)), 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);
  IF v_source_eid IS NOT NULL THEN
    SELECT gs.country_id INTO v_existing_id FROM public.geo_sources gs
    WHERE gs.entity_type='country' AND gs.source_slug=v_source_slug AND gs.source_entity_id=v_source_eid LIMIT 1;
  END IF;
  IF v_existing_id IS NULL AND v_stage.dedup_match_id IS NOT NULL
     AND coalesce(v_stage.dedup_match_table,'countries') = 'countries'
     AND v_stage.dedup_status IN ('duplicate','merge_candidate') THEN
    v_existing_id := v_stage.dedup_match_id;
  END IF;
  IF v_existing_id IS NULL AND v_code IS NOT NULL THEN
    SELECT c.id INTO v_existing_id FROM public.countries c WHERE c.code = v_code AND c.duplicate_of_id IS NULL LIMIT 1;
  END IF;
  v_payload := jsonb_build_object('raw', v_stage.raw_data, 'normalized', v_norm, 'enriched', v_enr);
  v_hash    := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');
  IF v_existing_id IS NULL THEN
    DECLARE v_continent_id UUID; v_continent_code TEXT;
    BEGIN
      v_continent_code := upper(btrim(coalesce(v_meta->>'continent_code', v_meta->>'region', v_meta->'continents'->>0)));
      IF v_continent_code IS NOT NULL AND v_continent_code <> '' THEN
        SELECT cont.id INTO v_continent_id FROM public.continents cont WHERE cont.code = v_continent_code OR upper(cont.name) = v_continent_code LIMIT 1;
      END IF;
      IF v_continent_id IS NULL THEN
        SELECT cont.id INTO v_continent_id FROM public.continents cont ORDER BY cont.code LIMIT 1;
      END IF;
      INSERT INTO public.countries (name, code, continent_id, capital, population, area_km2, currency, languages, timezone, latitude, longitude, data_source, last_synced_at, last_refreshed_at, created_at, updated_at)
      VALUES (v_name, v_code, v_continent_id, v_capital, v_population, v_area, v_currency, v_languages, v_timezone, v_lat, v_lng, v_source_slug, now(), now(), now(), now())
      RETURNING id INTO v_result_id;
      v_action := 'inserted';
    END;
  ELSE
    UPDATE public.countries SET
      capital = coalesce(capital, v_capital), population = coalesce(population, v_population),
      area_km2 = coalesce(area_km2, v_area), currency = coalesce(currency, v_currency),
      languages = coalesce(languages, v_languages), timezone = coalesce(timezone, v_timezone),
      latitude = coalesce(latitude, v_lat), longitude = coalesce(longitude, v_lng),
      code = coalesce(code, v_code), last_synced_at = now(), last_refreshed_at = now(), updated_at = now()
    WHERE id = v_existing_id;
    v_result_id := v_existing_id; v_action := 'updated';
  END IF;
  IF v_source_eid IS NOT NULL THEN
    INSERT INTO public.geo_sources (entity_type, country_id, source_slug, source_entity_id, source_url, payload, payload_hash, confidence, is_primary, first_seen_at, last_seen_at)
    VALUES ('country', v_result_id, v_source_slug, v_source_eid, nullif(btrim(v_meta->>'url'),''), v_payload, v_hash, coalesce(v_stage.ai_confidence_score, 1.0), v_action = 'inserted', now(), now())
    ON CONFLICT (source_slug, source_entity_id) DO UPDATE SET payload = EXCLUDED.payload, payload_hash = EXCLUDED.payload_hash, confidence = EXCLUDED.confidence, last_seen_at = now();
  END IF;
  UPDATE public.ingestion_staging SET disposition = v_action, target_record_id = v_result_id, processed_at = now(), updated_at = now() WHERE id = p_staging_id;
  INSERT INTO public.ingestion_events (staging_id, country_id, stage, old_status, new_status, actor, payload)
  VALUES (p_staging_id, v_result_id, 'commit', v_stage.disposition, v_action, p_actor,
          jsonb_build_object('source_slug', v_source_slug, 'source_entity_id', v_source_eid, 'action', v_action));
  RETURN QUERY SELECT v_result_id, v_action;
END;
$function$;

CREATE OR REPLACE FUNCTION public.commit_country_staging_batch(p_limit integer DEFAULT 50)
RETURNS TABLE(staging_id uuid, country_id uuid, action text)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE r RECORD; res RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.ingestion_staging
    WHERE target_table = 'countries' AND disposition IN ('pending','approved')
      AND ai_validation_status = 'approved'
      AND (dedup_status IN ('unique','duplicate','merge_candidate') OR dedup_status IS NULL)
      AND (review_status IN ('auto','approved') OR review_status IS NULL)
    ORDER BY created_at ASC LIMIT p_limit FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT * INTO res FROM public.commit_country_staging_item(r.id, 'batch');
      staging_id := r.id; country_id := res.out_country_id; action := res.action; RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.ingestion_staging SET disposition = 'rejected', error_message = 'commit_fn: ' || SQLERRM, updated_at = now() WHERE id = r.id;
      INSERT INTO public.ingestion_events (staging_id, stage, new_status, actor, payload)
      VALUES (r.id, 'commit', 'rejected', 'batch', jsonb_build_object('error', SQLERRM));
    END;
  END LOOP;
END;
$function$;
