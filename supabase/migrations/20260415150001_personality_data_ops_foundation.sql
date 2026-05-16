-- ============================================================================
-- Personality Data Ops Foundation
-- Adds schema, dedup RPC, commit RPC, source junction and pipeline definition
-- to route all personality ingest through the unified staging pipeline.
-- ============================================================================

-- 1. Schema additions -----------------------------------------------------

ALTER TABLE public.personalities
  ADD COLUMN IF NOT EXISTS wikidata_qid       TEXT,
  ADD COLUMN IF NOT EXISTS external_ids       JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS payload_hash       TEXT,
  ADD COLUMN IF NOT EXISTS last_refreshed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS name_normalized    TEXT
    GENERATED ALWAYS AS (lower(public.unaccent(regexp_replace(coalesce(name,''), '\s+', ' ', 'g')))) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS personalities_wikidata_qid_uniq
  ON public.personalities (wikidata_qid) WHERE wikidata_qid IS NOT NULL;

CREATE INDEX IF NOT EXISTS personalities_name_norm_trgm
  ON public.personalities USING gin (name_normalized extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS personalities_birth_date_idx
  ON public.personalities (birth_date) WHERE birth_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS personalities_external_ids_gin
  ON public.personalities USING gin (external_ids);

COMMENT ON COLUMN public.personalities.wikidata_qid IS 'Canonical Wikidata QID (e.g. Q12345) — strong dedup key';
COMMENT ON COLUMN public.personalities.external_ids IS 'Map of source→id (imdb, musicbrainz, isni, viaf, freebase, etc.)';

-- 2. Source junction table ------------------------------------------------

CREATE TABLE IF NOT EXISTS public.personality_sources (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  personality_id   UUID        NOT NULL REFERENCES public.personalities(id) ON DELETE CASCADE,
  source_slug      TEXT        NOT NULL,
  source_entity_id TEXT,
  source_url       TEXT,
  raw              JSONB       DEFAULT '{}'::jsonb,
  payload_hash     TEXT,
  confidence       NUMERIC     DEFAULT 1.0,
  is_primary       BOOLEAN     DEFAULT false,
  first_seen_at    TIMESTAMPTZ DEFAULT now(),
  last_seen_at     TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS personality_sources_src_eid_uniq
  ON public.personality_sources (source_slug, source_entity_id)
  WHERE source_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS personality_sources_personality_id_idx
  ON public.personality_sources (personality_id);

ALTER TABLE public.personality_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY personality_sources_select_all ON public.personality_sources
  FOR SELECT USING (true);

CREATE POLICY personality_sources_service_write ON public.personality_sources
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 3. Multi-signal dedup RPC ----------------------------------------------

CREATE OR REPLACE FUNCTION public.find_personality_duplicate_candidates(
  p_name          TEXT,
  p_wikidata_qid  TEXT DEFAULT NULL,
  p_birth_date    DATE DEFAULT NULL,
  p_external_ids  JSONB DEFAULT '{}'::jsonb,
  p_profession    TEXT DEFAULT NULL,
  p_nationality   TEXT DEFAULT NULL,
  p_limit         INT  DEFAULT 10
)
RETURNS TABLE(
  personality_id UUID,
  matched_name   TEXT,
  match_type     TEXT,
  score          NUMERIC,
  distance_m     NUMERIC,
  time_diff_hours NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_name_norm TEXT := lower(public.unaccent(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g')));
BEGIN
  IF v_name_norm = '' AND p_wikidata_qid IS NULL AND (p_external_ids = '{}'::jsonb OR p_external_ids IS NULL) THEN
    RETURN;
  END IF;

  -- 1. Exact Wikidata QID match = 1.0
  IF p_wikidata_qid IS NOT NULL THEN
    RETURN QUERY
      SELECT p.id, p.name, 'wikidata_qid'::text, 1.00::numeric, NULL::numeric, NULL::numeric
      FROM public.personalities p
      WHERE p.wikidata_qid = p_wikidata_qid
      LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 2. External-id overlap = 0.95
  IF p_external_ids IS NOT NULL AND p_external_ids <> '{}'::jsonb THEN
    RETURN QUERY
      SELECT p.id, p.name, 'external_id'::text, 0.95::numeric, NULL::numeric, NULL::numeric
      FROM public.personalities p
      WHERE p.external_ids ?| (SELECT array_agg(k) FROM jsonb_object_keys(p_external_ids) k)
        AND EXISTS (
          SELECT 1 FROM jsonb_each_text(p_external_ids) e
          WHERE p.external_ids->>e.key = e.value
        )
      LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 3. Trigram name + DOB match = 0.95
  IF p_birth_date IS NOT NULL THEN
    RETURN QUERY
      SELECT p.id, p.name, 'name_dob'::text,
             GREATEST(0.95, extensions.similarity(p.name_normalized, v_name_norm))::numeric,
             NULL::numeric, NULL::numeric
      FROM public.personalities p
      WHERE p.birth_date = p_birth_date
        AND extensions.similarity(p.name_normalized, v_name_norm) >= 0.85
      ORDER BY extensions.similarity(p.name_normalized, v_name_norm) DESC
      LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 4. Strong name + profession/nationality match = 0.82
  IF p_profession IS NOT NULL OR p_nationality IS NOT NULL THEN
    RETURN QUERY
      SELECT p.id, p.name, 'name_context'::text,
             (extensions.similarity(p.name_normalized, v_name_norm) * 0.9)::numeric,
             NULL::numeric, NULL::numeric
      FROM public.personalities p
      WHERE extensions.similarity(p.name_normalized, v_name_norm) >= 0.88
        AND (
          (p_profession  IS NOT NULL AND p.profession  ILIKE '%' || p_profession  || '%') OR
          (p_nationality IS NOT NULL AND p.nationality ILIKE '%' || p_nationality || '%')
        )
      ORDER BY extensions.similarity(p.name_normalized, v_name_norm) DESC
      LIMIT p_limit;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 5. Trigram only, lower confidence = similarity * 0.8
  RETURN QUERY
    SELECT p.id, p.name, 'name_trigram'::text,
           (extensions.similarity(p.name_normalized, v_name_norm) * 0.8)::numeric,
           NULL::numeric, NULL::numeric
    FROM public.personalities p
    WHERE extensions.similarity(p.name_normalized, v_name_norm) >= 0.75
    ORDER BY extensions.similarity(p.name_normalized, v_name_norm) DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_personality_duplicate_candidates(
  TEXT, TEXT, DATE, JSONB, TEXT, TEXT, INT
) TO authenticated, service_role;

-- 4. Atomic commit RPC ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.commit_personality_staging_item(
  p_staging_id UUID,
  p_actor      TEXT DEFAULT 'pipeline-commit'
)
RETURNS TABLE(personality_id UUID, action TEXT)
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
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
  v_hash    := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');
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
      verification_status, visibility, is_featured,
      payload_hash, last_refreshed_at, created_at, updated_at
    ) VALUES (
      v_name, v_pronouns, v_description, v_bio, v_birth_date, v_death_date, v_is_living,
      v_profession, v_nationality, v_birth_place, v_image_url, v_website,
      v_fields, v_social, v_achievements, v_concerts, v_top_book,
      v_lgbti_conn, v_lgbti_det, v_sensit,
      v_qid, v_external,
      v_verif, v_visibility, false,
      v_hash, now(), now(), now()
    ) RETURNING id INTO v_result_id;
    v_action := 'inserted';
  ELSE
    -- Merge: only fill blanks; never clobber curated fields.
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
      payload_hash      = v_hash,
      last_refreshed_at = now(),
      updated_at        = now()
    WHERE id = v_existing_id;
    v_result_id := v_existing_id;
    v_action    := 'updated';
  END IF;

  -- Source junction
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
$$;

GRANT EXECUTE ON FUNCTION public.commit_personality_staging_item(UUID, TEXT) TO authenticated, service_role;

-- Batch wrapper with SKIP LOCKED for parallel safety
CREATE OR REPLACE FUNCTION public.commit_personality_staging_batch(p_limit INT DEFAULT 50)
RETURNS TABLE(staging_id UUID, personality_id UUID, action TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  r   RECORD;
  res RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.ingestion_staging
    WHERE target_table = 'personalities'
      AND disposition IN ('pending','approved')
      AND ai_validation_status = 'approved'
      AND (dedup_status IN ('unique','duplicate','merge_candidate') OR dedup_status IS NULL)
      AND (review_status IN ('auto','approved') OR review_status IS NULL)
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT * INTO res FROM public.commit_personality_staging_item(r.id, 'batch');
      staging_id := r.id; personality_id := res.personality_id; action := res.action;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.ingestion_staging SET
        disposition   = 'rejected',
        error_message = 'commit_fn: ' || SQLERRM,
        updated_at    = now()
      WHERE id = r.id;
      INSERT INTO public.ingestion_events (staging_id, stage, new_status, actor, payload)
      VALUES (r.id, 'commit', 'rejected', 'batch',
              jsonb_build_object('error', SQLERRM, 'target_table', 'personalities'));
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.commit_personality_staging_batch(INT) TO authenticated, service_role;

-- 5. Pipeline definition --------------------------------------------------

INSERT INTO public.pipeline_definitions
  (name, display_name, description, nodes, edges, default_context,
   max_concurrency, timeout_seconds, is_enabled)
VALUES (
  'personality-ingestion',
  'Personality Ingestion (Bulletproof)',
  'Unified ingest for CSV upload, bulk Wikidata fetch, and single-name enrichment. '
  'Stages → normalize → enrich → validate → dedup → quality → review → commit.',
  jsonb_build_array(
    jsonb_build_object('id','normalize','type','pipeline-normalize','category','processor',
      'data', jsonb_build_object('config', jsonb_build_object('entity_type','personality'))),
    jsonb_build_object('id','validate','type','pipeline-validate','category','validator',
      'data', jsonb_build_object('config', jsonb_build_object('entity_type','personality','reject_below_score',40))),
    jsonb_build_object('id','dedup','type','pipeline-deduplicate','category','processor',
      'data', jsonb_build_object('config', jsonb_build_object('entity_type','personality','auto_merge_min',0.90,'review_min',0.75))),
    jsonb_build_object('id','quality','type','pipeline-quality-score','category','processor',
      'data', jsonb_build_object('config', jsonb_build_object('entity_type','personality'))),
    jsonb_build_object('id','review','type','pipeline-review-gate','category','control',
      'data', jsonb_build_object('config', jsonb_build_object('entity_type','personality','auto_approve_above',0.85))),
    jsonb_build_object('id','commit','type','pipeline-commit','category','output',
      'data', jsonb_build_object('config', jsonb_build_object('entity_type','personality','targetTable','personalities','use_rpc','commit_personality_staging_batch')))
  ),
  jsonb_build_array(
    jsonb_build_object('source','normalize','target','validate'),
    jsonb_build_object('source','validate','target','dedup'),
    jsonb_build_object('source','dedup','target','quality'),
    jsonb_build_object('source','quality','target','review'),
    jsonb_build_object('source','review','target','commit')
  ),
  jsonb_build_object('entity_type','personality','target_table','personalities'),
  2, 600, true
)
ON CONFLICT (name) DO UPDATE
  SET nodes           = EXCLUDED.nodes,
      edges           = EXCLUDED.edges,
      default_context = EXCLUDED.default_context,
      description     = EXCLUDED.description,
      is_enabled      = true,
      updated_at      = now();

COMMENT ON FUNCTION public.find_personality_duplicate_candidates IS
  'Multi-signal personality dedup: Wikidata QID > external IDs > name+DOB > name+profession > trigram';
COMMENT ON FUNCTION public.commit_personality_staging_item IS
  'Atomic commit: upsert personality + personality_sources + audit + advisory lock';
COMMENT ON TABLE public.personality_sources IS
  'Source provenance junction (analog of venue_sources/event_sources)';
