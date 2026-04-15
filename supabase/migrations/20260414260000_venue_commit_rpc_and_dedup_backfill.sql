-- Venue commit RPC + dedup constraints + backfill hook.
-- Paired with 20260414250000_venue_data_ops_foundation.sql.
-- Mirrors changes applied to prod on 2026-04-14.

-- 1. Atomic per-item venue commit (upsert venue + venue_sources + audit + advisory lock)
CREATE OR REPLACE FUNCTION public.commit_venue_staging_item(
  p_staging_id UUID,
  p_actor TEXT DEFAULT 'pipeline-commit'
)
RETURNS TABLE(venue_id UUID, action TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_stage       RECORD;
  v_norm        JSONB;
  v_enr         JSONB;
  v_loc         JSONB;
  v_contacts    JSONB;
  v_meta        JSONB;
  v_source_slug TEXT;
  v_source_eid  TEXT;
  v_phone       TEXT;
  v_email       TEXT;
  v_website     TEXT;
  v_phone_n     TEXT;
  v_email_n     TEXT;
  v_domain      TEXT;
  v_name        TEXT;
  v_existing_id UUID;
  v_city_id     UUID;
  v_lat         NUMERIC;
  v_lng         NUMERIC;
  v_address     TEXT;
  v_category    TEXT;
  v_description TEXT;
  v_payload     JSONB;
  v_hash        TEXT;
  v_lock_key    BIGINT;
  v_action      TEXT;
  v_result_id   UUID;
BEGIN
  SELECT * INTO v_stage FROM public.ingestion_staging WHERE id = p_staging_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staging_item_not_found: %', p_staging_id; END IF;
  IF v_stage.target_table <> 'venues' THEN RAISE EXCEPTION 'not_a_venue_staging_item: target=%', v_stage.target_table; END IF;
  IF v_stage.disposition IN ('inserted','updated','committed','rejected') THEN
    RETURN QUERY SELECT v_stage.target_record_id, 'noop'::text;
    RETURN;
  END IF;

  v_norm     := coalesce(v_stage.normalized_data, '{}'::jsonb);
  v_enr      := coalesce(v_stage.enriched_data,   '{}'::jsonb);
  v_loc      := coalesce(v_norm->'location', '{}'::jsonb);
  v_contacts := coalesce(v_norm->'contacts', '{}'::jsonb);
  v_meta     := coalesce(v_norm->'metadata', v_stage.raw_data, '{}'::jsonb);

  v_name        := nullif(btrim(v_norm->>'name'), '');
  v_description := nullif(btrim(coalesce(v_norm->>'description', v_enr->>'description')), '');
  v_address     := nullif(btrim(v_loc->>'address'), '');
  v_lat         := nullif(v_loc->>'lat','')::numeric;
  v_lng         := nullif(v_loc->>'lng','')::numeric;
  v_category    := coalesce(nullif(v_norm->>'category',''), 'unknown');

  v_phone   := nullif(btrim(v_contacts->>'phone'), '');
  v_email   := nullif(btrim(v_contacts->>'email'), '');
  v_website := nullif(btrim(v_contacts->>'website'), '');
  v_phone_n := public.normalize_phone(v_phone);
  v_email_n := lower(v_email);
  v_domain  := public.extract_website_domain(v_website);

  v_source_slug := coalesce(v_stage.source_name, v_stage.source_type, 'unknown');
  v_source_eid  := coalesce(v_stage.source_entity_id, v_meta->>'id', v_meta->>'external_id', v_meta->>'source_id');

  IF v_name IS NULL THEN RAISE EXCEPTION 'venue_missing_name: staging=%', p_staging_id; END IF;

  -- Advisory lock prevents parallel workers from inserting the same venue twice.
  v_lock_key := hashtextextended(
    coalesce(v_phone_n, v_email_n, v_domain, public.normalize_name(v_name)), 0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF v_source_eid IS NOT NULL THEN
    SELECT venue_id INTO v_existing_id FROM public.venue_sources
    WHERE source_slug = v_source_slug AND source_entity_id = v_source_eid LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_stage.dedup_match_id IS NOT NULL
     AND coalesce(v_stage.dedup_match_table,'venues') = 'venues'
     AND v_stage.dedup_status IN ('duplicate','merge_candidate') THEN
    v_existing_id := v_stage.dedup_match_id;
  END IF;

  IF v_loc->>'city' IS NOT NULL AND length(btrim(v_loc->>'city')) > 0 THEN
    SELECT id INTO v_city_id FROM public.cities
    WHERE lower(name) = lower(btrim(v_loc->>'city')) LIMIT 1;
  END IF;

  v_payload := jsonb_build_object('raw', v_stage.raw_data, 'normalized', v_norm, 'enriched', v_enr);
  v_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');

  IF v_existing_id IS NULL THEN
    INSERT INTO public.venues (
      name, description, address, city, country, latitude, longitude,
      phone, email, website, category, city_id,
      data_source, external_id, last_synced_at, last_refreshed_at, created_at, updated_at
    ) VALUES (
      v_name, v_description, coalesce(v_address, v_name),
      coalesce(nullif(v_loc->>'city',''), ''),
      coalesce(nullif(v_loc->>'country',''), ''),
      v_lat, v_lng, v_phone, v_email, v_website, v_category, v_city_id,
      v_source_slug, v_source_eid, now(), now(), now(), now()
    ) RETURNING id INTO v_result_id;
    v_action := 'inserted';
  ELSE
    UPDATE public.venues SET
      description = coalesce(description, v_description),
      address     = coalesce(nullif(address,''), v_address, address),
      phone       = coalesce(phone, v_phone),
      email       = coalesce(email, v_email),
      website     = coalesce(website, v_website),
      latitude    = coalesce(latitude, v_lat),
      longitude   = coalesce(longitude, v_lng),
      city_id     = coalesce(city_id, v_city_id),
      last_refreshed_at = now(), updated_at = now()
    WHERE id = v_existing_id;
    v_result_id := v_existing_id;
    v_action    := 'updated';
  END IF;

  IF v_source_eid IS NOT NULL THEN
    INSERT INTO public.venue_sources (
      venue_id, source_slug, source_entity_id, source_url, payload, payload_hash,
      confidence, is_primary, first_seen_at, last_seen_at
    ) VALUES (
      v_result_id, v_source_slug, v_source_eid,
      nullif(btrim(v_meta->>'url'), ''), v_payload, v_hash,
      coalesce(v_stage.ai_confidence_score, 1.0),
      v_action = 'inserted', now(), now()
    )
    ON CONFLICT (source_slug, source_entity_id) DO UPDATE SET
      payload = EXCLUDED.payload, payload_hash = EXCLUDED.payload_hash,
      confidence = EXCLUDED.confidence, last_seen_at = now();
  END IF;

  UPDATE public.ingestion_staging SET
    disposition = v_action, target_record_id = v_result_id,
    processed_at = now(), updated_at = now()
  WHERE id = p_staging_id;

  INSERT INTO public.ingestion_events (staging_id, venue_id, stage, old_status, new_status, actor, payload)
  VALUES (p_staging_id, v_result_id, 'commit', v_stage.disposition, v_action, p_actor,
          jsonb_build_object('source_slug', v_source_slug, 'source_entity_id', v_source_eid, 'action', v_action));

  RETURN QUERY SELECT v_result_id, v_action;
END;
$$;

GRANT EXECUTE ON FUNCTION public.commit_venue_staging_item(UUID, TEXT) TO authenticated, service_role;

-- 2. Batch wrapper with SKIP LOCKED for parallel safety
CREATE OR REPLACE FUNCTION public.commit_venue_staging_batch(p_limit INT DEFAULT 50)
RETURNS TABLE(staging_id UUID, venue_id UUID, action TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
  res RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.ingestion_staging
    WHERE target_table = 'venues'
      AND disposition IN ('pending','approved')
      AND ai_validation_status = 'approved'
      AND (dedup_status IN ('unique','duplicate','merge_candidate') OR dedup_status IS NULL)
      AND (review_status IN ('auto','approved') OR review_status IS NULL)
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT * INTO res FROM public.commit_venue_staging_item(r.id, 'batch');
      staging_id := r.id; venue_id := res.venue_id; action := res.action;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.ingestion_staging SET
        disposition = 'rejected',
        error_message = 'commit_fn: ' || SQLERRM,
        updated_at = now()
      WHERE id = r.id;
      INSERT INTO public.ingestion_events (staging_id, stage, new_status, actor, payload)
      VALUES (r.id, 'commit', 'rejected', 'batch', jsonb_build_object('error', SQLERRM));
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.commit_venue_staging_batch(INT) TO authenticated, service_role;

-- 3. Order final dedup RPC output by score globally (fixes DISTINCT ON + LIMIT pitfall)
CREATE OR REPLACE FUNCTION public.find_venue_duplicate_candidates(
  p_name TEXT,
  p_phone_e164 TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_website_domain TEXT DEFAULT NULL,
  p_lat NUMERIC DEFAULT NULL,
  p_lng NUMERIC DEFAULT NULL,
  p_city_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE(venue_id UUID, match_type TEXT, score NUMERIC, distance_m DOUBLE PRECISION)
LANGUAGE sql STABLE AS $$
  WITH candidates AS (
    SELECT v.id AS vid, 'phone_exact'::text AS mt, 1.00::numeric AS sc,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) AS dm
    FROM public.venues v
    WHERE p_phone_e164 IS NOT NULL AND v.phone_e164 = p_phone_e164 AND v.duplicate_of_id IS NULL
    UNION ALL
    SELECT v.id, 'email_exact', 0.98, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE p_email IS NOT NULL AND v.email_lower = lower(btrim(p_email)) AND v.duplicate_of_id IS NULL
    UNION ALL
    SELECT v.id, 'domain_proximity', 0.95, public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE p_website_domain IS NOT NULL AND v.website_domain = p_website_domain AND v.duplicate_of_id IS NULL
      AND (p_lat IS NULL OR v.latitude IS NULL OR public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) < 500)
    UNION ALL
    SELECT v.id, 'name_proximity',
           extensions.similarity(v.name_normalized, public.normalize_name(p_name))::numeric,
           public.haversine_m(p_lat, p_lng, v.latitude, v.longitude)
    FROM public.venues v
    WHERE v.name_normalized % public.normalize_name(p_name) AND v.duplicate_of_id IS NULL
      AND (p_city_id IS NULL OR v.city_id = p_city_id)
      AND (p_lat IS NULL OR v.latitude IS NULL OR public.haversine_m(p_lat, p_lng, v.latitude, v.longitude) < 1500)
  ),
  best AS (
    SELECT DISTINCT ON (vid) vid, mt, sc, dm
    FROM candidates
    ORDER BY vid, sc DESC, dm ASC NULLS LAST
  )
  SELECT vid, mt, sc, dm FROM best
  ORDER BY sc DESC, dm ASC NULLS LAST
  LIMIT p_limit;
$$;

-- 4. Relax scraper_dedupe_decisions check constraints for new vocab
ALTER TABLE public.scraper_dedupe_decisions
  DROP CONSTRAINT IF EXISTS scraper_dedupe_decisions_decision_check,
  DROP CONSTRAINT IF EXISTS scraper_dedupe_decisions_match_method_check;

ALTER TABLE public.scraper_dedupe_decisions
  ADD CONSTRAINT scraper_dedupe_decisions_decision_check
  CHECK (decision = ANY (ARRAY[
    'merge','skip','pending','not_duplicate','merged',
    'duplicate','unique','merge_candidate'
  ]));

ALTER TABLE public.scraper_dedupe_decisions
  ADD CONSTRAINT scraper_dedupe_decisions_match_method_check
  CHECK (match_method = ANY (ARRAY[
    'name_city_website','name_address','fuzzy',
    'trigram+geo','trigram+date','trigram','trigram+date+city',
    'trigram_name','trigram_title','trigram+country+geo',
    'phone_exact','email_exact','domain_proximity','name_proximity',
    'name_exact_legacy','external_id_match'
  ]));
