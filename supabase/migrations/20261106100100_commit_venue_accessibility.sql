-- commit_venue_staging_item never wrote accessibility_attributes
--
-- The fifth layer of the contract gap in docs/architecture/open-data-integration.md
-- §1.7, and the one that document does not name. It traces four layers —
-- NormalizedItem has no accessibility field, source-osm-venue reads only
-- `wheelchair === 'yes'` and pushes it into venues.tags, pipeline-normalize never
-- emits the field, and venue-consensus.ts reads a path nothing populates — but
-- commit is where the chain actually terminates: this function writes name, geo,
-- contacts, category, tags, images, hours and relevance, and NOTHING else. So
-- even with all four upstream layers fixed, an accessibility claim staged by a
-- source would still never reach a venue row.
--
-- Body verbatim from 20260915131700 with the accessibility arm added.
--
-- TWO GUARDS ON THE WAY IN, both non-negotiable for this column:
--   * default-reject against public.amenities (kind='accessibility', is_active).
--     A slug outside the vocabulary is dropped rather than written, exactly as
--     normalize_venue_tags() does for tags — the 2,020-distinct-value amenity
--     mess is what that convention exists to prevent.
--   * resolve_accessibility_conflicts(), so a source that ships both halves of a
--     pair cannot publish "wheelchair accessible" and "not wheelchair accessible"
--     on one venue. trg_venues_accessibility_resolve would also catch it; doing
--     it here as well means the value is correct even if the trigger is ever
--     dropped, and keeps the merge arm below honest about what it unioned.
--
-- The UPDATE arm UNIONS rather than coalescing, matching tags/images: a second
-- source corroborating an accommodation must not silently lose to whatever
-- landed first. The union is then re-resolved, because unioning two individually
-- clean arrays is precisely how a contradiction gets created.
--
-- amenities is deliberately NOT added here. It has its own engine
-- (amenity-truth-backfill, hourly) and its own normalizer; wiring a second
-- writer for it belongs with that engine, not in a migration about access claims.

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
  v_country_code TEXT;
  v_description TEXT;
  v_hours       JSONB;
  v_tags        TEXT[];
  v_images      TEXT[];
  v_access      TEXT[];
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
  -- Coerce to the venues_category_check vocabulary. This must handle a
  -- present-but-INVALID value, not just a missing one: sources shipped
  -- 'community-center' (hyphen; the member is 'community_center') and
  -- 'nightclub' (the member is 'club'), and a bad value rejects the whole row
  -- exactly like a missing one. Separator drift is repaired, anything still
  -- unrecognised degrades to 'other'. Deliberately NOT a synonym table:
  -- semantic mapping belongs in _shared/venue-category.ts where it is
  -- testable; this is only the backstop that keeps the class non-fatal.
  v_category    := lower(btrim(coalesce(nullif(v_norm->>'category',''), 'other')));
  v_category    := replace(replace(v_category, ' ', '_'), '-', '_');
  IF v_category = 'event_venue' THEN v_category := 'event-venue'; END IF;
  IF v_category NOT IN ('bar','club','cafe','restaurant','hotel','sauna','cruising',
                        'outdoor','shop','community_center','organization','event-venue',
                        'theater','gallery','salon','gym','toilet','other') THEN
    v_category := 'other';
  END IF;

  -- Accept `postcode` as well as `postal_code`: source-osm-venue emits the
  -- former, and pipeline-normalize now canonicalises to the latter.
  v_state  := nullif(btrim(coalesce(v_loc->>'state', v_loc->>'region', v_norm->>'state')), '');
  v_postal := nullif(btrim(coalesce(v_loc->>'postal_code', v_loc->>'postcode', v_norm->>'postal_code')), '');

  v_hours  := CASE WHEN jsonb_typeof(v_norm->'hours') = 'object' THEN v_norm->'hours' END;
  -- Default-reject scraper tag noise against the controlled vocabulary so it can
  -- never re-enter venues.tags via ingestion (see normalize_venue_tags).
  v_tags   := CASE WHEN jsonb_typeof(v_norm->'tags')   = 'array'
                   THEN public.normalize_venue_tags(array(SELECT jsonb_array_elements_text(v_norm->'tags'))) END;
  v_images := CASE WHEN jsonb_typeof(v_norm->'images') = 'array'
                   THEN array(SELECT jsonb_array_elements_text(v_norm->'images')) END;
  -- Default-reject against the controlled vocabulary, then settle any pair the
  -- source shipped. An unknown slug is dropped, never written and left to be
  -- filtered by a reader that may not exist.
  v_access := CASE WHEN jsonb_typeof(v_norm->'accessibility_attributes') = 'array'
                   THEN public.resolve_accessibility_conflicts(array(
                          SELECT x FROM jsonb_array_elements_text(v_norm->'accessibility_attributes') x
                          WHERE EXISTS (SELECT 1 FROM public.amenities a
                                        WHERE a.slug = x AND a.kind = 'accessibility' AND a.is_active)))
              END;
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

  -- Country resolves INDEPENDENTLY of city. This lookup used to sit inside the
  -- `IF city IS NOT NULL` block below, so a staged venue carrying a country but
  -- no city text fell straight through and committed with country_id = NULL.
  IF nullif(btrim(v_loc->>'country'),'') IS NOT NULL THEN
    SELECT id, code INTO v_country_id, v_country_code FROM public.countries
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
      hours, tags, images, accessibility_attributes, lgbti_relevance_score,
      data_source, external_id, last_synced_at, last_refreshed_at, created_at, updated_at
    ) VALUES (
      v_name, v_description, coalesce(v_address, v_name),
      nullif(v_loc->>'city',''),
      -- The resolved country's ISO-2 code, not the raw text. The lookup above
      -- already matches on code OR NAME, so a source sending "Germany" has a
      -- perfectly good countries row in hand — writing the raw text instead
      -- just fails venues_country_iso2_check. Falls back to the raw value only
      -- when nothing resolved (and NULL when it is blank).
      coalesce(v_country_code, nullif(btrim(v_loc->>'country'), '')),
      v_lat, v_lng, v_phone, v_email, v_website, v_category, v_city_id, v_country_id, v_state, v_postal,
      v_hours, v_tags, v_images, v_access, v_relevance,
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
      -- Union, then re-resolve: two individually clean arrays merged together is
      -- exactly how a contradicting pair comes into existence.
      accessibility_attributes = CASE WHEN v_access IS NULL THEN accessibility_attributes
                         ELSE public.resolve_accessibility_conflicts(
                                array(SELECT DISTINCT e FROM unnest(coalesce(accessibility_attributes,'{}'::text[]) || v_access) e
                                      WHERE e IS NOT NULL AND e <> '')) END,
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
$function$
;
