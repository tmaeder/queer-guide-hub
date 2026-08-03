-- Normalize the 798 city names that carry a region/country qualifier, and
-- queue the duplicates that normalizing reveals.
--
-- trg_cities_aa_split_name (20260811100000) only fires on INSERT or UPDATE OF
-- name, so it protects new rows and leaves the existing corpus alone —
-- deliberately: rewriting 798 names is a reviewed step, not a side effect of a
-- migration. This is that step, batched.
--
-- WHY THIS IS THE KEYSTONE FOR DEDUP. The nightly run_dedup_truth_sweep
-- already has a city arm that is exactly right — same country, identical
-- dedup_despace(name), coordinates within 10 km. It has simply never been able
-- to see this corpus, because dedup_despace('Vancouver, British Columbia') is
-- 'vancouverbritishcolumbia' and dedup_despace('Vancouver') is 'vancouver'.
-- Normalizing the names makes the existing sweep work on them with no change to
-- the sweep at all. Measured on production: after normalization the sweep key
-- finds 192 same-country pairs, 139 of them within 10 km.
--
-- A wikidata_qid equality arm was CONSIDERED AND REJECTED as dead code:
-- uq_cities_wikidata_qid is UNIQUE over live rows, so two live cities can never
-- share a QID (measured: 0 such pairs). The QID collision is a WRITE-time
-- signal, caught by city-factual-backfill, not a pair that can sit in the table.
--
-- COLLISIONS ARE NOT RENAMED. If the base name already exists in the same
-- country, renaming would abort the whole batch on a unique index. That pair is
-- precisely a duplicate, so the name is left alone and the pair is recorded —
-- recoverable either way.
--
-- THERE ARE TWO NAME-UNIQUENESS INDEXES AND THEY COVER DIFFERENT ROWS:
--   uk_cities_country_name_active (country_id, name_normalized)
--                                 WHERE duplicate_of_id IS NULL   -- partial
--   idx_cities_name_country_unique (lower(name), country_id)      -- TOTAL
-- The second one also covers rows that were merged away. A probe that filters
-- `duplicate_of_id IS NULL` matches the first index and is blind to the second:
-- "Cagliari, Sardinia" and "Quebec City, Quebec" each have a MERGED twin under
-- the bare name, so the probe saw nothing, the rename fired, and the whole batch
-- aborted with 23505. Two poison rows out of 798 were enough to stop the
-- backfill making any progress at all, because a batch is one transaction. The
-- probe below therefore ignores duplicate_of_id entirely.
--
-- A STATED COUNTRY THAT CONTRADICTS country_id BLOCKS THE RENAME. 47 rows name
-- a country their own country_id disagrees with — "Berlin, Germany" filed under
-- Sweden, "Tokyo, Japan" under Sweden, "London, United Kingdom" under Italy,
-- "Los Angeles, United States" under Thailand. That suffix is the ONLY surviving
-- evidence the country is wrong, and every consumer trusts country_id over the
-- name, so stripping it would erase the contradiction and leave the corruption
-- permanent and invisible. These rows keep their names, get needs_attention, and
-- are picked up by the country repair path.

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.run_city_name_normalize(p_batch int DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r            record;
  v            record;
  v_other      record;
  v_keep       uuid;
  v_drop       uuid;
  v_km         double precision;
  n_renamed    int := 0;
  n_queued     int := 0;
  n_skipped    int := 0;
  n_conflict   int := 0;
  n_far        int := 0;
  n_unknown    int := 0;
  n_merged_twin int := 0;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT public.has_any_role_jwt(ARRAY['admin'::public.app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Cap is load-bearing: every city UPDATE fires trg_search_documents_city and
  -- the geo-spine sync. The city safety backfill is capped at 300 for the same
  -- reason; stay under it.
  p_batch := least(greatest(coalesce(p_batch, 200), 1), 300);

  FOR r IN
    SELECT c.id, c.name, c.country_id, c.region_name, c.latitude, c.longitude,
           c.completeness_score
      FROM public.cities c
     WHERE c.duplicate_of_id IS NULL
       AND position(',' IN c.name) > 0
       -- Terminal states: a row we already renamed, already queued, or already
       -- judged unqualified must not be revisited on the next run.
       AND coalesce(c.enrichment_status #>> '{name_normalize,state}', '') = ''
     ORDER BY c.id
     LIMIT p_batch
  LOOP
    SELECT * INTO v FROM public.geo_split_place_name(r.name);

    IF NOT v.did_split OR v.base = r.name THEN
      n_skipped := n_skipped + 1;
      UPDATE public.cities SET enrichment_status = coalesce(enrichment_status, '{}'::jsonb)
        || jsonb_build_object('name_normalize',
             jsonb_build_object('state', 'not_qualified', 'at', now()))
       WHERE id = r.id;
      CONTINUE;
    END IF;

    -- The name states a country that country_id disagrees with. The suffix is
    -- the only surviving evidence of the disagreement; stripping it would make
    -- the corruption permanent and unfindable. Keep the name, flag the row.
    IF v.country_id IS NOT NULL AND v.country_id <> r.country_id THEN
      n_conflict := n_conflict + 1;
      UPDATE public.cities SET needs_attention = true,
             enrichment_status = coalesce(enrichment_status, '{}'::jsonb)
               || jsonb_build_object('name_normalize', jsonb_build_object(
                    'state', 'blocked_country_conflict',
                    'stated_country', v.country_id, 'filed_under', r.country_id, 'at', now()))
       WHERE id = r.id;
      CONTINUE;
    END IF;

    -- Collision probe. NO duplicate_of_id filter: idx_cities_name_country_unique
    -- is total and a merged twin will still abort the rename.
    SELECT o.id, o.name, o.latitude, o.longitude, o.completeness_score, o.duplicate_of_id
      INTO v_other
      FROM public.cities o
     WHERE o.country_id = r.country_id
       AND lower(o.name) = lower(v.base)
       AND o.id <> r.id
     ORDER BY (o.duplicate_of_id IS NULL) DESC
     LIMIT 1;

    IF v_other.id IS NOT NULL THEN
      -- A merged twin is not a merge candidate: the pair has already been
      -- resolved once and queueing it would ask an admin to re-decide it.
      IF v_other.duplicate_of_id IS NOT NULL THEN
        n_merged_twin := n_merged_twin + 1;
        UPDATE public.cities SET
               enrichment_status = coalesce(enrichment_status, '{}'::jsonb)
                 || jsonb_build_object('name_normalize', jsonb_build_object(
                      'state', 'blocked_merged_twin', 'of', v_other.id, 'at', now()))
         WHERE id = r.id;
        CONTINUE;
      END IF;

      v_km := public.haversine_m(r.latitude, r.longitude, v_other.latitude, v_other.longitude) / 1000.0;

      -- Only a CORROBORATED pair reaches the merge queue. Same country + same
      -- base name is not enough on its own: Saint-Denis (Île-de-France) and
      -- Saint-Denis (Réunion) are 9,372 km apart and both French, and
      -- Quincy/Gloucester/Norwalk repeat the pattern. Queueing those at 0.85
      -- puts genuinely different places in front of approve_dedup_review_batch,
      -- which does NOT exclude cities. Unknown or far distance => flag only.
      IF v_km IS NOT NULL AND v_km < 25 THEN
        IF coalesce(r.completeness_score, 0) > coalesce(v_other.completeness_score, 0) THEN
          v_keep := r.id; v_drop := v_other.id;
        ELSE
          v_keep := v_other.id; v_drop := r.id;
        END IF;

        INSERT INTO public.dedup_review_queue
          (entity_type, keep_id, drop_id, confidence, reason, source, cluster)
        VALUES ('city', v_keep, v_drop,
                CASE WHEN v_km < 10 THEN 0.97 ELSE 0.90 END,
                'qualified_name_base_match', 'city_name_normalize',
                jsonb_build_object('base', v.base, 'qualified_name', r.name,
                                   'bare_name', v_other.name, 'km_apart', round(v_km::numeric, 2),
                                   'qualifier', v.qualifier, 'qualifier_kind', v.qualifier_kind))
        ON CONFLICT DO NOTHING;

        UPDATE public.cities SET needs_attention = true,
               enrichment_status = coalesce(enrichment_status, '{}'::jsonb)
                 || jsonb_build_object('name_normalize',
                      jsonb_build_object('state', 'blocked_duplicate', 'of', v_other.id,
                                         'km_apart', round(v_km::numeric, 2), 'at', now()))
         WHERE id = r.id;
        n_queued := n_queued + 1;
      ELSE
        -- Two very different populations, kept in separate states on purpose.
        -- A KNOWN far distance is proof they are different places (Saint-Denis
        -- Île-de-France vs Saint-Denis Réunion, 9,372 km). An UNKNOWN distance
        -- is only missing evidence, and those rows -- Avignon/Avignon,
        -- Madrid/Madrid, Kapstadt/Kapstadt -- are near-certain duplicates
        -- waiting on a coordinate backfill. 377 of the 798 qualified rows have
        -- no coordinates at all, so this is structural, not a tail case.
        -- Filing them under one name would bury the recoverable ones with the
        -- settled ones.
        IF v_km IS NULL THEN
          n_unknown := n_unknown + 1;
        ELSE
          n_far := n_far + 1;
        END IF;
        UPDATE public.cities SET needs_attention = true,
               enrichment_status = coalesce(enrichment_status, '{}'::jsonb)
                 || jsonb_build_object('name_normalize', jsonb_build_object(
                      'state', CASE WHEN v_km IS NULL
                                    THEN 'blocked_collision_unknown_distance'
                                    ELSE 'blocked_collision_far' END,
                      'of', v_other.id,
                      'km_apart', round(v_km::numeric, 2), 'at', now()))
         WHERE id = r.id;
      END IF;
      CONTINUE;
    END IF;

    -- Safe to rename. trg_cities_aa_split_name re-runs on the already-split
    -- value and no-ops (no comma left).
    UPDATE public.cities c
       SET name = v.base,
           region_name = CASE
             WHEN c.region_name IS NOT NULL THEN c.region_name
             WHEN v.region_name IS NOT NULL AND v.qualifier_kind <> 'ambiguous'
                  AND (v.country_id IS NULL OR v.country_id = c.country_id) THEN v.region_name
             ELSE c.region_name END,
           field_provenance = coalesce(c.field_provenance, '{}'::jsonb)
             || jsonb_build_object('name', jsonb_build_object(
                  'value', v.base, 'source', 'derived:qualified_name_split',
                  'original', r.name, 'qualifier', v.qualifier,
                  'qualifier_kind', v.qualifier_kind, 'at', now())),
           enrichment_status = coalesce(c.enrichment_status, '{}'::jsonb)
             || jsonb_build_object('name_normalize',
                  jsonb_build_object('state', 'normalized', 'at', now()))
     WHERE c.id = r.id;
    n_renamed := n_renamed + 1;
  END LOOP;

  RETURN jsonb_build_object('renamed', n_renamed, 'queued_as_duplicate', n_queued,
                            'blocked_country_conflict', n_conflict,
                            'blocked_collision_far', n_far,
                            'blocked_collision_unknown_distance', n_unknown,
                            'blocked_merged_twin', n_merged_twin,
                            'skipped_unqualified', n_skipped,
                            'remaining', (SELECT count(*) FROM public.cities c
                                           WHERE c.duplicate_of_id IS NULL
                                             AND position(',' IN c.name) > 0
                                             AND coalesce(c.enrichment_status #>> '{name_normalize,state}', '') = ''));
END;
$$;

COMMENT ON FUNCTION public.run_city_name_normalize(int) IS
  'Batched: moves a recognised region/country qualifier out of cities.name into '
  'region_name. A base name that already exists in the same country is a '
  'duplicate -- queued to dedup_review_queue, never renamed (that would abort '
  'the batch on uk_cities_country_name_active).';

REVOKE ALL ON FUNCTION public.run_city_name_normalize(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_city_name_normalize(int) TO service_role;

-- Deliberately NOT registered as a cron. This is a finite one-shot backfill
-- over 798 rows, run and reviewed by an operator; leaving a job behind that
-- can only ever find zero rows is how the dead-cron backlog grows.
