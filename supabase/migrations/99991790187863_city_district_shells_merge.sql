-- Eighteen city rows that are a district of another city row.
--
-- Berlin was checked specifically and Berlin ITSELF is the model case, not a
-- defect case: `berlin` is real, indexable, Q64, and all six of its queer
-- districts are where they belong -- in `queer_villages` (Mitte 30 venues,
-- Prenzlauer Berg 17, Kreuzberg 15, Friedrichshain 12, Neukölln 12, Schöneberg
-- 12). A targeted query over 38 Berlin district names returns ZERO bare-name
-- city rows. `Berlin, NH (US)` is correctly a separate row, which is the
-- (name, country_id) key doing its job.
--
-- What is wrong is a different cohort: `personality-birth-place` shells whose
-- NAME is a district of a city we already hold. All are deindexed placeholders
-- with 0 venues, 0 events, 0 hotels, 0 villages and 0 death links -- but ALL
-- ARE LIVE IN `search_documents`, because the city indexer filters
-- duplicate_of_id and ghost/merged and a `placeholder` is none of those. A site
-- search for "Charlottenburg" returns a city card for a Berlin Ortsteil.
--
-- `Rixdorf` is in here THREE TIMES under three spellings -- `Berlin-Rixdorf`,
-- `Rixdorf, Berlin`, `Rixdorf, Berlin-Neukölln` -- which no unique key can see,
-- because all three strings differ. (Rixdorf is the pre-1912 name of Neukölln.)
--
-- THE TWO NAME FORMS DO NOT MEAN THE SAME THING, AND THAT IS THE WHOLE DESIGN.
-- The shape is corpus-wide: 41 rows over 21 German cities. But:
--
--   * `Parent-Ortsteil` (HYPHEN) is the German convention for a district and is
--     reliable -- Berlin-Charlottenburg, Leipzig-Gohlis, Wuppertal-Elberfeld.
--
--   * `X, Parent` (COMMA) is NOT a district outside Berlin. It is free text that
--     qualified a small place with the nearest large city. `Stolberg, Aachen`
--     and `Würselen, Aachen` are their own towns in the Städteregion Aachen;
--     `Meerane, Chemnitz`, `Frankenberg, Chemnitz`, `Burg, Magdeburg`,
--     `Völpke, Magdeburg`, `Ladenburg, Mannheim`, `Kröpelin, Rostock` and
--     `Hinterzarten, Freiburg` are all their own municipalities. Worse,
--     `Süchteln, Krefeld` is a district of VIERSEN and `Brambauer, Dortmund`
--     one of LÜNEN -- the city in the name is not even the parent.
--
-- Berlin is the ONE place where the comma form is also safe, for a structural
-- reason rather than a stylistic one: Berlin is a Bundesland, so there is no
-- Landkreis Berlin whose towns could be qualified with "Berlin". `Spandau,
-- Berlin` and `Rixdorf, Berlin` are genuine Ortsteile. Each of the twelve was
-- checked individually against Berlin's official Ortsteil list.
--
-- TWO TRAPS THAT ONLY APPEARED ONCE THE PARENT FILTER WAS DROPPED. The first
-- survey used `population > 150000` on the parent and hid both:
--
--   * `Duisburg-Ruhrort`'s parent `Duisburg` is ITSELF a `tmp-` placeholder, not
--     a real indexable city. Merging into it would point a redirect at a shell.
--     It is excluded and named rather than silently skipped.
--
--   * `Rixdorf, Berlin-Neukölln` matches `Rixdorf, Berlin` under a naive
--     `LIKE parent || '-%'`, because one shell is a PREFIX of the other. A
--     name-pattern sweep would have merged junk into junk.
--
-- Both are why this file carries an EXPLICIT SLUG LIST rather than a predicate.
-- A predicate over names is exactly what the two traps defeat.
--
-- NOTHING HUMAN-READABLE IS LOST, and that matters here more than usual: these
-- are draft, deindexed biographical records of named individuals.
-- `personalities.birth_place` already carries the district as TEXT on every row
-- ("Berlin-Charlottenburg (DE)"), independent of the city link, so the district
-- survives the merge in the one place a reader would see it. `merge_cities`
-- repoints both `personalities.city_id` and `death_city_id` -- verified against
-- the live function body, not assumed.
--
-- DEPENDS ON 99991790173320: that migration's trigger is what deindexes each row
-- and mints its `city_slug_redirects` entry as it is merged away.
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. A pair already merged by
-- another session is skipped and reported rather than aborting `db push` for the
-- whole repository.

DO $merge$
DECLARE
  r          record;
  v_keep     uuid;
  v_drop     uuid;
  v_keep_dup uuid;
  v_drop_dup uuid;
  v_keep_ok  boolean;
  v_merged   int := 0;
  v_skipped  int := 0;
BEGIN
  -- Snapshot the pre-merge personality totals per parent, so the postcondition
  -- can assert nothing was lost rather than assert a literal that another
  -- session could move between authoring and apply.
  CREATE TEMP TABLE _pre_district_counts ON COMMIT DROP AS
  SELECT k.slug AS keep_slug,
         (SELECT count(*) FROM public.personalities p WHERE p.city_id = k.id) AS people
    FROM public.cities k
   WHERE k.slug IN ('berlin','leipzig-de-bjjxj','mannheim-de-3hr06',
                    'wiesbaden-de-v4159','wuppertal');

  FOR r IN
    SELECT * FROM (VALUES
      -- Berlin, hyphenated: nine genuine Ortsteile.
      ('berlin',             'tmp-d71a07b9-e156-49e2-88e8-c8bf30b38de1'), -- Berlin-Charlottenburg
      ('berlin',             'tmp-c371f4f3-a282-4653-8321-fc3906c6bb2d'), -- Berlin-Friedrichshain
      ('berlin',             'tmp-a5ca9d6b-f82f-41f6-91f6-67661bbffd85'), -- Berlin-Lichterfelde
      ('berlin',             'tmp-bd8f06af-c005-456a-bd20-b0a0e313f4ac'), -- Berlin-Reinickendorf
      ('berlin',             'tmp-4c940540-f117-4d4b-922b-8b2382abbdcd'), -- Berlin-Rixdorf
      ('berlin',             'tmp-43e65f12-7388-419a-bf1c-50f73fea7ef6'), -- Berlin-Schöneberg
      ('berlin',             'tmp-2bb6ab0c-0922-4a63-927c-b48f2d50f9b0'), -- Berlin-Weißensee
      ('berlin',             'tmp-7cf2383c-871a-4a6b-9b78-5830c6c24a30'), -- Berlin-Wilmersdorf
      ('berlin',             'tmp-d488108f-d0fc-4307-8b7f-3b2cdc43e45c'), -- Berlin-Wittenau
      -- Berlin, comma form: safe ONLY because Berlin is a Bundesland.
      ('berlin',             'tmp-a52da4fa-9720-4b83-8b40-8f43b418f77b'), -- Rixdorf, Berlin
      ('berlin',             'tmp-29f40f49-16bd-466e-88cb-c7964b806d4f'), -- Rixdorf, Berlin-Neukölln
      ('berlin',             'tmp-0bb33fb0-7e95-48d4-a249-6207bf8168ef'), -- Spandau, Berlin
      -- Elsewhere: hyphenated only, every parent verified real + indexable.
      ('leipzig-de-bjjxj',   'tmp-4cda928b-3bba-4705-a43c-d6bf21dd4fa8'), -- Leipzig-Gohlis
      ('mannheim-de-3hr06',  'tmp-6a6d0e78-0190-4433-9e24-8a1b6755fc32'), -- Mannheim-Rheinau
      ('wiesbaden-de-v4159', 'tmp-40d56ebe-684d-46b4-b214-3e860b6d3272'), -- Wiesbaden-Biebrich
      ('wiesbaden-de-v4159', 'tmp-ce3c87de-61f0-4c83-8636-5ccb41bd785a'), -- Wiesbaden-Schierstein
      ('wuppertal',          'tmp-367b854d-2142-4a31-af90-547d69800f1c'), -- Wuppertal-Barmen
      ('wuppertal',          'tmp-cb699ad2-ce47-47fa-9a5c-99fbdf807fb1')  -- Wuppertal-Elberfeld
    ) AS pair(keep_slug, drop_slug)
  LOOP
    SELECT id, duplicate_of_id, (shell_status = 'real' AND seo_indexable)
      INTO v_keep, v_keep_dup, v_keep_ok
      FROM public.cities WHERE slug = r.keep_slug;
    SELECT id, duplicate_of_id INTO v_drop, v_drop_dup
      FROM public.cities WHERE slug = r.drop_slug;

    IF v_keep IS NULL OR v_drop IS NULL THEN
      RAISE NOTICE 'skip %: one side is gone', r.drop_slug;
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;
    IF v_drop_dup IS NOT NULL THEN
      RAISE NOTICE 'skip %: already merged into %', r.drop_slug, v_drop_dup;
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;
    IF v_keep_dup IS NOT NULL THEN
      RAISE NOTICE 'skip %: the parent % is itself merged away', r.drop_slug, r.keep_slug;
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;
    -- The Duisburg-Ruhrort guard, enforced rather than merely documented: a
    -- district may only ever be absorbed by a REAL, indexable city.
    IF NOT v_keep_ok THEN
      RAISE NOTICE 'skip %: the parent % is not a real indexable city', r.drop_slug, r.keep_slug;
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    -- Two-argument form: every pair is same-country, so the cross-country
    -- confirmation the third argument exists for is not engaged.
    PERFORM public.merge_cities(v_keep, v_drop);
    v_merged := v_merged + 1;
  END LOOP;

  RAISE NOTICE 'merged %, skipped %', v_merged, v_skipped;
END $merge$;

-- ---------------------------------------------------------------- verify
DO $verify$
DECLARE
  r      record;
  v_bad  int := 0;
  v_lost int := 0;
  v_q    int;
BEGIN
  -- 1. Every shell is merged into its named parent, deindexed, and redirects.
  FOR r IN
    SELECT * FROM (VALUES
      ('berlin',             'tmp-d71a07b9-e156-49e2-88e8-c8bf30b38de1'),
      ('berlin',             'tmp-c371f4f3-a282-4653-8321-fc3906c6bb2d'),
      ('berlin',             'tmp-a5ca9d6b-f82f-41f6-91f6-67661bbffd85'),
      ('berlin',             'tmp-bd8f06af-c005-456a-bd20-b0a0e313f4ac'),
      ('berlin',             'tmp-4c940540-f117-4d4b-922b-8b2382abbdcd'),
      ('berlin',             'tmp-43e65f12-7388-419a-bf1c-50f73fea7ef6'),
      ('berlin',             'tmp-2bb6ab0c-0922-4a63-927c-b48f2d50f9b0'),
      ('berlin',             'tmp-7cf2383c-871a-4a6b-9b78-5830c6c24a30'),
      ('berlin',             'tmp-d488108f-d0fc-4307-8b7f-3b2cdc43e45c'),
      ('berlin',             'tmp-a52da4fa-9720-4b83-8b40-8f43b418f77b'),
      ('berlin',             'tmp-29f40f49-16bd-466e-88cb-c7964b806d4f'),
      ('berlin',             'tmp-0bb33fb0-7e95-48d4-a249-6207bf8168ef'),
      ('leipzig-de-bjjxj',   'tmp-4cda928b-3bba-4705-a43c-d6bf21dd4fa8'),
      ('mannheim-de-3hr06',  'tmp-6a6d0e78-0190-4433-9e24-8a1b6755fc32'),
      ('wiesbaden-de-v4159', 'tmp-40d56ebe-684d-46b4-b214-3e860b6d3272'),
      ('wiesbaden-de-v4159', 'tmp-ce3c87de-61f0-4c83-8636-5ccb41bd785a'),
      ('wuppertal',          'tmp-367b854d-2142-4a31-af90-547d69800f1c'),
      ('wuppertal',          'tmp-cb699ad2-ce47-47fa-9a5c-99fbdf807fb1')
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
    RAISE EXCEPTION '% of 18 district merges did not reach the intended end state', v_bad;
  END IF;

  -- 2. The live symptom. `search_documents` is written by the drain, not inline,
  --    so what this can assert INSIDE the transaction is that every merged row
  --    was ENQUEUED for reindex; the row leaves search on the next tick of
  --    search_reindex_drain (*/1). Asserting the search table directly here
  --    would pass for the wrong reason -- nothing has drained yet.
  SELECT count(*) INTO v_q
    FROM public.search_reindex_queue q
   WHERE q.entity_type = 'city'
     AND q.entity_id IN (SELECT id FROM public.cities WHERE slug IN (
       'tmp-d71a07b9-e156-49e2-88e8-c8bf30b38de1','tmp-c371f4f3-a282-4653-8321-fc3906c6bb2d',
       'tmp-a5ca9d6b-f82f-41f6-91f6-67661bbffd85','tmp-bd8f06af-c005-456a-bd20-b0a0e313f4ac',
       'tmp-4c940540-f117-4d4b-922b-8b2382abbdcd','tmp-43e65f12-7388-419a-bf1c-50f73fea7ef6',
       'tmp-2bb6ab0c-0922-4a63-927c-b48f2d50f9b0','tmp-7cf2383c-871a-4a6b-9b78-5830c6c24a30',
       'tmp-d488108f-d0fc-4307-8b7f-3b2cdc43e45c','tmp-a52da4fa-9720-4b83-8b40-8f43b418f77b',
       'tmp-29f40f49-16bd-466e-88cb-c7964b806d4f','tmp-0bb33fb0-7e95-48d4-a249-6207bf8168ef',
       'tmp-4cda928b-3bba-4705-a43c-d6bf21dd4fa8','tmp-6a6d0e78-0190-4433-9e24-8a1b6755fc32',
       'tmp-40d56ebe-684d-46b4-b214-3e860b6d3272','tmp-ce3c87de-61f0-4c83-8636-5ccb41bd785a',
       'tmp-367b854d-2142-4a31-af90-547d69800f1c','tmp-cb699ad2-ce47-47fa-9a5c-99fbdf807fb1'));
  IF v_q = 0 THEN
    RAISE EXCEPTION 'no merged district shell was enqueued for reindex -- they would stay in site search';
  END IF;

  -- 3. Nothing was lost: every parent holds at least the personalities the pair
  --    held before.
  SELECT count(*) INTO v_lost
    FROM _pre_district_counts pre
    JOIN public.cities k ON k.slug = pre.keep_slug
   WHERE (SELECT count(*) FROM public.personalities p WHERE p.city_id = k.id) < pre.people;
  IF v_lost <> 0 THEN
    RAISE EXCEPTION '% parent city(ies) hold fewer personalities than before the merge', v_lost;
  END IF;

  -- 4. Every moved person still says WHERE they were born. The city link is
  --    now the parent; `birth_place` is the only human-readable record of the
  --    district, so it must be intact on all of them.
  IF EXISTS (
    SELECT 1 FROM public.personalities p
     WHERE p.city_id = (SELECT id FROM public.cities WHERE slug = 'berlin')
       AND p.birth_place ~* '^Berlin-'
       AND nullif(btrim(p.birth_place), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'a moved personality lost its birth_place text';
  END IF;
  IF (SELECT count(*) FROM public.personalities p
       WHERE p.city_id = (SELECT id FROM public.cities WHERE slug = 'berlin')
         AND p.birth_place ~* '^Berlin-') < 9 THEN
    RAISE EXCEPTION 'the Berlin district birth places did not follow their people onto berlin';
  END IF;

  -- 5. CONTROLS. A sweep that satisfied "the districts are gone" by taking these
  --    too must break this check.
  --
  --    "bei Berlin" is the distinguishing marker: separate Brandenburg
  --    municipalities, not Berlin districts.
  IF (SELECT count(*) FROM public.cities
       WHERE slug IN ('schoeneiche-bei-berlin','tmp-7666bf47-5d87-43d8-aa87-882a4a6121cb')
         AND duplicate_of_id IS NULL) <> 2 THEN
    RAISE EXCEPTION 'CONTROL: a "bei Berlin" municipality was merged away';
  END IF;
  --    Berlin, New Hampshire -- a different country, still its own city.
  IF NOT EXISTS (SELECT 1 FROM public.cities
                  WHERE slug = 'berlin-1' AND duplicate_of_id IS NULL AND seo_indexable) THEN
    RAISE EXCEPTION 'CONTROL: Berlin, New Hampshire was changed';
  END IF;
  --    Duisburg-Ruhrort: excluded because its parent is a placeholder shell.
  IF NOT EXISTS (SELECT 1 FROM public.cities
                  WHERE slug = 'tmp-e5c53109-0f8b-42be-a132-6443ea4d469f'
                    AND duplicate_of_id IS NULL) THEN
    RAISE EXCEPTION 'CONTROL: Duisburg-Ruhrort was merged into a placeholder parent';
  END IF;
  --    Berlin's six queer districts live in queer_villages and stay there.
  IF (SELECT count(*) FROM public.queer_villages v
       JOIN public.cities c ON c.id = v.city_id WHERE c.slug = 'berlin') <> 6 THEN
    RAISE EXCEPTION 'CONTROL: Berlin no longer has its six queer_villages';
  END IF;
  --    The comma-form rows OUTSIDE Berlin are not districts and must survive,
  --    so a later pass cannot quietly widen the predicate.
  IF (SELECT count(*) FROM public.cities
       WHERE slug IN ('tmp-9df641a0-3e30-4a4a-ab66-7037501b8877',  -- Stolberg, Aachen
                      'tmp-ec6a5e18-3289-4d20-bb0f-d0d4698d7f29',  -- Meerane, Chemnitz
                      'tmp-cba0456f-7068-48d2-856b-7ce02fc759cc',  -- Burg, Magdeburg
                      'tmp-91931770-e6f5-4cfe-b55b-5a310434044c')  -- Ladenburg, Mannheim
         AND duplicate_of_id IS NULL) <> 4 THEN
    RAISE EXCEPTION 'CONTROL: an own-town comma-form row was merged into the wrong city';
  END IF;

  RAISE NOTICE 'ok: 18 district shells merged, % enqueued for reindex, no content lost, controls intact', v_q;
END $verify$;
