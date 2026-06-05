-- Fix cross-country city mislinks.
--
-- Root cause: city was resolved by NAME ONLY, with a "highest-population"
-- fallback that reached across countries. So a "Berlin, US" venue linked to
-- Berlin, Germany; "Durango, US" to Durango, Mexico; etc.
--
-- Unified rule (a city is NEVER linked to a different country than the source
-- asserts):
--   1. Resolve country (exact name -> ISO code).
--   2. Country known (source gave a resolvable country -> always trust it):
--      a. city of that name IN that country  -> use it
--      b. else                               -> caller creates it under that
--         country. We NEVER adopt a same-named city from another country, since
--         that is exactly what produced "Berlin, US" -> Berlin, Germany.
--   3. Country unknown:
--      a. population best-guess by name -> use it (+ its country). Only guess path.
--
-- Two functions fixed: resolve_city_and_country (pure resolver) and
-- commit_venue_staging_item (resolver + auto-create + sets venues.country_id).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. resolve_city_and_country — pure resolver, country-scoped
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_city_and_country(p_city_name text, p_country_name text)
RETURNS TABLE(resolved_city_id uuid, resolved_city_name text, resolved_country_id uuid,
              resolved_country_name text, city_found boolean, country_found boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_country_id   uuid;
  v_country_name text;
  v_city_id      uuid;
  v_city_name    text;
  v_uniq_cc      uuid;
BEGIN
  -- 1. Resolve country (exact name, then ISO code)
  SELECT c.id, c.name INTO v_country_id, v_country_name
  FROM countries c
  WHERE lower(c.name) = lower(p_country_name) AND c.duplicate_of_id IS NULL
  LIMIT 1;

  IF v_country_id IS NULL AND p_country_name IS NOT NULL AND length(p_country_name) <= 3 THEN
    SELECT c.id, c.name INTO v_country_id, v_country_name
    FROM countries c
    WHERE lower(c.code) = lower(p_country_name) AND c.duplicate_of_id IS NULL
    LIMIT 1;
  END IF;

  IF p_city_name IS NOT NULL AND p_city_name <> '' THEN
    -- 2a. City of that name in the resolved country
    IF v_country_id IS NOT NULL THEN
      SELECT ci.id, ci.name INTO v_city_id, v_city_name
      FROM cities ci
      WHERE lower(ci.name) = lower(p_city_name)
        AND ci.country_id = v_country_id
        AND ci.duplicate_of_id IS NULL
      ORDER BY ci.population DESC NULLS LAST
      LIMIT 1;

      -- alias within the resolved country
      IF v_city_id IS NULL THEN
        SELECT ci.id, ci.name INTO v_city_id, v_city_name
        FROM city_aliases ca
        JOIN cities ci ON ci.id = ca.city_id
        WHERE lower(ca.alias) = lower(p_city_name)
          AND ci.country_id = v_country_id
          AND ci.duplicate_of_id IS NULL
        LIMIT 1;
      END IF;
    END IF;

    -- 3. Country unknown -> population best-guess by name (adopt its country).
    --    When the country IS known, we deliberately do NOT fall back here:
    --    a missing in-country city is left NULL for the caller to create.
    IF v_city_id IS NULL AND v_country_id IS NULL THEN
      SELECT ci.id, ci.name, ci.country_id INTO v_city_id, v_city_name, v_uniq_cc
      FROM cities ci
      WHERE lower(ci.name) = lower(p_city_name) AND ci.duplicate_of_id IS NULL
      ORDER BY ci.population DESC NULLS LAST
      LIMIT 1;
      IF v_city_id IS NOT NULL AND v_uniq_cc IS NOT NULL THEN
        SELECT c.id, c.name INTO v_country_id, v_country_name
        FROM countries c WHERE c.id = v_uniq_cc LIMIT 1;
      END IF;
    END IF;

    -- Country known + name ambiguous + no in-country row -> city left NULL
    -- (resolve-or-create-city / commit_venue_staging_item will create it).
  END IF;

  RETURN QUERY SELECT v_city_id, v_city_name, v_country_id, v_country_name,
    (v_city_id IS NOT NULL), (v_country_id IS NOT NULL);
END;
$$;

ALTER FUNCTION public.resolve_city_and_country(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.resolve_city_and_country(text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_city_and_country(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_city_and_country(text, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. commit_venue_staging_item — country-scoped city link + auto-create +
--    sets venues.country_id (was never set before).
--    Based on 20260427130000_venue_commit_organizer_plumbing.sql.
-- ─────────────────────────────────────────────────────────────────────────
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
  v_country_id  UUID;
  v_city_txt    TEXT;
  v_country_txt TEXT;
  v_uniq_cc     UUID;
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
  v_is_org      BOOLEAN;
  v_org_handles JSONB;
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

  v_is_org      := coalesce((v_norm->>'is_organizer')::boolean,
                            (v_enr->>'is_organizer')::boolean,
                            false);
  v_org_handles := coalesce(v_norm->'organizer_handles', v_enr->'organizer_handles');
  IF v_org_handles IS NOT NULL AND jsonb_typeof(v_org_handles) <> 'object' THEN
    v_org_handles := NULL;
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

  -- ── City + country resolution (country-scoped; never link cross-country) ──
  v_city_txt    := nullif(btrim(v_loc->>'city'), '');
  v_country_txt := nullif(btrim(v_loc->>'country'), '');

  IF v_country_txt IS NOT NULL THEN
    SELECT id INTO v_country_id FROM public.countries
    WHERE lower(name) = lower(v_country_txt) AND duplicate_of_id IS NULL LIMIT 1;
    IF v_country_id IS NULL AND length(v_country_txt) <= 3 THEN
      SELECT id INTO v_country_id FROM public.countries
      WHERE lower(code) = lower(v_country_txt) AND duplicate_of_id IS NULL LIMIT 1;
    END IF;
  END IF;

  IF v_city_txt IS NOT NULL THEN
    -- a. city in the resolved country
    IF v_country_id IS NOT NULL THEN
      SELECT id INTO v_city_id FROM public.cities
      WHERE lower(name) = lower(v_city_txt) AND country_id = v_country_id AND duplicate_of_id IS NULL
      ORDER BY population DESC NULLS LAST LIMIT 1;
    END IF;

    -- b. country known but no in-country city -> create it under that country.
    --    We never adopt a same-named city from another country.
    IF v_city_id IS NULL AND v_country_id IS NOT NULL THEN
      INSERT INTO public.cities (name, country_id, latitude, longitude)
      VALUES (v_city_txt, v_country_id, v_lat, v_lng)
      RETURNING id INTO v_city_id;
    END IF;

    -- c. country unknown -> population best-guess (only guess path)
    IF v_city_id IS NULL AND v_country_id IS NULL THEN
      SELECT id, country_id INTO v_city_id, v_uniq_cc FROM public.cities
      WHERE lower(name) = lower(v_city_txt) AND duplicate_of_id IS NULL
      ORDER BY population DESC NULLS LAST LIMIT 1;
      v_country_id := coalesce(v_country_id, v_uniq_cc);
    END IF;
  END IF;

  v_payload := jsonb_build_object('raw', v_stage.raw_data, 'normalized', v_norm, 'enriched', v_enr);
  v_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');

  IF v_existing_id IS NULL THEN
    INSERT INTO public.venues (
      name, description, address, city, country, latitude, longitude,
      phone, email, website, category, city_id, country_id,
      is_organizer, organizer_handles,
      data_source, external_id, last_synced_at, last_refreshed_at, created_at, updated_at
    ) VALUES (
      v_name, v_description, coalesce(v_address, v_name),
      coalesce(nullif(v_loc->>'city',''), ''),
      coalesce(nullif(v_loc->>'country',''), ''),
      v_lat, v_lng, v_phone, v_email, v_website, v_category, v_city_id, v_country_id,
      v_is_org, v_org_handles,
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
      is_organizer     = is_organizer OR v_is_org,
      organizer_handles = CASE
        WHEN v_org_handles IS NULL THEN organizer_handles
        WHEN organizer_handles IS NULL THEN v_org_handles
        ELSE organizer_handles || v_org_handles
      END,
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
          jsonb_build_object('source_slug', v_source_slug, 'source_entity_id', v_source_eid,
                             'action', v_action, 'is_organizer', v_is_org));

  RETURN QUERY SELECT v_result_id, v_action;
END;
$$;

GRANT EXECUTE ON FUNCTION public.commit_venue_staging_item(UUID, TEXT) TO authenticated, service_role;
