CREATE OR REPLACE FUNCTION public.commit_venue_staging_item(p_staging_id uuid, p_actor text DEFAULT 'pipeline-commit'::text)
 RETURNS TABLE(venue_id uuid, action text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
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
  v_country_id  UUID;
  v_lat         NUMERIC;
  v_lng         NUMERIC;
  v_address     TEXT;
  v_state       TEXT;
  v_postal      TEXT;
  v_category    TEXT;
  v_description TEXT;
  v_hours       JSONB;
  v_tags        TEXT[];
  v_images      TEXT[];
  v_relevance   NUMERIC;
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

  v_state  := nullif(btrim(coalesce(v_loc->>'state', v_loc->>'region', v_norm->>'state')), '');
  v_postal := nullif(btrim(coalesce(v_loc->>'postal_code', v_loc->>'postcode', v_norm->>'postal_code')), '');

  v_hours  := CASE WHEN jsonb_typeof(v_norm->'hours') = 'object' THEN v_norm->'hours' END;
  v_tags   := CASE WHEN jsonb_typeof(v_norm->'tags')   = 'array'
                   THEN public.normalize_venue_tags(array(SELECT jsonb_array_elements_text(v_norm->'tags'))) END;
  v_images := CASE WHEN jsonb_typeof(v_norm->'images') = 'array'
                   THEN array(SELECT jsonb_array_elements_text(v_norm->'images')) END;
  v_relevance := nullif(coalesce(
                   v_norm->>'lgbti_relevance_score',
                   v_enr->>'lgbtq_relevance_score',
                   v_enr->>'lgbti_relevance_score'), '')::numeric;

  v_phone   := nullif(btrim(v_contacts->>'phone'), '');
  v_email   := nullif(btrim(v_contacts->>'email'), '');
  v_website := nullif(btrim(v_contacts->>'website'), '');
  v_phone_n := public.normalize_phone(v_phone);
  v_email_n := lower(v_email);
  v_domain  := public.extract_website_domain(v_website);

  v_source_slug := coalesce(v_stage.source_name, v_stage.source_type, 'unknown');
  v_source_eid  := coalesce(v_stage.source_entity_id, v_meta->>'id', v_meta->>'external_id', v_meta->>'source_id');

  IF v_name IS NULL THEN RAISE EXCEPTION 'venue_missing_name: staging=%', p_staging_id; END IF;

  v_lock_key := hashtextextended(
    coalesce(v_phone_n, v_email_n, v_domain, public.normalize_name(v_name)), 0
  );
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

  IF nullif(btrim(v_loc->>'country'),'') IS NOT NULL THEN
    SELECT id INTO v_country_id FROM public.countries
    WHERE duplicate_of_id IS NULL
      AND (upper(code) = upper(btrim(v_loc->>'country'))
           OR lower(name) = lower(btrim(v_loc->>'country')))
    LIMIT 1;
  END IF;

  IF v_loc->>'city' IS NOT NULL AND length(btrim(v_loc->>'city')) > 0 THEN
    IF v_country_id IS NOT NULL THEN
      SELECT c.id INTO v_city_id FROM public.cities c
      WHERE lower(c.name) = lower(btrim(v_loc->>'city'))
        AND c.country_id = v_country_id
        AND c.duplicate_of_id IS NULL
        AND (c.slug IS NULL OR c.slug NOT LIKE 'tmp-%')
      ORDER BY c.population DESC NULLS LAST
      LIMIT 1;
    END IF;

    IF v_city_id IS NULL THEN
      SELECT c.id INTO v_city_id FROM public.cities c
      WHERE lower(c.name) = lower(btrim(v_loc->>'city'))
        AND c.duplicate_of_id IS NULL
        AND (c.slug IS NULL OR c.slug NOT LIKE 'tmp-%')
      ORDER BY c.population DESC NULLS LAST
      LIMIT 1;
    END IF;
  END IF;

  v_payload := jsonb_build_object('raw', v_stage.raw_data, 'normalized', v_norm, 'enriched', v_enr);
  v_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');

  IF v_existing_id IS NULL THEN
    INSERT INTO public.venues (
      name, description, address, city, country, latitude, longitude,
      phone, email, website, category, city_id, country_id, state, postal_code,
      hours, tags, images, lgbti_relevance_score,
      data_source, external_id, last_synced_at, last_refreshed_at, created_at, updated_at
    ) VALUES (
      v_name, v_description, coalesce(v_address, v_name),
      nullif(v_loc->>'city',''),
      coalesce(nullif(v_loc->>'country',''), ''),
      v_lat, v_lng, v_phone, v_email, v_website, v_category, v_city_id, v_country_id, v_state, v_postal,
      v_hours, v_tags, v_images, v_relevance,
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
      country_id  = coalesce(country_id, v_country_id),
      state       = coalesce(state, v_state),
      postal_code = coalesce(postal_code, v_postal),
      hours       = coalesce(hours, v_hours),
      lgbti_relevance_score = coalesce(lgbti_relevance_score, v_relevance),
      category    = CASE WHEN coalesce(lower(category),'') IN ('','other','unknown')
                          AND v_category NOT IN ('unknown','other')
                         THEN v_category ELSE category END,
      tags        = CASE WHEN v_tags IS NULL THEN tags
                         ELSE public.normalize_venue_tags(
                                array(SELECT DISTINCT e FROM unnest(coalesce(tags,'{}'::text[]) || v_tags) e
                                      WHERE e IS NOT NULL AND e <> '')) END,
      images      = CASE WHEN v_images IS NULL THEN images
                         ELSE array(SELECT DISTINCT e FROM unnest(coalesce(images,'{}'::text[]) || v_images) e
                                    WHERE e IS NOT NULL AND e <> '') END,
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
$function$;


CREATE OR REPLACE FUNCTION public.commit_event_staging_item(p_staging_id uuid, p_actor text DEFAULT 'pipeline-commit'::text)
 RETURNS TABLE(event_id uuid, action text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_stage       RECORD;
  v_norm        JSONB;
  v_enr         JSONB;
  v_loc         JSONB;
  v_meta        JSONB;
  v_source_slug TEXT;
  v_source_eid  TEXT;
  v_title       TEXT;
  v_description TEXT;
  v_event_type  TEXT;
  v_start       TIMESTAMPTZ;
  v_end         TIMESTAMPTZ;
  v_venue_id    UUID;
  v_city        TEXT;
  v_country     TEXT;
  v_address     TEXT;
  v_state       TEXT;
  v_postal      TEXT;
  v_city_id     UUID;
  v_country_id  UUID;
  v_lat         NUMERIC;
  v_lng         NUMERIC;
  v_website     TEXT;
  v_ticket_url  TEXT;
  v_edition     TEXT;
  v_timezone    TEXT;
  v_images      TEXT[];
  v_existing_id UUID;
  v_payload     JSONB;
  v_hash        TEXT;
  v_lock_key    BIGINT;
  v_action      TEXT;
  v_result_id   UUID;
BEGIN
  SELECT * INTO v_stage FROM public.ingestion_staging WHERE id = p_staging_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staging_item_not_found: %', p_staging_id; END IF;
  IF v_stage.target_table <> 'events' THEN RAISE EXCEPTION 'not_an_event_staging_item: target=%', v_stage.target_table; END IF;
  IF v_stage.disposition IN ('inserted','updated','committed','rejected') THEN
    event_id := v_stage.target_record_id; action := 'noop'; RETURN NEXT; RETURN;
  END IF;

  v_norm := coalesce(v_stage.normalized_data, '{}'::jsonb);
  v_enr  := coalesce(v_stage.enriched_data,   '{}'::jsonb);
  v_loc  := coalesce(v_norm->'location', '{}'::jsonb);
  v_meta := coalesce(v_norm->'metadata', v_stage.raw_data, '{}'::jsonb);

  v_title       := nullif(btrim(v_norm->>'title'), '');
  v_description := nullif(btrim(coalesce(v_norm->>'description', v_enr->>'description')), '');
  v_event_type  := coalesce(nullif(v_norm->>'event_type',''), 'other');
  v_start       := nullif(v_norm->>'start_date','')::timestamptz;
  v_end         := nullif(v_norm->>'end_date','')::timestamptz;
  v_venue_id    := nullif(v_norm->>'venue_id','')::uuid;
  v_city        := nullif(btrim(coalesce(v_loc->>'city', v_norm->>'city')), '');
  v_country     := nullif(btrim(coalesce(v_loc->>'country', v_norm->>'country')), '');
  v_address     := nullif(btrim(coalesce(v_loc->>'address', v_norm->>'address')), '');
  v_state       := nullif(btrim(coalesce(v_loc->>'state', v_loc->>'region', v_norm->>'state')), '');
  v_postal      := nullif(btrim(coalesce(v_loc->>'postal_code', v_loc->>'postcode', v_norm->>'postal_code')), '');
  v_lat         := nullif(coalesce(v_loc->>'lat', v_norm->>'latitude'),'')::numeric;
  v_lng         := nullif(coalesce(v_loc->>'lng', v_norm->>'longitude'),'')::numeric;
  v_website     := nullif(btrim(v_norm->>'website'), '');
  v_ticket_url  := nullif(btrim(v_norm->>'ticket_url'), '');
  v_edition     := nullif(btrim(v_norm->>'edition'), '');
  v_timezone    := nullif(btrim(coalesce(v_loc->>'timezone', v_norm->>'timezone')), '');

  IF jsonb_typeof(v_norm->'images') = 'array' THEN
    SELECT array_agg(value::text) INTO v_images FROM jsonb_array_elements_text(v_norm->'images');
  END IF;

  v_source_slug := coalesce(v_stage.source_name, v_stage.source_type, 'unknown');
  v_source_eid  := coalesce(v_stage.source_entity_id, v_meta->>'id', v_meta->>'external_id', v_meta->>'source_id');

  IF v_title IS NULL THEN RAISE EXCEPTION 'event_missing_title: staging=%', p_staging_id; END IF;
  IF v_start IS NULL THEN RAISE EXCEPTION 'event_missing_start_date: staging=%', p_staging_id; END IF;

  v_lock_key := hashtextextended(
    public.normalize_name(v_title) || '|' ||
    coalesce(v_venue_id::text, coalesce(v_city,'')) || '|' ||
    to_char(v_start, 'YYYY-MM-DD HH24'),
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF v_source_eid IS NOT NULL THEN
    SELECT es.event_id INTO v_existing_id FROM public.event_sources es
    WHERE es.source_slug = v_source_slug AND es.source_entity_id = v_source_eid LIMIT 1;
  END IF;

  IF v_existing_id IS NULL AND v_stage.dedup_match_id IS NOT NULL
     AND coalesce(v_stage.dedup_match_table,'events') = 'events'
     AND v_stage.dedup_status IN ('duplicate','merge_candidate') THEN
    v_existing_id := v_stage.dedup_match_id;
  END IF;

  IF v_venue_id IS NOT NULL THEN
    SELECT v.city_id, v.country_id INTO v_city_id, v_country_id
    FROM public.venues v WHERE v.id = v_venue_id;
  END IF;

  IF v_country_id IS NULL AND v_country IS NOT NULL THEN
    SELECT id INTO v_country_id FROM public.countries
    WHERE duplicate_of_id IS NULL
      AND (upper(code) = upper(v_country) OR lower(name) = lower(v_country))
    LIMIT 1;
  END IF;

  IF v_city_id IS NULL AND v_city IS NOT NULL THEN
    IF v_country_id IS NOT NULL THEN
      SELECT c.id INTO v_city_id FROM public.cities c
      WHERE lower(c.name) = lower(v_city)
        AND c.country_id = v_country_id
        AND c.duplicate_of_id IS NULL
        AND (c.slug IS NULL OR c.slug NOT LIKE 'tmp-%')
      ORDER BY c.population DESC NULLS LAST
      LIMIT 1;
    END IF;

    IF v_city_id IS NULL THEN
      SELECT c.id INTO v_city_id FROM public.cities c
      WHERE lower(c.name) = lower(v_city)
        AND c.duplicate_of_id IS NULL
        AND (c.slug IS NULL OR c.slug NOT LIKE 'tmp-%')
      ORDER BY c.population DESC NULLS LAST
      LIMIT 1;
    END IF;
  END IF;

  v_payload := jsonb_build_object('raw', v_stage.raw_data, 'normalized', v_norm, 'enriched', v_enr);
  v_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');

  IF v_existing_id IS NULL THEN
    INSERT INTO public.events (
      title, description, event_type, start_date, end_date,
      venue_id, venue_name, address, city, country,
      city_id, country_id, state, postal_code,
      latitude, longitude, website, ticket_url, edition,
      timezone, images,
      data_source, external_id, last_synced_at, last_refreshed_at,
      status, created_at, updated_at
    ) VALUES (
      v_title, v_description, v_event_type, v_start, v_end,
      v_venue_id, nullif(btrim(v_norm->>'venue_name'),''), v_address,
      coalesce(v_city, ''), coalesce(v_country, ''),
      v_city_id, v_country_id, v_state, v_postal,
      v_lat, v_lng, v_website, v_ticket_url, v_edition,
      v_timezone, v_images,
      v_source_slug, v_source_eid, now(), now(),
      'active', now(), now()
    ) RETURNING id INTO v_result_id;
    v_action := 'inserted';
  ELSE
    UPDATE public.events e SET
      description = coalesce(e.description, v_description),
      address     = coalesce(nullif(e.address,''), v_address, e.address),
      end_date    = coalesce(e.end_date, v_end),
      latitude    = coalesce(e.latitude, v_lat),
      longitude   = coalesce(e.longitude, v_lng),
      city_id     = coalesce(e.city_id, v_city_id),
      country_id  = coalesce(e.country_id, v_country_id),
      state       = coalesce(e.state, v_state),
      postal_code = coalesce(e.postal_code, v_postal),
      website     = coalesce(e.website, v_website),
      ticket_url  = coalesce(e.ticket_url, v_ticket_url),
      edition     = coalesce(e.edition, v_edition),
      timezone    = coalesce(e.timezone, v_timezone),
      images      = CASE WHEN array_length(e.images,1) IS NULL THEN v_images ELSE e.images END,
      last_refreshed_at = now(),
      updated_at  = now()
    WHERE e.id = v_existing_id;
    v_result_id := v_existing_id;
    v_action    := 'updated';
  END IF;

  IF v_source_eid IS NOT NULL THEN
    INSERT INTO public.event_sources AS es (
      event_id, source_slug, source_entity_id, source_url, payload, payload_hash,
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

  INSERT INTO public.ingestion_events (staging_id, stage, old_status, new_status, actor, payload)
  VALUES (p_staging_id, 'commit', v_stage.disposition, v_action, p_actor,
          jsonb_build_object('source_slug', v_source_slug, 'source_entity_id', v_source_eid,
                             'action', v_action, 'event_id', v_result_id, 'target_table', 'events'));

  event_id := v_result_id; action := v_action; RETURN NEXT;
END;
$function$;
