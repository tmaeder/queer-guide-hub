-- Venue commit fn — final fixes
-- 1. Resolve "column reference venue_id is ambiguous" (OUT param vs table column)
-- 2. Normalize venue.category via whitelist mapper (source values like "Bar / Club" rejected by check)
-- Mirrors prod state 2026-04-14.

CREATE OR REPLACE FUNCTION public.normalize_venue_category(c TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(c, ''))
    WHEN 'bar / club' THEN 'bar'
    WHEN 'bar/club'   THEN 'bar'
    WHEN 'bar'        THEN 'bar'
    WHEN 'club'       THEN 'club'
    WHEN 'restaurant' THEN 'restaurant'
    WHEN 'cafe'       THEN 'restaurant'
    WHEN 'café'       THEN 'restaurant'
    WHEN 'hotel'      THEN 'hotel'
    WHEN 'sauna'      THEN 'sauna'
    WHEN 'theater'    THEN 'theater'
    WHEN 'theatre'    THEN 'theater'
    WHEN 'community center' THEN 'community_center'
    WHEN 'community_center' THEN 'community_center'
    WHEN 'organization'     THEN 'organization'
    WHEN 'non-profit'       THEN 'organization'
    WHEN 'event venue'      THEN 'event-venue'
    WHEN 'event-venue'      THEN 'event-venue'
    WHEN 'gallery'          THEN 'gallery'
    WHEN 'museum'           THEN 'gallery'
    WHEN 'shop'             THEN 'other'
    WHEN 'store'            THEN 'other'
    WHEN 'sexclub'          THEN 'club'
    WHEN 'cruising'         THEN 'other'
    WHEN 'cinema'           THEN 'theater'
    ELSE 'other'
  END;
$$;

CREATE OR REPLACE FUNCTION public.commit_venue_staging_item(
  p_staging_id UUID,
  p_actor TEXT DEFAULT 'pipeline-commit'
)
RETURNS TABLE(venue_id UUID, action TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_stage RECORD; v_norm JSONB; v_enr JSONB; v_loc JSONB; v_contacts JSONB; v_meta JSONB;
  v_source_slug TEXT; v_source_eid TEXT;
  v_phone TEXT; v_email TEXT; v_website TEXT; v_phone_n TEXT; v_email_n TEXT; v_domain TEXT;
  v_name TEXT; v_existing_id UUID; v_city_id UUID;
  v_lat NUMERIC; v_lng NUMERIC; v_address TEXT; v_category TEXT; v_description TEXT;
  v_payload JSONB; v_hash TEXT; v_lock_key BIGINT; v_action TEXT; v_result_id UUID;
BEGIN
  SELECT * INTO v_stage FROM public.ingestion_staging WHERE id = p_staging_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staging_item_not_found: %', p_staging_id; END IF;
  IF v_stage.target_table <> 'venues' THEN RAISE EXCEPTION 'not_a_venue_staging_item: target=%', v_stage.target_table; END IF;
  IF v_stage.disposition IN ('inserted','updated','committed') THEN
    venue_id := v_stage.target_record_id; action := 'noop'; RETURN NEXT; RETURN;
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
  v_category    := public.normalize_venue_category(coalesce(nullif(v_norm->>'category',''), 'other'));

  v_phone   := nullif(btrim(v_contacts->>'phone'), '');
  v_email   := nullif(btrim(v_contacts->>'email'), '');
  v_website := nullif(btrim(v_contacts->>'website'), '');
  v_phone_n := public.normalize_phone(v_phone);
  v_email_n := lower(v_email);
  v_domain  := public.extract_website_domain(v_website);

  v_source_slug := coalesce(v_stage.source_name, v_stage.source_type, 'unknown');
  v_source_eid  := coalesce(v_stage.source_entity_id, v_meta->>'id', v_meta->>'external_id', v_meta->>'source_id');

  IF v_name IS NULL THEN RAISE EXCEPTION 'venue_missing_name: staging=%', p_staging_id; END IF;

  v_lock_key := hashtextextended(coalesce(v_phone_n, v_email_n, v_domain, public.normalize_name(v_name)), 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF v_source_eid IS NOT NULL THEN
    SELECT vs.venue_id INTO v_existing_id FROM public.venue_sources vs
    WHERE vs.source_slug = v_source_slug AND vs.source_entity_id = v_source_eid LIMIT 1;
  END IF;
  IF v_existing_id IS NULL AND v_stage.dedup_match_id IS NOT NULL
     AND coalesce(v_stage.dedup_match_table,'venues') = 'venues'
     AND v_stage.dedup_status IN ('duplicate','merge_candidate') THEN
    v_existing_id := v_stage.dedup_match_id;
  END IF;
  IF v_loc->>'city' IS NOT NULL AND length(btrim(v_loc->>'city')) > 0 THEN
    SELECT c.id INTO v_city_id FROM public.cities c
    WHERE lower(c.name) = lower(btrim(v_loc->>'city')) LIMIT 1;
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
    INSERT INTO public.venue_sources AS vs (
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

  venue_id := v_result_id; action := v_action; RETURN NEXT;
END;
$$;
