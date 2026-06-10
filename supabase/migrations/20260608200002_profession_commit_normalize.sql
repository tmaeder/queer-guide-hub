-- Normalize profession at commit time so the scraper / extension pipeline lands
-- controlled vocabulary values going forward (not just the one-time backfill).
-- Faithful reproduction of commit_personality_staging_item with a single added
-- line: v_profession is mapped through normalize_profession() after is_adult is
-- derived from the raw value (so adult-cohort detection is unaffected).

CREATE OR REPLACE FUNCTION public.commit_personality_staging_item(p_staging_id uuid, p_actor text DEFAULT 'system'::text)
 RETURNS TABLE(personality_id uuid, action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_stage       RECORD;
  v_norm        JSONB;
  v_enr         JSONB;
  v_meta        JSONB;
  v_name        TEXT;
  v_qid         TEXT;
  v_external    JSONB;
  v_description TEXT;
  v_bio         TEXT;
  v_profession  TEXT;
  v_nationality TEXT;
  v_birth_date  DATE;
  v_death_date  DATE;
  v_birth_place TEXT;
  v_image_url   TEXT;
  v_website     TEXT;
  v_pronouns    TEXT;
  v_is_living   BOOLEAN;
  v_is_adult    BOOLEAN;
  v_fields      JSONB;
  v_social      JSONB;
  v_achievements JSONB;
  v_lgbti_conn  TEXT;
  v_lgbti_det   TEXT;
  v_top_book    TEXT;
  v_concerts    JSONB;
  v_sensit      JSONB;
  v_source_slug TEXT;
  v_source_eid  TEXT;
  v_source_url  TEXT;
  v_existing_id UUID;
  v_payload     JSONB;
  v_hash        TEXT;
  v_lock_key    BIGINT;
  v_action      TEXT;
  v_result_id   UUID;
  v_visibility  TEXT;
  v_verif       TEXT;
BEGIN
  SELECT * INTO v_stage FROM public.ingestion_staging WHERE id = p_staging_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staging_item_not_found: %', p_staging_id; END IF;
  IF v_stage.target_table <> 'personalities' THEN
    RAISE EXCEPTION 'not_a_personality_staging_item: target=%', v_stage.target_table;
  END IF;
  IF v_stage.disposition IN ('inserted','updated','committed','rejected') THEN
    RETURN QUERY SELECT v_stage.target_record_id, 'noop'::text;
    RETURN;
  END IF;

  v_norm := coalesce(v_stage.normalized_data, '{}'::jsonb);
  v_enr  := coalesce(v_stage.enriched_data,   '{}'::jsonb);
  v_meta := coalesce(v_norm->'metadata', v_stage.raw_data, '{}'::jsonb);

  v_name        := nullif(btrim(v_norm->>'name'), '');
  v_qid         := nullif(btrim(coalesce(v_norm->>'wikidata_qid', v_meta->>'wikidata_qid', v_enr->>'wikidata_qid')), '');
  v_external    := coalesce(v_norm->'external_ids', v_enr->'external_ids', '{}'::jsonb);
  v_description := nullif(btrim(coalesce(v_norm->>'description', v_enr->>'description', v_meta->>'description')), '');
  v_bio         := nullif(btrim(coalesce(v_norm->>'bio', v_enr->>'bio')), '');
  v_profession  := nullif(btrim(coalesce(v_norm->>'profession', v_meta->>'profession')), '');
  v_nationality := nullif(btrim(coalesce(v_norm->>'nationality', v_meta->>'nationality')), '');
  v_birth_date  := nullif(v_norm->>'birth_date','')::date;
  v_death_date  := nullif(v_norm->>'death_date','')::date;
  v_birth_place := nullif(btrim(coalesce(v_norm->>'birth_place', v_meta->>'birth_place')), '');
  v_image_url   := nullif(btrim(coalesce(v_norm->>'image_url', v_enr->>'image_url')), '');
  v_website     := nullif(btrim(coalesce(v_norm->>'website_url', v_meta->>'website_url')), '');
  v_pronouns    := nullif(btrim(coalesce(v_norm->>'pronouns', v_meta->>'pronouns')), '');
  v_lgbti_conn  := nullif(btrim(coalesce(v_norm->>'lgbti_connection', v_enr->>'lgbti_connection')), '');
  v_lgbti_det   := nullif(btrim(coalesce(v_norm->>'lgbti_details',    v_enr->>'lgbti_details')), '');
  v_top_book    := nullif(btrim(coalesce(v_norm->>'top_book', v_enr->>'top_book')), '');
  v_is_living   := CASE WHEN v_death_date IS NOT NULL THEN false
                        WHEN v_norm ? 'is_living' THEN (v_norm->>'is_living')::boolean
                        ELSE true END;
  -- Derive is_adult from the RAW profession before normalization, using the same patterns as the backfill migration
  v_is_adult    := v_profession IS NOT NULL AND (
                     v_profession ILIKE '%adult performer%'
                     OR v_profession ILIKE '%adult model%'
                     OR v_profession ILIKE '%adult film%'
                     OR v_profession ILIKE '%porn%'
                   );
  -- Normalize to controlled vocabulary for storage
  v_profession  := coalesce(public.normalize_profession(v_profession), v_profession);
  v_fields      := coalesce(v_norm->'fields',       '[]'::jsonb);
  v_social      := coalesce(v_norm->'social_links', v_enr->'social_links', '{}'::jsonb);
  v_achievements:= coalesce(v_norm->'achievements', v_enr->'achievements', '[]'::jsonb);
  v_concerts    := coalesce(v_norm->'next_concerts', v_enr->'next_concerts', '[]'::jsonb);
  v_sensit      := coalesce(v_norm->'sensitivity_flags', v_enr->'sensitivity_flags', '{}'::jsonb);

  v_source_slug := coalesce(v_stage.source_name, v_stage.source_type, 'unknown');
  v_source_eid  := coalesce(v_stage.source_entity_id, v_qid, v_meta->>'id', v_meta->>'external_id');
  v_source_url  := nullif(btrim(coalesce(v_meta->>'url', v_norm->>'profile_url')), '');

  IF v_name IS NULL THEN RAISE EXCEPTION 'personality_missing_name: staging=%', p_staging_id; END IF;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'name', v_name, 'wikidata_qid', v_qid, 'birth_date', v_birth_date, 'profession', v_profession
  ));
  v_hash     := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');
  v_lock_key := ('x'||substr(md5(coalesce(v_qid, lower(v_name))), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_existing_id := v_stage.dedup_match_id;
  IF v_existing_id IS NULL AND v_qid IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.personalities WHERE wikidata_qid = v_qid LIMIT 1;
  END IF;

  v_visibility := coalesce(nullif(v_norm->>'visibility',''), 'draft');
  v_verif      := coalesce(nullif(v_norm->>'verification_status',''), 'pending');

  IF v_existing_id IS NULL THEN
    INSERT INTO public.personalities (
      name, pronouns, description, bio, birth_date, death_date, is_living,
      profession, nationality, birth_place, image_url, website_url,
      fields, social_links, achievements, next_concerts, top_book,
      lgbti_connection, lgbti_details, sensitivity_flags,
      wikidata_qid, external_ids,
      verification_status, visibility, is_featured, is_adult,
      payload_hash, last_refreshed_at, created_at, updated_at
    ) VALUES (
      v_name, v_pronouns, v_description, v_bio, v_birth_date, v_death_date, v_is_living,
      v_profession, v_nationality, v_birth_place, v_image_url, v_website,
      v_fields, v_social, v_achievements, v_concerts, v_top_book,
      v_lgbti_conn, v_lgbti_det, v_sensit,
      v_qid, v_external,
      v_verif, v_visibility, false, v_is_adult,
      v_hash, now(), now(), now()
    ) RETURNING id INTO v_result_id;
    v_action := 'inserted';
  ELSE
    UPDATE public.personalities SET
      description       = coalesce(description,       v_description),
      bio               = coalesce(bio,               v_bio),
      birth_date        = coalesce(birth_date,        v_birth_date),
      death_date        = coalesce(death_date,        v_death_date),
      is_living         = coalesce(is_living,         v_is_living),
      profession        = coalesce(profession,        v_profession),
      nationality       = coalesce(nationality,       v_nationality),
      birth_place       = coalesce(birth_place,       v_birth_place),
      image_url         = coalesce(image_url,         v_image_url),
      website_url       = coalesce(website_url,       v_website),
      pronouns          = coalesce(pronouns,          v_pronouns),
      lgbti_connection  = coalesce(lgbti_connection,  v_lgbti_conn),
      lgbti_details     = coalesce(lgbti_details,     v_lgbti_det),
      top_book          = coalesce(top_book,          v_top_book),
      wikidata_qid      = coalesce(wikidata_qid,      v_qid),
      external_ids      = coalesce(external_ids,'{}'::jsonb) || v_external,
      social_links      = coalesce(social_links,'{}'::jsonb) || v_social,
      fields            = CASE WHEN jsonb_array_length(coalesce(fields,'[]'::jsonb)) = 0 THEN v_fields ELSE fields END,
      achievements      = CASE WHEN jsonb_array_length(coalesce(achievements,'[]'::jsonb)) = 0 THEN v_achievements ELSE achievements END,
      next_concerts     = CASE WHEN jsonb_array_length(coalesce(next_concerts,'[]'::jsonb)) = 0 THEN v_concerts ELSE next_concerts END,
      sensitivity_flags = coalesce(sensitivity_flags,'{}'::jsonb) || v_sensit,
      is_adult          = v_is_adult,
      payload_hash      = v_hash,
      last_refreshed_at = now(),
      updated_at        = now()
    WHERE id = v_existing_id;
    v_result_id := v_existing_id;
    v_action    := 'updated';
  END IF;

  IF v_source_eid IS NOT NULL THEN
    INSERT INTO public.personality_sources (
      personality_id, source_slug, source_entity_id, source_url,
      raw, payload_hash, confidence, is_primary, first_seen_at, last_seen_at
    ) VALUES (
      v_result_id, v_source_slug, v_source_eid, v_source_url,
      v_stage.raw_data, v_hash, coalesce(v_stage.ai_confidence_score, 1.0),
      v_action = 'inserted', now(), now()
    )
    ON CONFLICT (source_slug, source_entity_id) DO UPDATE SET
      personality_id = EXCLUDED.personality_id,
      raw            = EXCLUDED.raw,
      payload_hash   = EXCLUDED.payload_hash,
      confidence     = EXCLUDED.confidence,
      last_seen_at   = now();
  END IF;

  UPDATE public.ingestion_staging SET
    disposition      = v_action,
    target_record_id = v_result_id,
    processed_at     = now(),
    updated_at       = now()
  WHERE id = p_staging_id;

  INSERT INTO public.ingestion_events (staging_id, stage, old_status, new_status, actor, payload)
  VALUES (p_staging_id, 'commit', v_stage.disposition, v_action, p_actor,
          jsonb_build_object('source_slug', v_source_slug, 'source_entity_id', v_source_eid,
                             'action', v_action, 'personality_id', v_result_id,
                             'target_table', 'personalities', 'wikidata_qid', v_qid));

  RETURN QUERY SELECT v_result_id, v_action;
END;
$function$;
