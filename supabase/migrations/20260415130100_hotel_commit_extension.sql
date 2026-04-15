-- Extend commit_venue_staging_item to persist hotel/B&B fields:
-- accommodation_type, booking_url, star_rating, amenities, platform_ids, lgbtq tags.
-- Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.commit_venue_staging_item(
  p_staging_id UUID,
  p_actor TEXT DEFAULT 'pipeline-commit'
)
RETURNS TABLE(venue_id UUID, action TEXT)
LANGUAGE plpgsql SET search_path = public, extensions AS $$
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
  -- hotel fields
  v_acc_type    TEXT;
  v_booking_url TEXT;
  v_stars       NUMERIC;
  v_amenities   TEXT[];
  v_platform    JSONB;
  v_lgbtq_tags  TEXT[];
  v_existing_tags TEXT[];
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

  -- Hotel-aware extracts (NULL-safe; only used when accommodation_type present).
  v_acc_type    := nullif(btrim(v_norm->>'accommodation_type'), '');
  v_booking_url := nullif(btrim(coalesce(v_norm->>'booking_url', v_enr->>'booking_url')), '');
  v_stars       := nullif(v_norm->>'star_rating','')::numeric;
  v_platform    := coalesce(v_norm->'platform_ids', '{}'::jsonb);

  IF jsonb_typeof(v_norm->'amenities') = 'array' THEN
    SELECT array_agg(value) INTO v_amenities
    FROM jsonb_array_elements_text(v_norm->'amenities');
  END IF;

  IF jsonb_typeof(v_norm->'lgbtq_markers') = 'array' THEN
    SELECT array_agg(value) INTO v_lgbtq_tags
    FROM jsonb_array_elements_text(v_norm->'lgbtq_markers');
  END IF;

  IF v_name IS NULL THEN RAISE EXCEPTION 'venue_missing_name: staging=%', p_staging_id; END IF;

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
      accommodation_type, booking_url, star_rating, amenities, platform_ids,
      data_source, external_id, last_synced_at, last_refreshed_at, created_at, updated_at
    ) VALUES (
      v_name, v_description, coalesce(v_address, v_name),
      coalesce(nullif(v_loc->>'city',''), ''),
      coalesce(nullif(v_loc->>'country',''), ''),
      v_lat, v_lng, v_phone, v_email, v_website, v_category, v_city_id,
      v_acc_type, v_booking_url, v_stars,
      coalesce(v_amenities, ARRAY[]::text[]),
      v_platform,
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
      accommodation_type = coalesce(accommodation_type, v_acc_type),
      booking_url = coalesce(booking_url, v_booking_url),
      star_rating = coalesce(star_rating, v_stars),
      amenities   = CASE
                      WHEN v_amenities IS NOT NULL AND array_length(v_amenities,1) > 0
                      THEN ARRAY(SELECT DISTINCT unnest(coalesce(amenities, ARRAY[]::text[]) || v_amenities))
                      ELSE amenities
                    END,
      platform_ids = coalesce(platform_ids, '{}'::jsonb) || v_platform,
      last_refreshed_at = now(), updated_at = now()
    WHERE id = v_existing_id;
    v_result_id := v_existing_id;
    v_action    := 'updated';
  END IF;

  -- LGBTQ tags merge into venues.tags[]
  IF v_lgbtq_tags IS NOT NULL AND array_length(v_lgbtq_tags,1) > 0 THEN
    SELECT tags INTO v_existing_tags FROM public.venues WHERE id = v_result_id;
    UPDATE public.venues
    SET tags = ARRAY(SELECT DISTINCT unnest(coalesce(v_existing_tags, ARRAY[]::text[]) || v_lgbtq_tags))
    WHERE id = v_result_id;
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
          jsonb_build_object('source_slug', v_source_slug, 'source_entity_id', v_source_eid,
                             'action', v_action, 'accommodation_type', v_acc_type));

  RETURN QUERY SELECT v_result_id, v_action;
END;
$$;

GRANT EXECUTE ON FUNCTION public.commit_venue_staging_item(UUID, TEXT) TO authenticated, service_role;
