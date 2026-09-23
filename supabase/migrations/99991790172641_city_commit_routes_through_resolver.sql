-- Put the staging commit back behind `city_resolve_or_create`, and hold it there.
--
-- 20261001100300_commit_city_via_resolver.sql routed `commit_city_staging_item`
-- through the shared identity ladder. 20261001110000_capital_scope_columns.sql
-- then restated the WHOLE function body in order to add two capital columns --
-- and silently reverted the routing. Its own header lists
-- `commit_city_staging_item()` in its lockstep list, so the author knew they
-- were touching this function; they copied the pre-resolver base. This is the
-- `CREATE OR REPLACE` restate trap already recorded in this repo for
-- `tag_hygiene_stats` and `run_city_safety_backfill`.
--
-- MEASURED ON THE LIVE CATALOG, NOT ON THE FILES (2026-09-23):
--   - the deployed body does `INSERT INTO public.cities` directly and contains
--     ZERO occurrences of `city_resolve_or_create`;
--   - its probe ladder is three arms -- geo_sources source key, the staging
--     row's own dedup_match_id, and (country_id, name_normalized) -- with no
--     QID arm, no alias arm, no geo-proximity refusal and no evidence gate;
--   - the `name_normalized` arm is UNGUARDED. `normalize_name` strips every
--     non-[a-z0-9] character, so a name in Greek, Cyrillic, Japanese, Hebrew,
--     Thai or Khmer normalizes to the EMPTY STRING -- 17 live rows do -- and
--     the probe then matches whichever of those 17 comes first and UPDATES an
--     unrelated city. The resolver guards this with `length(v_nn) >= 3`;
--   - the live COMMENT still reads "Identity is delegated to
--     city_resolve_or_create", because the reverting migration restated the
--     body without restating the comment. Every reader who checks the comment
--     concludes the path is guarded. A comment that outlived its truth is
--     invisible to every gate.
--
-- WHAT IT COST. `city_aliases` holds 31,429 rows over 2,197 cities and ALREADY
-- contains `Mogadischu`, `Nowosibirsk`, `Damaskus` and `Luxembourg City`, each
-- pointing at the correct row -- and a duplicate row exists for all four
-- anyway. The table knew; the writer never asked it. The resolver's arm (f) is
-- the arm that asks.
--
-- THIS FILE RESTORES 20261001100300'S BODY AND RE-APPLIES THE CAPITAL COLUMNS
-- ON TOP. Identity goes back to the resolver; the source-key and
-- dedup_match_id probes and every column write stay local, including
-- is_regional_capital / capital_of_region with the key-PRESENCE semantics
-- 20261001110000 introduced (`v_meta ? 'is_regional_capital'`), which are the
-- reason those two are not plain coalesce fills: `is_regional_capital` is
-- NOT NULL DEFAULT false, so an absent key and a probed false are
-- indistinguishable by value and only presence separates them.
--
-- A REFUSAL IS NOT AN INSERT. An ambiguous or evidence-free staged row RAISEs
-- and commit_city_staging_batch's handler writes the reason onto the staging
-- row. That is a real behaviour change and the intended one: a staged city we
-- cannot place is recoverable, a staged city attached to the wrong row is not.
--
-- DELIBERATELY NOT CHANGED: no `p_wikidata_qid` is passed to the resolver. The
-- 20261001100300 body did not pass one and the staged payloads on this path
-- carry a geonameid rather than a QID, so adding the argument would be a
-- behaviour change beyond restoring the routing. Under-reaching is the correct
-- error here.

CREATE OR REPLACE FUNCTION public.commit_city_staging_item(
  p_staging_id uuid,
  p_actor text DEFAULT 'pipeline-commit'
)
RETURNS TABLE(out_city_id uuid, action text)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_stage RECORD; v_norm JSONB; v_enr JSONB; v_loc JSONB; v_meta JSONB;
  v_name TEXT; v_country_code TEXT; v_country_name TEXT; v_country_id UUID;
  v_lat NUMERIC; v_lng NUMERIC; v_population BIGINT; v_area NUMERIC;
  v_timezone TEXT; v_region TEXT; v_is_capital BOOLEAN;
  v_has_regional BOOLEAN; v_is_regional_capital BOOLEAN;
  v_has_capital_of BOOLEAN; v_capital_of_region TEXT;
  v_source_slug TEXT; v_source_eid TEXT; v_existing_id UUID;
  v_lock_key BIGINT; v_action TEXT; v_result_id UUID; v_payload JSONB; v_hash TEXT;
  v_res RECORD;
BEGIN
  SELECT * INTO v_stage FROM public.ingestion_staging WHERE id = p_staging_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staging_item_not_found: %', p_staging_id; END IF;
  IF v_stage.target_table <> 'cities' THEN RAISE EXCEPTION 'not_a_city_staging_item: target=%', v_stage.target_table; END IF;
  IF v_stage.disposition IN ('inserted','updated','committed','rejected') THEN
    RETURN QUERY SELECT v_stage.target_record_id, 'noop'::text; RETURN;
  END IF;
  v_norm := coalesce(v_stage.normalized_data, '{}'::jsonb);
  v_enr  := coalesce(v_stage.enriched_data, '{}'::jsonb);
  v_loc  := coalesce(v_norm->'location', '{}'::jsonb);
  v_meta := coalesce(v_norm->'metadata', v_stage.raw_data, '{}'::jsonb);
  v_name := nullif(btrim(v_norm->>'name'), '');
  v_lat  := nullif(v_loc->>'lat','')::NUMERIC;
  v_lng  := nullif(v_loc->>'lng','')::NUMERIC;
  v_population := nullif(coalesce(v_norm->>'population', v_meta->>'population'), '')::BIGINT;
  v_area := nullif(coalesce(v_norm->>'area_km2', v_meta->>'area'), '')::NUMERIC;
  v_timezone := nullif(btrim(coalesce(v_norm->>'timezone', v_meta->>'timezone')), '');
  v_region := nullif(btrim(coalesce(v_norm->>'region_name', v_meta->>'region_name', v_meta->>'state', v_meta->>'admin1')), '');
  v_is_capital := coalesce((v_meta->>'is_capital')::BOOLEAN, false);
  v_has_regional := (v_meta ? 'is_regional_capital') AND (v_meta->>'is_regional_capital') IS NOT NULL;
  v_is_regional_capital := coalesce((v_meta->>'is_regional_capital')::BOOLEAN, false);
  v_has_capital_of := (v_meta ? 'capital_of_region');
  v_capital_of_region := nullif(btrim(coalesce(v_meta->>'capital_of_region','')), '');
  v_country_code := upper(btrim(coalesce(v_loc->>'country_code', v_meta->>'country_code', v_meta->>'countryCode', v_meta->>'cca2')));
  IF v_country_code = '' THEN v_country_code := NULL; END IF;
  v_country_name := nullif(btrim(coalesce(v_loc->>'country', v_meta->>'country')), '');
  v_source_slug := coalesce(v_stage.source_name, v_stage.source_type, 'unknown');
  v_source_eid := coalesce(v_stage.source_entity_id, v_meta->>'id', v_meta->>'external_id', v_meta->>'geonameid');
  IF v_name IS NULL THEN RAISE EXCEPTION 'city_missing_name: staging=%', p_staging_id; END IF;
  IF v_country_code IS NOT NULL THEN
    SELECT c.id INTO v_country_id FROM public.countries c WHERE c.code = v_country_code AND c.duplicate_of_id IS NULL LIMIT 1;
  END IF;
  IF v_country_id IS NULL AND v_country_name IS NOT NULL THEN
    SELECT c.id INTO v_country_id FROM public.countries c WHERE c.name_normalized = public.normalize_name(v_country_name) AND c.duplicate_of_id IS NULL LIMIT 1;
  END IF;
  IF v_country_id IS NULL THEN
    RAISE EXCEPTION 'city_unresolved_country: staging=% code=% name=%', p_staging_id, v_country_code, v_country_name;
  END IF;
  v_lock_key := hashtextextended(v_country_id::text || '|' || public.normalize_name(v_name), 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Probes this function owns: the source's own id for the row, and the
  -- dedup verdict the pipeline already reached. Neither is something the
  -- generic resolver can see.
  IF v_source_eid IS NOT NULL THEN
    SELECT gs.city_id INTO v_existing_id FROM public.geo_sources gs
    WHERE gs.entity_type='city' AND gs.source_slug=v_source_slug AND gs.source_entity_id=v_source_eid LIMIT 1;
  END IF;
  IF v_existing_id IS NULL AND v_stage.dedup_match_id IS NOT NULL
     AND coalesce(v_stage.dedup_match_table,'cities') = 'cities'
     AND v_stage.dedup_status IN ('duplicate','merge_candidate') THEN
    v_existing_id := v_stage.dedup_match_id;
  END IF;

  -- Identity: one shared ladder instead of this function's own name probe.
  IF v_existing_id IS NULL THEN
    SELECT * INTO v_res FROM public.city_resolve_or_create(
      p_name             => v_name,
      p_country_id       => v_country_id,
      p_region_hint      => v_region,
      p_lat              => v_lat,
      p_lng              => v_lng,
      p_source_slug      => v_source_slug,
      p_source_entity_id => v_source_eid,
      p_actor            => 'pipeline-commit'
    );
    IF v_res.city_id IS NULL THEN
      -- Surfaced as an exception so commit_city_staging_batch's handler writes
      -- the reason onto the staging row, the same way it already reports
      -- city_missing_name and city_unresolved_country.
      RAISE EXCEPTION 'city_unresolved: staging=% reason=% name=%', p_staging_id, v_res.reason, v_name;
    END IF;
    v_existing_id := v_res.city_id;
    -- 'created' still reports as 'inserted' downstream: the disposition
    -- vocabulary belongs to ingestion_staging, not to the resolver.
    IF v_res.action = 'created' THEN v_action := 'inserted'; END IF;
  END IF;

  v_payload := jsonb_build_object('raw', v_stage.raw_data, 'normalized', v_norm, 'enriched', v_enr);
  v_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');
  v_result_id := v_existing_id;

  -- Fill-if-empty, unchanged. It runs for a freshly created row too: the
  -- resolver writes only name/country/region/coords/qid, so population,
  -- timezone, area and the capital flags still arrive from here.
  --
  -- The two capital columns are key-PRESENCE writes, not coalesce fills.
  -- is_regional_capital is NOT NULL DEFAULT false, so an unprobed row and a
  -- probed negative are indistinguishable by value; only `v_meta ? key`
  -- separates them, which is why 20261001110000 introduced v_has_regional and
  -- v_has_capital_of and why they are carried across verbatim here.
  UPDATE public.cities SET
    region_name = coalesce(region_name, v_region), population = coalesce(population, v_population),
    latitude = coalesce(latitude, v_lat), longitude = coalesce(longitude, v_lng),
    timezone = coalesce(timezone, v_timezone), area_km2 = coalesce(area_km2, v_area),
    is_capital = CASE WHEN v_is_capital THEN true ELSE is_capital END,
    is_regional_capital = CASE WHEN v_has_regional THEN v_is_regional_capital ELSE is_regional_capital END,
    capital_of_region = CASE WHEN v_has_capital_of THEN v_capital_of_region ELSE capital_of_region END,
    last_synced_at = now(), last_refreshed_at = now(), updated_at = now()
  WHERE id = v_result_id;
  v_action := coalesce(v_action, 'updated');

  IF v_source_eid IS NOT NULL THEN
    INSERT INTO public.geo_sources (entity_type, city_id, source_slug, source_entity_id, source_url, payload, payload_hash, confidence, is_primary, first_seen_at, last_seen_at)
    VALUES ('city', v_result_id, v_source_slug, v_source_eid, nullif(btrim(v_meta->>'url'),''), v_payload, v_hash, coalesce(v_stage.ai_confidence_score, 1.0), v_action = 'inserted', now(), now())
    ON CONFLICT (source_slug, source_entity_id) DO UPDATE SET payload = EXCLUDED.payload, payload_hash = EXCLUDED.payload_hash, confidence = EXCLUDED.confidence, last_seen_at = now();
  END IF;
  UPDATE public.ingestion_staging SET disposition = v_action, target_record_id = v_result_id, processed_at = now(), updated_at = now() WHERE id = p_staging_id;
  INSERT INTO public.ingestion_events (staging_id, city_id, stage, old_status, new_status, actor, payload)
  VALUES (p_staging_id, v_result_id, 'commit', v_stage.disposition, v_action, p_actor,
          jsonb_build_object('source_slug', v_source_slug, 'source_entity_id', v_source_eid, 'action', v_action));
  RETURN QUERY SELECT v_result_id, v_action;
END;
$function$;

-- Restated in the same migration as the body, so the two cannot diverge again.
COMMENT ON FUNCTION public.commit_city_staging_item(uuid, text) IS
  'Commits one cities staging row. Identity is delegated to '
  'city_resolve_or_create (alias + QID + both TOTAL unique keys + a '
  'geo-proximity refusal, resolving through duplicate_of_id); the source-key '
  'and dedup_match_id probes and all column writes stay here, including the '
  'key-presence writes for is_regional_capital and capital_of_region. An '
  'unresolvable row RAISEs city_unresolved rather than inserting.';

-- ---------------------------------------------------------------- sentinel
--
-- STANDALONE, never a new key on pipeline_hygiene_stats(). That body is long
-- and a new key in it is a merge-collision surface -- the same reasoning that
-- gave tag_merge_graph_signals and news_quality_signals their own functions.
--
-- It answers the question the repo could not ask: WHICH functions write
-- `cities` without going through the resolver. `near_pairs` in the existing
-- health block measures the CONSEQUENCE (duplicates arriving) and is both slow
-- and ambiguous -- live 107 against a 196 baseline, so it was not tripping and
-- would not have tripped for this revert.
--
-- `functions_scanned` is reported FIRST and separately from `offenders`,
-- because zero offenders over a scan that matched nothing is vacuous rather
-- than clean -- the same rule as tag_medical_code_signals' `probe_rows`.
CREATE OR REPLACE FUNCTION public.city_writer_signals()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $fn$
  WITH scanned AS (
    -- prosrc, NOT pg_get_functiondef: the latter raises on internal/C
    -- functions, and this has to survive scanning the whole schema.
    SELECT p.oid, p.proname, p.prosrc
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language  l ON l.oid = p.prolang
     WHERE n.nspname = 'public'
       AND l.lanname IN ('plpgsql', 'sql')
  ),
  inserters AS (
    SELECT *
      FROM scanned
      -- Postgres regex has NO \b -- \b is a BACKSPACE here, and a pattern
      -- using it silently matches nothing. \M is end-of-word, and it is what
      -- stops `cities_directory` and `city_aliases` matching.
     WHERE prosrc ~* 'insert\s+into\s+(public\.)?cities\M'
  ),
  offenders AS (
    SELECT proname
      FROM inserters
     WHERE proname <> 'city_resolve_or_create'      -- the one sanctioned inserter
       AND prosrc !~* 'city_resolve_or_create'
  )
  SELECT jsonb_build_object(
    'functions_scanned', (SELECT count(*) FROM scanned),
    'inserters',         (SELECT count(*) FROM inserters),
    'offender_count',    (SELECT count(*) FROM offenders),
    'offenders',         coalesce((SELECT jsonb_agg(proname ORDER BY proname) FROM offenders), '[]'::jsonb)
  );
$fn$;

ALTER FUNCTION public.city_writer_signals() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.city_writer_signals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.city_writer_signals() TO service_role;

COMMENT ON FUNCTION public.city_writer_signals() IS
  'Names every public function that INSERTs into cities without calling '
  'city_resolve_or_create. Reports functions_scanned first: zero offenders '
  'over a scan that matched nothing is vacuous, not clean. Added after '
  '20261001110000 silently reverted commit_city_staging_item off the resolver '
  'by restating its body to add two columns.';

-- ---------------------------------------------------------------- verify
DO $verify$
DECLARE
  v_src  text;
  v_sig  jsonb;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'commit_city_staging_item';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'commit_city_staging_item is missing after this migration';
  END IF;
  IF v_src !~* 'city_resolve_or_create' THEN
    RAISE EXCEPTION 'commit_city_staging_item does not call city_resolve_or_create';
  END IF;
  IF v_src ~* 'insert\s+into\s+(public\.)?cities\M' THEN
    RAISE EXCEPTION 'commit_city_staging_item still inserts into cities directly';
  END IF;
  -- The capital columns must have survived the restore. A revert in the other
  -- direction -- resolver back, capital columns lost -- is the mirror mistake
  -- and would be just as silent.
  IF v_src !~ 'is_regional_capital' OR v_src !~ 'capital_of_region' THEN
    RAISE EXCEPTION 'commit_city_staging_item lost the capital-scope columns';
  END IF;
  IF v_src !~ 'v_has_regional' OR v_src !~ 'v_has_capital_of' THEN
    RAISE EXCEPTION 'commit_city_staging_item lost the capital key-presence semantics';
  END IF;

  v_sig := public.city_writer_signals();
  IF (v_sig->>'functions_scanned')::int < 100 THEN
    RAISE EXCEPTION 'city_writer_signals scanned only % functions -- the scan is broken', v_sig->>'functions_scanned';
  END IF;
  -- Positive control: the scan must still FIND the sanctioned inserter. A
  -- regex that matches nothing reports zero offenders and reads clean.
  IF (v_sig->>'inserters')::int < 1 THEN
    RAISE EXCEPTION 'city_writer_signals found no city inserters at all -- the pattern matches nothing';
  END IF;
  IF (v_sig->>'offender_count')::int <> 0 THEN
    RAISE EXCEPTION 'city writers bypassing city_resolve_or_create: %', v_sig->>'offenders';
  END IF;

  RAISE NOTICE 'ok: commit_city_staging_item routes through the resolver; % functions scanned, % inserter(s), 0 offenders',
    v_sig->>'functions_scanned', v_sig->>'inserters';
END $verify$;
