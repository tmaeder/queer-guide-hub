-- Deterministic street-address keys for venue dedup.
--
-- WHY THIS EXISTS: the venue auto-merge gate is `both coordinates present AND
-- haversine < 150 m`, and on this corpus that gate matches NOTHING. Measured on
-- prod 2026-09-06:
--
--   run_dedup_truth_sweep('venue','dry_run')
--     -> {"would_merge": 0, "would_queue": 480, "skipped": 3}
--
-- 483 candidate pairs, zero auto-eligible, while 530 pairs age in
-- dedup_review_queue (oldest 43 days) and admin_automations reports the sweep
-- green in mode='full' with consecutive_failures=0. Same shape as the event
-- incident of 20270822093311..093917: a green cron in front of a blind engine.
--
-- COORDINATES ARE THE WRONG SIGNAL HERE, and that is a measurement, not a
-- preference. 2,665 live venues sit on 908 SHARED coordinate points (largest
-- pile 32) because a missing geocode falls back to a city centroid. Hand-read
-- pairs whose addresses are byte-identical measure:
--
--   Spartakus, Krakow      ul. Konopnickiej 20        507,890 m apart
--   Sauna Le 9, Le Cannet  8 Chemin de l'Industrie    466,566 m
--   Ganimedes, Lodz        Sienkiewicza street 37 B   423,118 m
--   S&M Cocktail Bar       176 Cuba Street            379,687 m
--   Xin Tao-yuan           182 Min-zhu Road           281,736 m
--   Peninsula Sauna        16 Cumberland Drive         41,997 m
--
-- Meanwhile `distance_m = 0` is the placeholder SIGNATURE, not proximity: the
-- one venue pair a human ever rejected as auto-eligible -- "Jessheim Pride" vs
-- "Fredrikstad Pride", two different Norwegian towns -- sits in the queue at
-- exactly 0 m. So distance may neither gate a merge nor veto one.
--
-- WHAT REPLACES IT IS THE STREET ADDRESS. Sampled from the 91 pairs where these
-- two keys agree, 20 rows read by hand: 20/20 genuine duplicates. Sampled from
-- the 57 pairs that agree across a city_id boundary in one country, 15 read by
-- hand: 15/15 genuine, every one a city_id mislink ("Bournemouth Saunabar"
-- filed under Brighton; "Gothic Sauna" filed as both Lugano and Como).
--
-- THE COMPARATOR IS DELIBERATELY CONSERVATIVE. It requires the leading number to
-- match exactly AND one street key to contain the other. "1701 East Olive way"
-- and "1701 E Olive Way (at Boylston Ave. E), Seattle, WA 98102" do NOT satisfy
-- it -- "east" vs "e" breaks containment -- and that pair is caught by a
-- different arm instead. Low recall with 20/20 precision is the correct trade for
-- a rung that merges without a human; widening it is a decision to take against a
-- fresh sample, not a tuning knob.
--
-- The leading number is often a postcode rather than a house number (an address
-- like "Lincoln Road, Miami Beach, FL 33139" yields 33139). That is safe only
-- BECAUSE containment is also required: two different venues sharing a postcode
-- have street keys that neither contain the other, so the pair falls through.
-- Do not relax one half without re-measuring the other.
--
-- These are peers of dedup_despace / dedup_core_tokens (20260623150504) and copy
-- their declaration exactly: IMMUTABLE PARALLEL SAFE with 'extensions' on the
-- search_path so the one-arg unaccent() resolves.

CREATE OR REPLACE FUNCTION public.dedup_house_number(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public','extensions','pg_catalog' AS $$
  SELECT (regexp_match(lower(extensions.unaccent(coalesce(p,''))), '(\d+)'))[1];
$$;

COMMENT ON FUNCTION public.dedup_house_number(text) IS
  'Leading digit run of an address (house number, or a postcode when no house '
  'number is present). Only meaningful paired with dedup_street_key containment '
  '-- alone it will happily equate two venues that share a postcode.';

CREATE OR REPLACE FUNCTION public.dedup_street_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public','extensions','pg_catalog' AS $$
  SELECT public.dedup_despace(
    regexp_replace(lower(extensions.unaccent(coalesce(p,''))), '[0-9]', '', 'g'));
$$;

COMMENT ON FUNCTION public.dedup_street_key(text) IS
  'Address with every digit removed, then despaced. Compared by containment (one '
  'side inside the other, both >= 6 chars) so a bare street survives being '
  'concatenated with a city, postcode and country by a different source.';

GRANT EXECUTE ON FUNCTION public.dedup_house_number(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.dedup_street_key(text)   TO authenticated, anon, service_role;

-- Index for the new cross-city candidate generator (same country, same despaced
-- name, DIFFERENT city_id). Mirrors idx_venues_city_despace. A FUNCTIONAL index,
-- never a stored column: a stored column on venues fires trg_sync_geo_spine ->
-- search_reindex_queue for every row it is backfilled onto.
CREATE INDEX IF NOT EXISTS idx_venues_country_despace
  ON public.venues (country_id, public.dedup_despace(name)) WHERE duplicate_of_id IS NULL;

-- Prove the keys behave on real rows before anything gates a merge on them.
-- Both halves matter: an assertion that only checks the positive would pass on a
-- comparator that matched everything.
DO $verify$
DECLARE v_agree int; v_conflict int;
BEGIN
  IF public.dedup_house_number('1701 East Olive way') IS DISTINCT FROM '1701' THEN
    RAISE EXCEPTION 'dedup_house_number did not read the leading number';
  END IF;
  IF public.dedup_house_number('Lincoln Road') IS NOT NULL THEN
    RAISE EXCEPTION 'dedup_house_number invented a number for a numberless address';
  END IF;
  IF public.dedup_street_key('16 Cumberland Drive') IS DISTINCT FROM 'cumberlanddrive' THEN
    RAISE EXCEPTION 'dedup_street_key: got %', public.dedup_street_key('16 Cumberland Drive');
  END IF;
  -- containment is the whole point: a bare street must survive being suffixed
  IF position(public.dedup_street_key('63 Cuba Street')
              in public.dedup_street_key(
                   '63 Cuba Street, Wellington, Greater Wellington, New Zealand')) = 0 THEN
    RAISE EXCEPTION 'dedup_street_key lost containment across source formatting';
  END IF;

  SELECT count(*) FILTER (WHERE a.hn = b.hn),
         count(*) FILTER (WHERE a.hn <> b.hn)
    INTO v_agree, v_conflict
  FROM (SELECT id, city_id, public.dedup_despace(name) dsp,
               public.dedup_house_number(address) hn
          FROM public.venues WHERE duplicate_of_id IS NULL AND address <> '') a
  JOIN (SELECT id, city_id, public.dedup_despace(name) dsp,
               public.dedup_house_number(address) hn
          FROM public.venues WHERE duplicate_of_id IS NULL AND address <> '') b
    ON a.city_id = b.city_id AND a.id < b.id AND a.dsp = b.dsp
   AND a.hn IS NOT NULL AND b.hn IS NOT NULL;

  -- Measured 2026-09-06: 212 agree / 98 conflict across the whole candidate set.
  -- Zero on either side would mean the key is degenerate, in opposite directions.
  IF v_agree = 0 THEN
    RAISE EXCEPTION 'house numbers agree on no same-name pair at all -- the key is not reading addresses';
  END IF;
  IF v_conflict = 0 THEN
    RAISE EXCEPTION 'house numbers conflict on no pair at all -- the key cannot discriminate, so the veto it feeds is inert';
  END IF;
  RAISE NOTICE 'address keys live: % same-name pairs agree on house number, % conflict', v_agree, v_conflict;
END $verify$;
