-- Shadow-mode field-conflict logging in commit_venue_staging_item.
-- Computes resolve_field_conflict() for each conflicting field on UPDATE
-- and persists to venue_field_conflicts. Actual commit semantics are
-- UNCHANGED (still first-write-wins coalesce). Goal: 1-2 weeks of data
-- to validate that resolve_field_conflict picks the right value before
-- flipping commit semantics field-by-field.

-- Add staging_id + existing_value + would_overwrite columns to make
-- the audit trail useful for review.
ALTER TABLE public.venue_field_conflicts
  ADD COLUMN IF NOT EXISTS staging_id UUID,
  ADD COLUMN IF NOT EXISTS existing_value JSONB,
  ADD COLUMN IF NOT EXISTS would_overwrite BOOLEAN,
  ADD COLUMN IF NOT EXISTS shadow_mode BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_venue_field_conflicts_venue_field
  ON public.venue_field_conflicts (venue_id, field_name, resolved_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_field_conflicts_would_overwrite
  ON public.venue_field_conflicts (would_overwrite, resolved_at DESC)
  WHERE would_overwrite = true;

-- Helper: log a single field conflict (no-op if both values are the same)
CREATE OR REPLACE FUNCTION public.log_venue_field_conflict(
  p_venue_id      UUID,
  p_staging_id    UUID,
  p_field_name    TEXT,
  p_existing_val  TEXT,
  p_existing_src  TEXT,
  p_existing_age_days NUMERIC,
  p_incoming_val  TEXT,
  p_incoming_src  TEXT
) RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_existing JSONB := to_jsonb(p_existing_val);
  v_incoming JSONB := to_jsonb(p_incoming_val);
  v_variants JSONB;
  v_resolved JSONB;
BEGIN
  IF p_incoming_val IS NULL OR length(btrim(p_incoming_val)) = 0 THEN RETURN; END IF;
  IF p_existing_val IS NULL OR length(btrim(p_existing_val)) = 0 THEN RETURN; END IF;
  IF p_existing_val = p_incoming_val THEN RETURN; END IF;

  v_variants := jsonb_build_array(
    jsonb_build_object('source', p_existing_src, 'value', v_existing, 'recency_days', p_existing_age_days),
    jsonb_build_object('source', p_incoming_src, 'value', v_incoming, 'recency_days', 0)
  );
  v_resolved := public.resolve_field_conflict(v_variants, 'venue');

  INSERT INTO public.venue_field_conflicts (
    venue_id, staging_id, field_name,
    existing_value, resolved_value, resolved_source,
    variants, would_overwrite, shadow_mode, resolved_at
  ) VALUES (
    p_venue_id, p_staging_id, p_field_name,
    v_existing,
    v_resolved->'resolved_value',
    v_resolved->>'resolved_source',
    v_variants,
    coalesce((v_resolved->>'resolved_source') <> p_existing_src, false),
    TRUE,
    now()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_venue_field_conflict(UUID,UUID,TEXT,TEXT,TEXT,NUMERIC,TEXT,TEXT) TO service_role;

-- Patch commit_venue_staging_item to call the logger before UPDATE.
CREATE OR REPLACE FUNCTION public.commit_venue_staging_item(p_staging_id uuid, p_actor text DEFAULT 'pipeline'::text)
 RETURNS TABLE(venue_id uuid, action text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
DECLARE
  v_stage RECORD; v_norm JSONB; v_enr JSONB; v_loc JSONB; v_contacts JSONB; v_meta JSONB;
  v_source_slug TEXT; v_source_eid TEXT;
  v_phone TEXT; v_email TEXT; v_website TEXT; v_phone_n TEXT; v_email_n TEXT; v_domain TEXT;
  v_name TEXT; v_existing_id UUID; v_city_id UUID; v_lat NUMERIC; v_lng NUMERIC;
  v_address TEXT; v_category TEXT; v_description TEXT;
  v_payload JSONB; v_hash TEXT; v_lock_key BIGINT; v_action TEXT; v_result_id UUID;
  v_acc_type TEXT; v_booking_url TEXT; v_stars NUMERIC;
  v_amenities TEXT[]; v_platform JSONB; v_lgbtq_tags TEXT[]; v_existing_tags TEXT[];
  v_valid_categories CONSTANT TEXT[] := ARRAY['bar','club','restaurant','hotel','sauna','theater','community_center','organization','event-venue','gallery','other'];
  v_old_desc TEXT; v_old_addr TEXT; v_old_phone TEXT; v_old_email TEXT; v_old_site TEXT;
  v_old_src TEXT; v_old_age NUMERIC;
BEGIN
  SELECT * INTO v_stage FROM public.ingestion_staging WHERE id = p_staging_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staging_item_not_found: %', p_staging_id; END IF;
  IF v_stage.target_table <> 'venues' THEN RAISE EXCEPTION 'not_a_venue_staging_item: target=%', v_stage.target_table; END IF;
  IF v_stage.disposition IN ('inserted','updated','committed','rejected') THEN
    RETURN QUERY SELECT v_stage.target_record_id, 'noop'::text; RETURN;
  END IF;
  v_norm := coalesce(v_stage.normalized_data, '{}'::jsonb);
  v_enr := coalesce(v_stage.enriched_data, '{}'::jsonb);
  v_loc := coalesce(v_norm->'location', '{}'::jsonb);
  v_contacts := coalesce(v_norm->'contacts', '{}'::jsonb);
  v_meta := coalesce(v_norm->'metadata', v_stage.raw_data, '{}'::jsonb);
  v_name := nullif(btrim(v_norm->>'name'), '');
  v_description := nullif(btrim(coalesce(v_norm->>'description', v_enr->>'description')), '');
  v_address := nullif(btrim(v_loc->>'address'), '');
  v_lat := nullif(v_loc->>'lat','')::numeric;
  v_lng := nullif(v_loc->>'lng','')::numeric;
  v_category := lower(coalesce(nullif(v_norm->>'category',''), ''));
  IF NOT (v_category = ANY(v_valid_categories)) THEN v_category := 'other'; END IF;
  v_phone := nullif(btrim(v_contacts->>'phone'), '');
  v_email := nullif(btrim(v_contacts->>'email'), '');
  v_website := nullif(btrim(v_contacts->>'website'), '');
  v_phone_n := public.normalize_phone(v_phone);
  v_email_n := lower(v_email);
  v_domain := public.extract_website_domain(v_website);
  v_source_slug := coalesce(v_stage.source_name, v_stage.source_type, 'unknown');
  v_source_eid := coalesce(v_stage.source_entity_id, v_meta->>'id', v_meta->>'external_id', v_meta->>'source_id');
  v_acc_type := nullif(btrim(v_norm->>'accommodation_type'), '');
  v_booking_url := nullif(btrim(coalesce(v_norm->>'booking_url', v_enr->>'booking_url')), '');
  v_stars := nullif(v_norm->>'star_rating','')::numeric;
  v_platform := coalesce(v_norm->'platform_ids', '{}'::jsonb);
  IF jsonb_typeof(v_norm->'amenities') = 'array' THEN
    SELECT array_agg(value) INTO v_amenities FROM jsonb_array_elements_text(v_norm->'amenities');
  END IF;
  IF jsonb_typeof(v_norm->'lgbtq_markers') = 'array' THEN
    SELECT array_agg(value) INTO v_lgbtq_tags FROM jsonb_array_elements_text(v_norm->'lgbtq_markers');
  END IF;
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
    SELECT c.id INTO v_city_id FROM public.cities c WHERE lower(c.name) = lower(btrim(v_loc->>'city')) LIMIT 1;
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
      coalesce(nullif(v_loc->>'city',''), ''), coalesce(nullif(v_loc->>'country',''), ''),
      v_lat, v_lng, v_phone, v_email, v_website, v_category, v_city_id,
      v_acc_type, v_booking_url, v_stars,
      coalesce(v_amenities, ARRAY[]::text[]), v_platform,
      v_source_slug, v_source_eid, now(), now(), now(), now()
    ) RETURNING venues.id INTO v_result_id;
    v_action := 'inserted';
  ELSE
    SELECT description, address, phone, email, website,
           data_source, EXTRACT(EPOCH FROM (now() - updated_at))/86400.0
      INTO v_old_desc, v_old_addr, v_old_phone, v_old_email, v_old_site,
           v_old_src, v_old_age
    FROM public.venues WHERE venues.id = v_existing_id;

    PERFORM public.log_venue_field_conflict(v_existing_id, p_staging_id,
      'description', v_old_desc, v_old_src, v_old_age, v_description, v_source_slug);
    PERFORM public.log_venue_field_conflict(v_existing_id, p_staging_id,
      'address',     v_old_addr, v_old_src, v_old_age, v_address,     v_source_slug);
    PERFORM public.log_venue_field_conflict(v_existing_id, p_staging_id,
      'phone',       v_old_phone, v_old_src, v_old_age, v_phone,      v_source_slug);
    PERFORM public.log_venue_field_conflict(v_existing_id, p_staging_id,
      'email',       v_old_email, v_old_src, v_old_age, v_email,      v_source_slug);
    PERFORM public.log_venue_field_conflict(v_existing_id, p_staging_id,
      'website',     v_old_site,  v_old_src, v_old_age, v_website,    v_source_slug);

    UPDATE public.venues SET
      description = coalesce(description, v_description),
      address = coalesce(nullif(address,''), v_address, address),
      phone = coalesce(phone, v_phone),
      email = coalesce(email, v_email),
      website = coalesce(website, v_website),
      latitude = coalesce(latitude, v_lat),
      longitude = coalesce(longitude, v_lng),
      city_id = coalesce(city_id, v_city_id),
      accommodation_type = coalesce(accommodation_type, v_acc_type),
      booking_url = coalesce(booking_url, v_booking_url),
      star_rating = coalesce(star_rating, v_stars),
      amenities = CASE WHEN v_amenities IS NOT NULL AND array_length(v_amenities,1) > 0
                       THEN ARRAY(SELECT DISTINCT unnest(coalesce(amenities, ARRAY[]::text[]) || v_amenities))
                       ELSE amenities END,
      platform_ids = coalesce(platform_ids, '{}'::jsonb) || v_platform,
      last_refreshed_at = now(), updated_at = now()
    WHERE venues.id = v_existing_id;
    v_result_id := v_existing_id; v_action := 'updated';
  END IF;
  IF v_lgbtq_tags IS NOT NULL AND array_length(v_lgbtq_tags,1) > 0 THEN
    SELECT v.tags INTO v_existing_tags FROM public.venues v WHERE v.id = v_result_id;
    UPDATE public.venues
    SET tags = ARRAY(SELECT DISTINCT unnest(coalesce(v_existing_tags, ARRAY[]::text[]) || v_lgbtq_tags))
    WHERE venues.id = v_result_id;
  END IF;
  IF v_source_eid IS NOT NULL THEN
    INSERT INTO public.venue_sources (
      venue_id, source_slug, source_entity_id, source_url, payload, payload_hash,
      confidence, is_primary, first_seen_at, last_seen_at
    ) VALUES (
      v_result_id, v_source_slug, v_source_eid, nullif(btrim(v_meta->>'url'), ''),
      v_payload, v_hash, coalesce(v_stage.ai_confidence_score, 1.0),
      v_action = 'inserted', now(), now()
    ) ON CONFLICT (source_slug, source_entity_id) DO UPDATE SET
      payload = EXCLUDED.payload, payload_hash = EXCLUDED.payload_hash,
      confidence = EXCLUDED.confidence, last_seen_at = now();
  END IF;
  UPDATE public.ingestion_staging SET
    disposition = v_action, target_record_id = v_result_id,
    processed_at = now(), updated_at = now()
  WHERE ingestion_staging.id = p_staging_id;
  INSERT INTO public.ingestion_events (staging_id, venue_id, stage, old_status, new_status, actor, payload)
  VALUES (p_staging_id, v_result_id, 'commit', v_stage.disposition, v_action, p_actor,
          jsonb_build_object('source_slug', v_source_slug, 'source_entity_id', v_source_eid,
                             'action', v_action, 'accommodation_type', v_acc_type));
  RETURN QUERY SELECT v_result_id, v_action;
END;
$function$;
