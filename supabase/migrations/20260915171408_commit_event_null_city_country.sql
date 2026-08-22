-- ============================================================================
-- commit_event_staging_item: stop writing '' into city/country
-- ----------------------------------------------------------------------------
-- The INSERT wrote `coalesce(v_city, ''), coalesce(v_country, '')`. Both columns
-- are NULLABLE, so the coalesce bought nothing -- and both carry a CHECK that an
-- empty string violates:
--
--   events_city_nonjunk_check   city IS NULL OR (length(btrim(city)) > 0 AND city !~ '^[0-9]+$')
--   events_country_iso2_check   country IS NULL OR country ~ '^[A-Z]{2}$'
--
-- So an event whose source did not state a city (or a country) was structurally
-- uncommittable: the RPC converted "unknown" into a value the table bans, and the
-- whole staging item was rejected with a constraint error rather than committed
-- with a null. Not theoretical -- 247 rows have died this way since the checks
-- landed: gaycities 229, display-magazin 12, ticketmaster 1, plus 5 with no
-- source_name. Every one of them had a title, a start date and usually
-- coordinates; only the city string was missing.
--
-- The UPDATE branch was already correct (plain coalesce onto the existing value),
-- which is why this only ever hit first-time inserts.
--
-- The whole function is re-committed rather than patched by string surgery on the
-- live object -- that shortcut is what left 20260725201000 disagreeing with prod
-- until 20260809100000 had to re-commit it anyway.
-- ============================================================================

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

  v_title       := nullif(btrim(coalesce(v_norm->>'title', v_norm->>'name')), '');
  v_description := nullif(btrim(coalesce(v_norm->>'description', v_enr->>'description')), '');
  v_event_type  := coalesce(nullif(v_norm->>'event_type',''), 'other');
  v_start       := nullif(coalesce(v_norm->>'start_date', v_norm->'dates'->>'start'),'')::timestamptz;
  v_end         := nullif(coalesce(v_norm->>'end_date', v_norm->'dates'->>'end'),'')::timestamptz;
  v_venue_id    := nullif(v_norm->>'venue_id','')::uuid;
  v_city        := nullif(btrim(coalesce(v_loc->>'city', v_norm->>'city')), '');
  v_country     := nullif(btrim(coalesce(v_loc->>'country', v_norm->>'country')), '');
  v_address     := nullif(btrim(coalesce(v_loc->>'address', v_norm->>'address')), '');
  v_state       := nullif(btrim(coalesce(v_loc->>'state', v_loc->>'region', v_norm->>'state')), '');
  v_postal      := nullif(btrim(coalesce(v_loc->>'postal_code', v_loc->>'postcode', v_norm->>'postal_code')), '');
  v_lat         := nullif(coalesce(v_loc->>'lat', v_norm->>'latitude'),'')::numeric;
  v_lng         := nullif(coalesce(v_loc->>'lng', v_norm->>'longitude'),'')::numeric;
  v_website     := nullif(btrim(v_norm->>'website'), '');
  v_ticket_url  := nullif(btrim(coalesce(v_norm->>'ticket_url', v_norm->'urls'->>0)), '');
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

  -- Geo resolution — absent entirely before this migration, which is why 26,840
  -- live events carried a country STRING but a NULL country_id. Mirrors the
  -- venue RPC: country first (independent of city), then city scoped by it.
  -- The venue the event belongs to is the most specific signal, so it wins.
  IF v_venue_id IS NOT NULL THEN
    SELECT v.city_id, v.country_id INTO v_city_id, v_country_id
    FROM public.venues v WHERE v.id = v_venue_id;
  END IF;

  IF v_country_id IS NULL AND v_country IS NOT NULL THEN
    SELECT id INTO v_country_id FROM public.countries
    WHERE duplicate_of_id IS NULL
      AND (upper(code) = upper(v_country) OR lower(name) = lower(v_country)
           OR lower(name) = lower(regexp_replace(regexp_replace(btrim(v_country), '^the\s+', '', 'i'), '\s+of\s+america$', '', 'i')))
    LIMIT 1;
  END IF;
  -- events.country carries ISO2 (events_country_iso2_check): store the code
  -- when resolved; drop unresolvable full text rather than violate the CHECK.
  IF v_country_id IS NOT NULL THEN
    SELECT upper(c2.code) INTO v_country FROM public.countries c2 WHERE c2.id = v_country_id;
  ELSIF v_country IS NOT NULL AND v_country !~ '^[A-Za-z]{2}$' THEN
    v_country := NULL;
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
      v_city, v_country,
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

-- ----------------------------------------------------------------------------
-- Re-open the rows the bug rejected, so the fix is retroactive rather than
-- merely forward-looking. Scoped by the exact constraint names: a row rejected
-- for any other reason stays rejected.
--
-- `ux_ingestion_staging_source_idem` is UNIQUE on
-- (coalesce(source_name, source_type), idempotency_key) WHERE disposition <> 'rejected',
-- so re-opening is only safe where no live row already holds that key -- and
-- where two REJECTED rows share one, only the newest may come back.
-- ----------------------------------------------------------------------------
WITH candidates AS (
  SELECT s.id,
         row_number() OVER (
           PARTITION BY coalesce(s.source_name, s.source_type), s.idempotency_key
           ORDER BY s.created_at DESC, s.id
         ) AS rn
  FROM public.ingestion_staging s
  WHERE s.target_table = 'events'
    AND s.disposition = 'rejected'
    AND (s.error_message LIKE '%events_city_nonjunk_check%'
      OR s.error_message LIKE '%events_country_iso2_check%')
    AND NOT EXISTS (
      SELECT 1 FROM public.ingestion_staging o
      WHERE o.id <> s.id
        AND coalesce(o.source_name, o.source_type) = coalesce(s.source_name, s.source_type)
        AND o.idempotency_key = s.idempotency_key
        AND o.disposition <> 'rejected'
    )
)
UPDATE public.ingestion_staging s
SET disposition   = 'pending',
    error_message = NULL,
    processed_at  = NULL,
    updated_at    = now()
FROM candidates c
WHERE c.id = s.id AND c.rn = 1;
