-- One resolver for every path that can create a city, and it refuses rather
-- than guesses.
--
-- WHY THE EXISTING DEFENCES DO NOT COVER THIS. `cities` carries four unique
-- keys -- (country_id, canonical_key), (lower(name), country_id), a partial
-- (country_id, name_normalized), and wikidata_qid -- and they work: measured on
-- production 2026-08-25, exact-name, QID and slug duplicate groups are all
-- ZERO over 5,552 live rows. Every one of them keys on THE STRING, so the only
-- duplicates that can still be created are the ones where the string differs,
-- and for those there is no key at all. 20260928110000 gives the nightly sweep
-- an arm that can SEE that class after the fact. This is the other half: the
-- write door, so the arm has less to find.
--
-- THE LIVE WRITERS DISAGREE WITH EACH OTHER. Five paths insert cities and no two
-- probe the same way:
--   commit_city_staging_item   advisory lock + geo_sources + dedup_match_id +
--                              (country_id, name_normalized)   -- correct shape
--   backfill-venue-cities      name + city_aliases in country, then plain insert
--   venue-import-helpers       country + ilike(name)
--   resolve-or-create-city     fast path probes; BOTH fallback branches insert
--                              with no probe at all
--   useCMSEditor               generic .insert(), no probe
-- The correct one is also the DEAD one: ingestion_staging has 1,000 rows for
-- target_table='cities' and the newest is 2026-04-21. The live creator is the
-- Nominatim drain -- 1,139 rows, 572 in the last 90 days -- and it is the one
-- that reaches the fewest of the signals. 128 of the 249 sub-2 km pairs on
-- production involve a row it minted.
--
-- Likewise `find_city_duplicate_candidates` is referenced exactly once in the
-- entire tree, from `_shared/dedup-engine.ts`, i.e. from that same dead staging
-- path; and `match_city_with_aliases` has NO caller at all outside the
-- generated types. The good probes exist and are wired to the pipe nothing
-- flows through.
--
-- THE PROBE LADDER IGNORES duplicate_of_id, DELIBERATELY. Two of the four
-- unique indexes are TOTAL -- they cover merged-away rows too -- so a probe that
-- filters `duplicate_of_id IS NULL` matches the partial index and is blind to
-- the total ones. 20260811100400 records what that costs: "Cagliari, Sardinia"
-- and "Quebec City, Quebec" each had a MERGED twin under the bare name, the
-- probe saw nothing, the rename fired, and 23505 aborted the whole 798-row
-- batch. Two poison rows stopped all progress. Every arm here therefore probes
-- the total key and then follows duplicate_of_id to the survivor, so a merged
-- name resolves to the city that absorbed it instead of being recreated.
--
-- WHAT COUNTS AS EVIDENCE TO CREATE. Country is mandatory -- the same posture as
-- commit_city_staging_item's `city_unresolved_country`, returned rather than
-- raised so a batch caller loses one row instead of a transaction. Beyond that
-- the caller must bring ONE of: coordinates, a wikidata_qid, a source entity id,
-- or an admin actor. A bare (name, country) from an automated crawler with no
-- coordinates is exactly the shape that minted Kapstadt beside Cape Town, and it
-- is the shape nothing can ever reunite afterwards: with no point, neither the
-- geo arm of the sweep nor a human triaging the pair has anything to go on.
-- Refusing it is the whole point of the function.
--
-- AMBIGUITY BLOCKS. More than one candidate, or a single candidate in the
-- 0.80-0.95 band, returns `refused` with the candidate list and creates nothing.
-- `cities` holds at most one row per (name, country), so it cannot represent
-- Charleston SC beside Charleston IL; picking the better-scoring row is how
-- Portland ME became Portland OR 116 times. A null city_id is recoverable, a
-- wrong one is not.
--
-- GEO PROXIMITY IS NEVER A MATCH HERE, only a reason to stop. A sole live city
-- within 2 km scores 0.85, which lands in the refuse band by construction --
-- the same call 20260928110000 makes for the sweep arm, for the same reason:
-- proximity cannot separate a duplicate from a district (Manhattan sits 14 m
-- from New York's centroid) and merge_cities is not reversible in practice.

-- ---------------------------------------------------------------------------
-- 1. Generalize city_resolve_queue: it is the sink for every refusal, not just
--    the personality path it was written for.
-- ---------------------------------------------------------------------------

ALTER TABLE public.city_resolve_queue
  ALTER COLUMN personality_id DROP NOT NULL,
  ALTER COLUMN birth_place    DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS requester     text,
  ADD COLUMN IF NOT EXISTS requester_ref uuid,
  ADD COLUMN IF NOT EXISTS raw_name      text,
  ADD COLUMN IF NOT EXISTS latitude      numeric,
  ADD COLUMN IF NOT EXISTS longitude     numeric,
  ADD COLUMN IF NOT EXISTS candidates    jsonb;

-- Backfill the requester for the rows already there, so the column is never
-- ambiguous about what a NULL means.
UPDATE public.city_resolve_queue
   SET requester = 'personality', requester_ref = personality_id,
       raw_name  = coalesce(raw_name, birth_place)
 WHERE requester IS NULL;

-- The old open-row key was (personality_id) WHERE state='pending', which cannot
-- express a non-personality requester. Same intent, wider subject.
DROP INDEX IF EXISTS public.uq_city_resolve_queue_open;
CREATE UNIQUE INDEX IF NOT EXISTS uq_city_resolve_queue_open
  ON public.city_resolve_queue (requester, requester_ref)
  WHERE state = 'pending' AND requester_ref IS NOT NULL;

-- A refusal with no owning row (an admin typing into the CMS) still deserves to
-- be recorded once rather than on every keystroke.
CREATE UNIQUE INDEX IF NOT EXISTS uq_city_resolve_queue_open_anon
  ON public.city_resolve_queue (requester, country_hint_id, lower(raw_name))
  WHERE state = 'pending' AND requester_ref IS NULL;

COMMENT ON TABLE public.city_resolve_queue IS
  'Every refusal from city_resolve_or_create lands here: a city that could not '
  'be resolved AND could not be safely created. Drained by city_resolve_drain. '
  'requester says who asked (personality | venue-geocode | cms | import | ...), '
  'requester_ref points at their row when they have one.';

-- ---------------------------------------------------------------------------
-- 2. city_resolve_enqueue -- the sink, idempotent per open subject.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.city_resolve_enqueue(
  p_name          text,
  p_country_id    uuid    DEFAULT NULL,
  p_region_hint   text    DEFAULT NULL,
  p_lat           numeric DEFAULT NULL,
  p_lng           numeric DEFAULT NULL,
  p_reason        text    DEFAULT 'ambiguous',
  p_candidates    jsonb   DEFAULT NULL,
  p_requester     text    DEFAULT 'unknown',
  p_requester_ref uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_requester_ref IS NOT NULL THEN
    INSERT INTO public.city_resolve_queue
      (personality_id, birth_place, raw_name, base_name, region_hint, country_hint_id,
       latitude, longitude, reason, candidates, requester, requester_ref, state)
    VALUES
      (CASE WHEN p_requester = 'personality' THEN p_requester_ref END,
       CASE WHEN p_requester = 'personality' THEN p_name END,
       p_name, p_name, p_region_hint, p_country_id,
       p_lat, p_lng, p_reason, p_candidates, p_requester, p_requester_ref, 'pending')
    ON CONFLICT (requester, requester_ref) WHERE state = 'pending' AND requester_ref IS NOT NULL
      DO UPDATE SET reason = EXCLUDED.reason, candidates = EXCLUDED.candidates,
                    raw_name = EXCLUDED.raw_name, updated_at = now()
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.city_resolve_queue
      (raw_name, base_name, region_hint, country_hint_id, latitude, longitude,
       reason, candidates, requester, state)
    VALUES
      (p_name, p_name, p_region_hint, p_country_id, p_lat, p_lng,
       p_reason, p_candidates, p_requester, 'pending')
    ON CONFLICT (requester, country_hint_id, lower(raw_name)) WHERE state = 'pending' AND requester_ref IS NULL
      DO UPDATE SET reason = EXCLUDED.reason, candidates = EXCLUDED.candidates, updated_at = now()
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;

ALTER FUNCTION public.city_resolve_enqueue(text,uuid,text,numeric,numeric,text,jsonb,text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.city_resolve_enqueue(text,uuid,text,numeric,numeric,text,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.city_resolve_enqueue(text,uuid,text,numeric,numeric,text,jsonb,text,uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The resolver.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.city_resolve_or_create(
  p_name             text,
  p_country_id       uuid    DEFAULT NULL,
  p_country_code     text    DEFAULT NULL,
  p_region_hint      text    DEFAULT NULL,
  p_lat              numeric DEFAULT NULL,
  p_lng              numeric DEFAULT NULL,
  p_wikidata_qid     text    DEFAULT NULL,
  p_source_slug      text    DEFAULT 'unknown',
  p_source_entity_id text    DEFAULT NULL,
  p_allow_create     boolean DEFAULT true,
  p_actor            text    DEFAULT 'resolver',
  p_requester        text    DEFAULT NULL,
  p_requester_ref    uuid    DEFAULT NULL
)
RETURNS TABLE (
  city_id    uuid,
  action     text,
  match_type text,
  confidence numeric,
  reason     text,
  candidates jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_split       record;
  v_base        text;
  v_region      text;
  v_country_id  uuid := p_country_id;
  v_key         text;
  v_nn          text;
  v_lock        bigint;
  v_hit         uuid;
  v_mt          text;
  v_conf        numeric;
  v_cands       jsonb;
  v_cand_count  int := 0;
  v_new_id      uuid;
  v_has_evidence boolean;
BEGIN
  p_name := nullif(btrim(p_name), '');
  IF p_name IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'empty_name', NULL::jsonb; RETURN;
  END IF;

  ----------------------------------------------------------------------------
  -- Country, or nothing. Same bar as commit_city_staging_item.
  ----------------------------------------------------------------------------
  IF v_country_id IS NULL AND nullif(btrim(p_country_code),'') IS NOT NULL THEN
    SELECT c.id INTO v_country_id FROM public.countries c
     WHERE c.code = upper(btrim(p_country_code)) AND c.duplicate_of_id IS NULL LIMIT 1;
  END IF;
  IF v_country_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'no_country', NULL::jsonb; RETURN;
  END IF;

  ----------------------------------------------------------------------------
  -- Split a qualified name through the existing splitter, so the probes see the
  -- same string trg_cities_aa_split_name would have written. A country hint in
  -- the string that contradicts the caller's country is the ONLY surviving
  -- evidence that one of the two is wrong (20260811100400 found 47 such rows),
  -- so it blocks instead of being silently stripped.
  ----------------------------------------------------------------------------
  v_base   := p_name;
  v_region := nullif(btrim(p_region_hint), '');
  IF position(',' IN p_name) > 0 THEN
    SELECT * INTO v_split FROM public.geo_split_place_name(p_name);
    IF v_split.did_split THEN
      IF v_split.country_id IS NOT NULL AND v_split.country_id <> v_country_id THEN
        RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'country_contradiction',
          jsonb_build_object('stated_country', v_split.country_id, 'given_country', v_country_id);
        RETURN;
      END IF;
      v_base := v_split.base;
      IF v_region IS NULL AND v_split.qualifier_kind <> 'ambiguous' THEN
        v_region := v_split.region_name;
      END IF;
    END IF;
  END IF;

  v_key := public.city_canonical_key(v_base);
  v_nn  := public.normalize_name(v_base);

  ----------------------------------------------------------------------------
  -- Serialize on the same key commit_city_staging_item uses, so the two paths
  -- cannot race each other into a duplicate.
  ----------------------------------------------------------------------------
  v_lock := hashtextextended(v_country_id::text || '|' || v_nn, 0);
  PERFORM pg_advisory_xact_lock(v_lock);

  ----------------------------------------------------------------------------
  -- Probe ladder. First hit wins; every arm resolves through duplicate_of_id.
  ----------------------------------------------------------------------------

  -- (a) QID. Deliberately NOT scoped to the country: a QID match that crosses a
  -- border is evidence the caller's country is wrong, not evidence of a second
  -- city, and returning it with a reason is more useful than creating a twin.
  IF v_hit IS NULL AND nullif(btrim(p_wikidata_qid),'') IS NOT NULL THEN
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit FROM public.cities c
     WHERE c.wikidata_qid = btrim(p_wikidata_qid) LIMIT 1;
    IF v_hit IS NOT NULL THEN
      v_mt := 'qid'; v_conf := 1.0;
      IF NOT EXISTS (SELECT 1 FROM public.cities c WHERE c.id = v_hit AND c.country_id = v_country_id) THEN
        RETURN QUERY SELECT v_hit, 'matched', v_mt, v_conf, 'qid_country_mismatch', NULL::jsonb; RETURN;
      END IF;
    END IF;
  END IF;

  -- (b) The source's own id for this city.
  IF v_hit IS NULL AND nullif(btrim(p_source_entity_id),'') IS NOT NULL THEN
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit
      FROM public.geo_sources gs JOIN public.cities c ON c.id = gs.city_id
     WHERE gs.entity_type = 'city' AND gs.source_slug = p_source_slug
       AND gs.source_entity_id = btrim(p_source_entity_id) LIMIT 1;
    IF v_hit IS NOT NULL THEN v_mt := 'source_key'; v_conf := 0.99; END IF;
  END IF;

  -- (c) The generated canonical key. TOTAL index -- merged rows included.
  IF v_hit IS NULL THEN
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit FROM public.cities c
     WHERE c.country_id = v_country_id AND c.canonical_key = v_key LIMIT 1;
    IF v_hit IS NOT NULL THEN v_mt := 'canonical_key'; v_conf := 0.99; END IF;
  END IF;

  -- (d) lower(name). Also TOTAL, and it catches what canonical_key's unaccent
  -- folds differently.
  IF v_hit IS NULL THEN
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit FROM public.cities c
     WHERE c.country_id = v_country_id AND lower(c.name) = lower(v_base) LIMIT 1;
    IF v_hit IS NOT NULL THEN v_mt := 'name_country'; v_conf := 0.98; END IF;
  END IF;

  -- (e) name_normalized, but only when it is a real key. normalize_name strips
  -- every non-[a-z0-9] character, so a name in Greek, Japanese, Korean, Hebrew,
  -- Cyrillic, Georgian, Thai, Khmer or Lao normalizes to the EMPTY STRING --
  -- 27 live rows do, and matching on '' would resolve every one of them to
  -- whichever row happens to be first. canonical_key (arm c) preserves the
  -- script and is the arm that actually protects those names.
  IF v_hit IS NULL AND length(v_nn) >= 3 THEN
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit FROM public.cities c
     WHERE c.country_id = v_country_id AND c.name_normalized = v_nn LIMIT 1;
    IF v_hit IS NOT NULL THEN v_mt := 'name_normalized'; v_conf := 0.98; END IF;
  END IF;

  -- (f) Alias. This is the arm that catches the exonym -- Kapstadt -> Cape Town,
  -- Teheran -> Tehran, Thorn -> Torun -- and it is only as good as the table
  -- behind it. merge_cities already mints an alias for every name it drops
  -- (207 of 210 merged names are covered); the Wikidata harvest is what makes
  -- it cover names that were never merged.
  IF v_hit IS NULL AND length(v_key) >= 3 THEN
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit
      FROM public.city_aliases a JOIN public.cities c ON c.id = a.city_id
     WHERE a.alias_key = v_key AND c.country_id = v_country_id LIMIT 1;
    IF v_hit IS NOT NULL THEN v_mt := 'alias'; v_conf := 0.95; END IF;
  END IF;

  IF v_hit IS NOT NULL THEN
    RETURN QUERY SELECT v_hit, 'matched', v_mt, v_conf, NULL::text, NULL::jsonb; RETURN;
  END IF;

  ----------------------------------------------------------------------------
  -- No identity hit. Collect near candidates and refuse if there are any --
  -- including the sole-city-within-2 km case, which scores 0.85 and so can
  -- never reach the 0.95 match bar. Proximity stops a create; it never makes one.
  ----------------------------------------------------------------------------
  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object(
             'city_id', x.id, 'name', x.name, 'distance_m', round(x.dm)::int,
             'wikidata_qid', x.wikidata_qid)), count(*)
      INTO v_cands, v_cand_count
      FROM (
        SELECT c.id, c.name, c.wikidata_qid,
               public.haversine_m(p_lat, p_lng, c.latitude, c.longitude) AS dm
          FROM public.cities c
         WHERE c.country_id = v_country_id AND c.duplicate_of_id IS NULL
           AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
           AND abs(c.latitude - p_lat) < 0.03 AND abs(c.longitude - p_lng) < 0.05
           AND public.haversine_m(p_lat, p_lng, c.latitude, c.longitude) < 2000
           -- Two distinct QIDs are two distinct entities. Same hard exclusion
           -- as the sweep arm, so a district never blocks its own city.
           AND NOT (c.wikidata_qid IS NOT NULL AND nullif(btrim(p_wikidata_qid),'') IS NOT NULL
                    AND c.wikidata_qid <> btrim(p_wikidata_qid))
         ORDER BY dm LIMIT 5
      ) x;
  END IF;

  IF v_cand_count > 0 THEN
    RETURN QUERY SELECT NULL::uuid, 'refused', 'geo_proximity', 0.85::numeric, 'ambiguous', v_cands;
    RETURN;
  END IF;

  ----------------------------------------------------------------------------
  -- Create, but only past the evidence bar.
  ----------------------------------------------------------------------------
  IF NOT p_allow_create THEN
    RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'create_not_allowed', NULL::jsonb; RETURN;
  END IF;

  v_has_evidence := (p_lat IS NOT NULL AND p_lng IS NOT NULL)
                 OR nullif(btrim(p_wikidata_qid),'') IS NOT NULL
                 OR nullif(btrim(p_source_entity_id),'') IS NOT NULL
                 OR p_actor = 'admin';

  IF NOT v_has_evidence THEN
    RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'insufficient_evidence', NULL::jsonb; RETURN;
  END IF;

  BEGIN
    INSERT INTO public.cities
      (name, country_id, region_name, latitude, longitude, wikidata_qid,
       data_source, last_synced_at, last_refreshed_at, created_at, updated_at,
       field_provenance)
    VALUES
      (v_base, v_country_id, v_region, p_lat, p_lng, nullif(btrim(p_wikidata_qid),''),
       p_source_slug, now(), now(), now(), now(),
       jsonb_build_object('city_resolve', jsonb_build_object(
         'action','created','source',p_source_slug,'actor',p_actor,'at',now())))
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    -- Someone won the race, or trg_cities_aa_split_name rewrote the name into
    -- one that already exists. Re-probe on the POST-trigger key, still holding
    -- the advisory lock. This one recovery replaces three hand-rolled copies
    -- (resolve-or-create-city, backfill-venue-cities, venue-import-helpers),
    -- which each followed duplicate_of_id slightly differently.
    SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit FROM public.cities c
     WHERE c.country_id = v_country_id AND c.canonical_key = v_key LIMIT 1;
    IF v_hit IS NULL THEN
      SELECT coalesce(c.duplicate_of_id, c.id) INTO v_hit FROM public.cities c
       WHERE c.country_id = v_country_id AND lower(c.name) = lower(v_base) LIMIT 1;
    END IF;
    IF v_hit IS NULL THEN
      RETURN QUERY SELECT NULL::uuid, 'refused', 'none', 0::numeric, 'unique_violation_unresolved', NULL::jsonb; RETURN;
    END IF;
    RETURN QUERY SELECT v_hit, 'raced', 'canonical_key', 0.99::numeric, NULL::text, NULL::jsonb; RETURN;
  END;

  IF nullif(btrim(p_source_entity_id),'') IS NOT NULL THEN
    INSERT INTO public.geo_sources
      (entity_type, city_id, source_slug, source_entity_id, confidence, is_primary, first_seen_at, last_seen_at)
    VALUES ('city', v_new_id, p_source_slug, btrim(p_source_entity_id), 1.0, true, now(), now())
    ON CONFLICT (source_slug, source_entity_id) DO UPDATE SET last_seen_at = now();
  END IF;

  RETURN QUERY SELECT v_new_id, 'created', 'none', 1.0::numeric, NULL::text, NULL::jsonb;
END; $$;

ALTER FUNCTION public.city_resolve_or_create(text,uuid,text,text,numeric,numeric,text,text,text,boolean,text,text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.city_resolve_or_create(text,uuid,text,text,numeric,numeric,text,text,text,boolean,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.city_resolve_or_create(text,uuid,text,text,numeric,numeric,text,text,text,boolean,text,text,uuid) TO service_role, authenticated;

COMMENT ON FUNCTION public.city_resolve_or_create(text,uuid,text,text,numeric,numeric,text,text,text,boolean,text,text,uuid) IS
  'The only sanctioned way to turn a city name into a city_id. Probes qid, '
  'source key, canonical_key, lower(name), name_normalized and city_aliases -- '
  'all ignoring duplicate_of_id and resolving to the survivor -- then refuses '
  'on ambiguity, on a contradicting country in the name, and on a create with '
  'no coordinates/QID/source-id/admin behind it. Refusals belong in '
  'city_resolve_enqueue, not in a guess.';
