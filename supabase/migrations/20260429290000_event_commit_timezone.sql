-- Wire events.timezone into commit_event_staging_item.
--
-- Migration 20260429210000 added events.timezone (override column for adapters
-- that don't store UTC). The commit RPC at 20260415120100 ignored the field —
-- adapters could include `timezone` in their normalized payload and it would
-- be silently dropped at commit time. This migration:
--
--   1. Reads `timezone` from the normalized JSONB (top-level or under
--      `location` for adapters that group it with city/country).
--   2. Includes it in the INSERT column list for new events.
--   3. coalesce-merges it on UPDATE so existing values aren't overwritten by
--      a re-ingest with a stale or missing value.
--
-- Body is otherwise byte-identical to 20260415120100 — only the v_timezone
-- declaration, the extraction, and the two write-paths differ.

CREATE OR REPLACE FUNCTION public.commit_event_staging_item(
  p_staging_id UUID,
  p_actor TEXT DEFAULT 'pipeline-commit'
)
RETURNS TABLE(event_id UUID, action TEXT)
LANGUAGE plpgsql AS $$
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
  v_lat         := nullif(coalesce(v_loc->>'lat', v_norm->>'latitude'),'')::numeric;
  v_lng         := nullif(coalesce(v_loc->>'lng', v_norm->>'longitude'),'')::numeric;
  v_website     := nullif(btrim(v_norm->>'website'), '');
  v_ticket_url  := nullif(btrim(v_norm->>'ticket_url'), '');
  v_edition     := nullif(btrim(v_norm->>'edition'), '');
  -- timezone may live at top-level or alongside city/country in `location`.
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

  v_payload := jsonb_build_object('raw', v_stage.raw_data, 'normalized', v_norm, 'enriched', v_enr);
  v_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');

  IF v_existing_id IS NULL THEN
    INSERT INTO public.events (
      title, description, event_type, start_date, end_date,
      venue_id, venue_name, address, city, country,
      latitude, longitude, website, ticket_url, edition,
      timezone, images,
      data_source, external_id, last_synced_at, last_refreshed_at,
      status, created_at, updated_at
    ) VALUES (
      v_title, v_description, v_event_type, v_start, v_end,
      v_venue_id, nullif(btrim(v_norm->>'venue_name'),''), v_address,
      coalesce(v_city, ''), coalesce(v_country, 'US'),
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
$$;

GRANT EXECUTE ON FUNCTION public.commit_event_staging_item(UUID, TEXT) TO authenticated, service_role;
