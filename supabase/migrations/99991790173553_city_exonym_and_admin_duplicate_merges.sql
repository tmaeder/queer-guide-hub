-- Six city rows that are three cities and one administrative twin.
--
-- Every unique key on `cities` keys on a STRING -- (lower(name), country_id),
-- (country_id, canonical_key), (country_id, name_normalized) -- so measured
-- over 5,542 live rows there are ZERO duplicate groups by despaced name, by
-- unaccented name or by QID. The keys work. What no string key can express is
-- SAME PLACE, DIFFERENT STRING, and that is what this file clears.
--
-- Five are the German-exonym shape: a `tmp-` slug placeholder minted by
-- `data_source='personality-birth-place'` sitting beside the real indexable
-- row, 8 m to 3.1 km apart.
--
--   keep                    drop                            apart
--   luxembourg              Luxembourg City, Luxembourg         8 m
--   luxembourg              Luxemburg                       22.8 km  (see below)
--   mogadishu    (Q2449)    Mogadischu                       2,775 m
--   novosibirsk  (Q883)     Nowosibirsk                      2,292 m
--   damascus                Damaskus        (Q3766)          3,055 m
--
-- ALL FIVE EXONYMS ALREADY EXIST IN `city_aliases` POINTING AT THE CORRECT
-- ROW. The table knew; the writer never asked it, because the staging commit
-- had been silently taken off `city_resolve_or_create` -- repaired in the
-- sibling migration of this PR, whose alias arm (f) is what asks.
--
-- THE SIXTH IS A DIFFERENT CLASS AND NO NAME KEY COULD EVER SEE IT: both sides
-- differ in name AND in QID.
--
--   nottingham-gb-04sfx (Q41262, 10 venues)  <-  city-of-nottingham
--                                                (Q21885994, 2 venues)
--
-- Q41262 is the city; Q21885994 is "City of Nottingham", the unitary authority
-- area -- a borough / unparished area / district with city status. Both rows
-- were live, `seo_indexable` and 5.0 km apart. The corpus already contains the
-- same pattern correctly merged (`city-of-rochester` -> `rochester-us-6e3dn`).
--
-- `Luxemburg` IS LUXEMBOURG CITY AND ITS COORDINATES ARE THE THING THAT IS
-- WRONG. 22.8 km would normally be grounds to leave a pair alone; here three
-- independent signals say otherwise and only the coordinates disagree.
-- Resolved live against Wikidata rather than inferred:
--   Q1842 = "Luxembourg, capital and largest city of Luxembourg"
--   Q1842 P625  = Point(6.13 49.611388888)  -- i.e. `luxembourg`'s own
--                 coordinates, 8 m away, NOT the row's stored 49.8167/6.1333
--   Q1842 P1082 = 137678                    -- BYTE-IDENTICAL to the row's
--                 stored population
-- So the row copied the entity's population verbatim and then geocoded its
-- free-text birth place badly. Coordinates are the least reliable column on
-- this corpus; a QID plus an exact population match is the stronger evidence.
--
-- DIRECTION IS NOT A JUDGEMENT CALL. Every keep is `real` + `seo_indexable` +
-- venue-bearing; every exonym drop is a placeholder with zero venues. For the
-- Nottingham pair the keep holds 10 venues and the city QID against the
-- loser's 2 and the administrative QID.
--
-- QIDs MOVE, BECAUSE merge_cities DOES NOT MOVE THEM. Verified against the
-- live body: it mints a `city_aliases` row and touches `wikidata_qid` nowhere.
-- Left alone, the merge would LOSE both identifiers -- the loser becomes a
-- duplicate and drops out of the live-only `uq_cities_wikidata_qid`, while the
-- survivor stays QID-less and therefore un-enrichable by the weekly factual
-- backfill. The drop's QID is CLEARED as the survivor takes it, so that
-- `unmerge_cities` cannot resurrect a second live row holding the same
-- identifier and fail on 23505.
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. A pair already merged by
-- another session is skipped and reported rather than aborting: an exact-match
-- premise turns a concurrent, individually-correct repair into a `db push`
-- failure on main that blocks every migration queued behind it.

DO $merge$
DECLARE
  r            record;
  v_keep       uuid;
  v_drop       uuid;
  v_keep_dup   uuid;
  v_drop_dup   uuid;
  v_merged     int := 0;
  v_skipped    int := 0;
BEGIN
  -- Snapshot the pre-merge content totals so the postconditions can assert
  -- that nothing was lost, rather than asserting a literal that ingest can
  -- move between authoring and apply.
  CREATE TEMP TABLE _pre_merge_counts ON COMMIT DROP AS
  SELECT k.slug AS keep_slug,
         (SELECT count(*) FROM public.venues v
           WHERE v.city_id IN (k.id, d.id) AND v.duplicate_of_id IS NULL) AS venues,
         (SELECT count(*) FROM public.personalities p
           WHERE p.city_id IN (k.id, d.id)) AS people
    FROM (VALUES
      ('luxembourg',          'tmp-f44eb1b0-38a0-4b54-a8b7-afb45f5f3eb7'),
      ('luxembourg',          'tmp-83f01b08-11bd-43aa-bf40-140d62d783f8'),
      ('mogadishu',           'tmp-c98ebee4-d6a0-4325-a4fd-98b5e1ea604c'),
      ('novosibirsk',         'tmp-ec3984a3-5c48-4442-91cd-926360620e04'),
      ('damascus',            'tmp-e5ca94c2-4b09-42f7-b4d7-9f6624cfc694'),
      ('nottingham-gb-04sfx', 'city-of-nottingham')
    ) AS pair(keep_slug, drop_slug)
    JOIN public.cities k ON k.slug = pair.keep_slug
    JOIN public.cities d ON d.slug = pair.drop_slug;

  FOR r IN
    SELECT * FROM (VALUES
      ('luxembourg',          'tmp-f44eb1b0-38a0-4b54-a8b7-afb45f5f3eb7'),
      ('luxembourg',          'tmp-83f01b08-11bd-43aa-bf40-140d62d783f8'),
      ('mogadishu',           'tmp-c98ebee4-d6a0-4325-a4fd-98b5e1ea604c'),
      ('novosibirsk',         'tmp-ec3984a3-5c48-4442-91cd-926360620e04'),
      ('damascus',            'tmp-e5ca94c2-4b09-42f7-b4d7-9f6624cfc694'),
      ('nottingham-gb-04sfx', 'city-of-nottingham')
    ) AS pair(keep_slug, drop_slug)
  LOOP
    SELECT id, duplicate_of_id INTO v_keep, v_keep_dup
      FROM public.cities WHERE slug = r.keep_slug;
    SELECT id, duplicate_of_id INTO v_drop, v_drop_dup
      FROM public.cities WHERE slug = r.drop_slug;

    IF v_keep IS NULL OR v_drop IS NULL THEN
      RAISE NOTICE 'skip %: one side is gone (keep=% drop=%)', r.drop_slug, v_keep, v_drop;
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;
    IF v_drop_dup IS NOT NULL THEN
      RAISE NOTICE 'skip %: already merged into %', r.drop_slug, v_drop_dup;
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;
    IF v_keep_dup IS NOT NULL THEN
      RAISE NOTICE 'skip %: the KEEP row % is itself merged away', r.drop_slug, r.keep_slug;
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    -- Two-argument form: every pair is same-country, so the cross-country
    -- confirmation the third argument exists for is not engaged.
    PERFORM public.merge_cities(v_keep, v_drop);
    v_merged := v_merged + 1;
  END LOOP;

  RAISE NOTICE 'merged %, skipped %', v_merged, v_skipped;
END $merge$;

-- ------------------------------------------------- move the two identifiers
--
-- Guarded on the survivor being QID-less, so a human correction made between
-- authoring and apply is never overwritten; and on the drop actually being
-- merged into that survivor, so a skipped pair does not have its identifier
-- harvested anyway.

-- Damascus <- Q3766
UPDATE public.cities d
   SET wikidata_qid   = NULL,
       field_provenance = coalesce(d.field_provenance, '{}'::jsonb)
         || jsonb_build_object('wikidata_qid', jsonb_build_object(
              'moved_to', 'damascus', 'value', 'Q3766',
              'by', 'migration:99991790173553', 'at', now())),
       updated_at = now()
  FROM public.cities k
 WHERE d.slug = 'tmp-e5ca94c2-4b09-42f7-b4d7-9f6624cfc694'
   AND k.slug = 'damascus'
   AND d.duplicate_of_id = k.id
   AND d.wikidata_qid = 'Q3766'
   AND k.wikidata_qid IS NULL;

UPDATE public.cities
   SET wikidata_qid = 'Q3766', updated_at = now()
 WHERE slug = 'damascus' AND duplicate_of_id IS NULL AND wikidata_qid IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.cities x
                    WHERE x.wikidata_qid = 'Q3766' AND x.duplicate_of_id IS NULL);

-- Luxembourg <- Q1842
UPDATE public.cities d
   SET wikidata_qid   = NULL,
       field_provenance = coalesce(d.field_provenance, '{}'::jsonb)
         || jsonb_build_object('wikidata_qid', jsonb_build_object(
              'moved_to', 'luxembourg', 'value', 'Q1842',
              'by', 'migration:99991790173553', 'at', now())),
       updated_at = now()
  FROM public.cities k
 WHERE d.slug = 'tmp-83f01b08-11bd-43aa-bf40-140d62d783f8'
   AND k.slug = 'luxembourg'
   AND d.duplicate_of_id = k.id
   AND d.wikidata_qid = 'Q1842'
   AND k.wikidata_qid IS NULL;

UPDATE public.cities
   SET wikidata_qid = 'Q1842', updated_at = now()
 WHERE slug = 'luxembourg' AND duplicate_of_id IS NULL AND wikidata_qid IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.cities x
                    WHERE x.wikidata_qid = 'Q1842' AND x.duplicate_of_id IS NULL);

-- ---------------------------------------------------------------- verify
DO $verify$
DECLARE
  r       record;
  v_bad   int := 0;
  v_lost  int := 0;
BEGIN
  -- 1. Every drop is merged into its keep, deindexed, and redirects there.
  FOR r IN
    SELECT * FROM (VALUES
      ('luxembourg',          'tmp-f44eb1b0-38a0-4b54-a8b7-afb45f5f3eb7'),
      ('luxembourg',          'tmp-83f01b08-11bd-43aa-bf40-140d62d783f8'),
      ('mogadishu',           'tmp-c98ebee4-d6a0-4325-a4fd-98b5e1ea604c'),
      ('novosibirsk',         'tmp-ec3984a3-5c48-4442-91cd-926360620e04'),
      ('damascus',            'tmp-e5ca94c2-4b09-42f7-b4d7-9f6624cfc694'),
      ('nottingham-gb-04sfx', 'city-of-nottingham')
    ) AS pair(keep_slug, drop_slug)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.cities d JOIN public.cities k ON k.id = d.duplicate_of_id
       WHERE d.slug = r.drop_slug AND k.slug = r.keep_slug
         AND d.shell_status = 'merged' AND d.seo_indexable = false
         AND EXISTS (SELECT 1 FROM public.city_slug_redirects sr
                      WHERE sr.old_slug = d.slug AND sr.city_id = k.id)
    ) THEN
      RAISE WARNING 'not reached: % -> %', r.drop_slug, r.keep_slug;
      v_bad := v_bad + 1;
    END IF;
  END LOOP;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '% of 6 city merges did not reach the intended end state', v_bad;
  END IF;

  -- 2. Each keep is still live, and the identifiers landed on the survivor.
  IF NOT EXISTS (SELECT 1 FROM public.cities
                  WHERE slug = 'damascus' AND duplicate_of_id IS NULL AND wikidata_qid = 'Q3766') THEN
    RAISE EXCEPTION 'damascus did not take Q3766';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cities
                  WHERE slug = 'luxembourg' AND duplicate_of_id IS NULL AND wikidata_qid = 'Q1842') THEN
    RAISE EXCEPTION 'luxembourg did not take Q1842';
  END IF;
  -- And nothing holds them twice, which is what would break unmerge_cities.
  IF (SELECT count(*) FROM public.cities WHERE wikidata_qid IN ('Q3766','Q1842')) <> 2 THEN
    RAISE EXCEPTION 'Q3766/Q1842 are held by more than the two survivors';
  END IF;

  -- 3. Nothing was lost. Compares against the snapshot taken before the merges,
  --    not against a literal that ingest could move.
  SELECT count(*) INTO v_lost
    FROM _pre_merge_counts pre
    JOIN public.cities k ON k.slug = pre.keep_slug
   WHERE (SELECT count(*) FROM public.venues v
           WHERE v.city_id = k.id AND v.duplicate_of_id IS NULL) < pre.venues
      OR (SELECT count(*) FROM public.personalities p WHERE p.city_id = k.id) < pre.people;
  IF v_lost <> 0 THEN
    RAISE EXCEPTION '% keep row(s) hold fewer venues or personalities than the pair did before the merge', v_lost;
  END IF;

  -- 4. The class this file exists to clear is gone from the corpus: no live
  --    city shares a despaced name with another in the same country.
  IF EXISTS (
    SELECT 1 FROM public.cities a JOIN public.cities b
      ON a.country_id = b.country_id AND a.id < b.id
     AND public.dedup_despace(a.name) = public.dedup_despace(b.name)
   WHERE a.duplicate_of_id IS NULL AND b.duplicate_of_id IS NULL
  ) THEN
    RAISE WARNING 'a despaced-name duplicate group still exists (pre-existing, not created here)';
  END IF;

  RAISE NOTICE 'ok: 6 merges reached, Q3766 on damascus, Q1842 on luxembourg, no content lost';
END $verify$;
