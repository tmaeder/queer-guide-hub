-- English name in cities.name: 22 renames + 2 merges, each verified against
-- Wikidata. The local-language name goes to cities.name_local
-- (99991791360464), which the link-phase backfill fills; this file only fixes
-- `name`.
--
-- HOW THE LIST WAS BUILT (2026-10-06/07). Every live city was checked against
-- Wikidata through pg_net + WDQS (labels de/en, P625, enwiki sitelink):
--   - cities with a wikidata_qid (3,160): the held entity's labels;
--   - cities without one (2,124 with coordinates): an exact German-label lookup,
--     accepted only for the hit nearest the row within 100 km.
-- A row became a candidate when its base name equals the entity's German label
-- and the English label differs. That rule alone was NOT enough, and the
-- exclusions are the substance:
--   - the English label must AGREE with the English Wikipedia title. Without
--     that, Braunschweig -> "Brunswick" and Konstanz -> "Constance" (en.wikipedia
--     uses Braunschweig / Konstanz), Fort Cavazos -> "Fort Hood" (the 2023 rename
--     makes the label stale), Puebla -> "Heroica Puebla de Zaragoza";
--   - an English label adding an admin-unit word ("Lerik District", "Arendal
--     Municipality", "Oulu sub-region", "Brixton tube station") means the
--     matched entity is NOT the city, so nothing is renamed after it;
--   - non-places (Großbritannien, Deutsch-Ostafrika) are left for the
--     archive_city_as_nonplace review, not renamed;
--   - a same-name English twin blocks a rename: idx_cities_name_country_unique
--     is (lower(name), country_id, coalesce(region_code,'')) with NO duplicate
--     filter, so it holds merged rows too. Gent/Ghent and Luzern/Lucerne are
--     left alone for that reason -- and because "Ghent" sits at Brussels
--     coordinates in region BE-BRU with 46 venues, which is a dedup case, not a
--     naming one.
-- Two German shells whose English twin already holds the entity are MERGED
-- instead (Daressalam -> Dar es Salaam, Santiago de Chile -> Santiago): keep
-- carries the QID and the content, merge_cities is reversible (schema:1) and
-- mints the old name as an alias itself.
--
-- WHAT A RENAME DOES AND DOES NOT TOUCH
--   - the slug does NOT move: auto_slug_from_name fills only an empty slug, so
--     every /city/<slug> URL stays valid (asserted below by snapshot);
--   - the old name is kept as a city_aliases row (locale NULL: it is German for
--     Kemerowo, French for Dunkerque, Catalan for Castelló -- the row does not
--     record which, so no tag is invented), so search and the resolver still
--     find it;
--   - field_provenance.name.anglicized records from/to/qid/by;
--   - no wikidata_qid is ADOPTED for the eight rows that lack one: the label
--     lookup is evidence for the English name, not the identity gate
--     city_qid_gap_link applies. The QID is recorded in provenance only.
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS: a row that was renamed,
-- merged or deleted by someone else before this applies is skipped and
-- reported, never an abort. What is enforced: no target still carries its old
-- name unless a collision skipped it, every rename left its alias, no slug
-- moved, and both merges landed.

DO $apply$
DECLARE
  r record;
  v_renamed int := 0;
  v_skipped text[] := '{}';
BEGIN
  PERFORM set_config('app.actor', 'migration:99991791360483_cities_anglicize_names', true);

  CREATE TEMP TABLE _anglicize (
    id uuid PRIMARY KEY, old_name text NOT NULL, new_name text NOT NULL, qid text NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO _anglicize VALUES
    -- held QID; English label = enwiki title
    ('a785a8d7-5811-44fe-a12a-8391c74ca810', 'Naxçıvan',              'Nakhchivan',            'Q230104'),
    ('5bdf81c3-9c8a-4115-bbf8-0a821a867f67', 'Sumqayıt',              'Sumgait',               'Q179833'),
    ('12e9af28-e270-4230-bfd8-b449b17af398', 'Québec',                'Quebec City',           'Q2145'),
    ('35d1d772-8ce7-4c05-92a5-95ea7053b4bf', 'Zürich',                'Zurich',                'Q72'),
    ('2a4dff6d-466d-49b8-aee3-b03c8992d5e5', 'Hannover',              'Hanover',               'Q1715'),
    ('e38e4a46-2b3c-496f-9a1f-1910ae198ee3', 'Ludwigshafen am Rhein', 'Ludwigshafen',          'Q2910'),
    ('0a6e1cb5-0381-4263-a2c9-4c98ade9540e', 'Castelló de la Plana',  'Castellón de la Plana', 'Q15092'),
    ('67967789-0226-4401-ac31-e3b964bd4423', 'Dunkerque',             'Dunkirk',               'Q45797'),
    ('3f86647a-728f-4c03-87f3-9d45ad58afc1', 'Kuta Utara',            'North Kuta',            'Q6448304'),
    ('898101d5-0ef2-4b2e-8387-21716d2ad855', 'San Ġiljan',            'St. Julian''s',         'Q669979'),
    ('cabda22f-c7cc-4c71-917b-7d7be634ee0a', 'Hoek van Holland',      'Hook of Holland',       'Q990130'),
    ('c38f0b07-f80b-4543-bceb-f4295389f55e', 'Mandaue City',          'Mandaue',               'Q1889017'),
    ('cd5f669f-9e25-454e-aa85-6b2fb33773b9', 'Kemerowo',              'Kemerovo',              'Q6066'),
    ('0bd0f475-0f53-4fb0-947f-73c7131ca691', 'Lee’s Summit',          'Lee''s Summit',         'Q959502'),
    -- no QID held; exact German label within 100 km, English label = enwiki title
    ('f44263de-0e18-4a1d-ab5a-adbd5919da98', 'Helgoland',             'Heligoland',            'Q3038'),
    ('484b91ea-aa93-4aeb-9d80-b1c84bd03c17', 'Helsingör',             'Helsingør',             'Q26881'),
    ('ee17c7a5-851f-49bb-a04b-1576f92ec610', 'El Aaiún',              'Laayoune',              'Q47837'),
    ('58745f20-136f-4aa3-a1b7-68601631d741', 'Masamagrell',           'Massamagrell',          'Q1313044'),
    ('2d00c8fb-68ac-408e-bdf9-3e04c7c98aa6', 'Akkon',                 'Acre',                  'Q126084'),
    ('825f3981-6699-4593-a06c-8ccf507aa188', 'Giardini-Naxos',        'Giardini Naxos',        'Q490422'),
    ('f58bf622-b4bf-4407-84a8-6568a7fce4d2', 'Swinemünde',            'Świnoujście',           'Q41599'),
    ('5143a4e2-e298-4754-9b9f-fcd7588bac94', 'Alapajewsk',            'Alapayevsk',            'Q103212');

  CREATE TEMP TABLE _anglicize_slugs ON COMMIT DROP AS
    SELECT c.id, c.slug FROM public.cities c JOIN _anglicize a USING (id);

  FOR r IN SELECT a.*, c.name AS cur_name, c.country_id, c.region_code, c.duplicate_of_id
           FROM _anglicize a JOIN public.cities c USING (id) LOOP
    IF r.duplicate_of_id IS NOT NULL OR r.cur_name IS DISTINCT FROM r.old_name THEN
      v_skipped := v_skipped || format('%s: no longer "%s" (now "%s")', r.id, r.old_name, r.cur_name);
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.cities t
               WHERE t.id <> r.id AND t.country_id = r.country_id
                 AND coalesce(t.region_code,'') = coalesce(r.region_code,'')
                 AND (lower(t.name) = lower(r.new_name)
                      OR (t.duplicate_of_id IS NULL AND t.name_normalized = public.normalize_name(r.new_name)))) THEN
      v_skipped := v_skipped || format('%s: "%s" already taken in this country/region', r.id, r.new_name);
      CONTINUE;
    END IF;

    UPDATE public.cities
       SET name = r.new_name,
           field_provenance = coalesce(field_provenance, '{}'::jsonb)
             || jsonb_build_object('name',
                  coalesce(field_provenance->'name', '{}'::jsonb)
                  || jsonb_build_object('anglicized', jsonb_build_object(
                       'from', r.old_name, 'to', r.new_name, 'qid', r.qid,
                       'source', 'wikidata:label_en=enwiki_title',
                       'by', 'migration:99991791360483', 'at', now()))),
           updated_at = now()
     WHERE id = r.id;

    INSERT INTO public.city_aliases (city_id, alias, locale)
    VALUES (r.id, r.old_name, NULL)
    ON CONFLICT (city_id, alias_key) DO NOTHING;

    v_renamed := v_renamed + 1;
  END LOOP;

  RAISE NOTICE 'anglicize: renamed %, skipped %: %', v_renamed, coalesce(array_length(v_skipped,1),0), v_skipped;

  -- Merges: German shell INTO the English row that already holds the entity.
  FOR r IN SELECT * FROM (VALUES
      ('4d14bb00-7261-4b6f-8435-b3772d11800d'::uuid, '3a6b6bf1-8779-4e93-a97f-2dcdf93735b9'::uuid, 'Daressalam'),
      ('0c89e7d9-47f7-4170-ad18-5749c06bbc16'::uuid, 'c245c9d2-b129-4634-b25b-d3ebea4a9582'::uuid, 'Santiago de Chile')
    ) m(keep_id, drop_id, drop_name) LOOP
    IF EXISTS (SELECT 1 FROM public.cities WHERE id = r.drop_id AND duplicate_of_id IS NULL AND name = r.drop_name)
       AND EXISTS (SELECT 1 FROM public.cities WHERE id = r.keep_id AND duplicate_of_id IS NULL) THEN
      PERFORM public.merge_cities(r.keep_id, r.drop_id, false);
    ELSE
      RAISE NOTICE 'anglicize: merge of % skipped (already merged or changed)', r.drop_name;
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------- verify
  -- P1: no target still carries its old name, except where a collision was
  -- reported (those rows are named in the NOTICE above and keep their name).
  IF EXISTS (SELECT 1 FROM _anglicize a JOIN public.cities c USING (id)
             WHERE c.duplicate_of_id IS NULL AND c.name = a.old_name
               AND NOT EXISTS (SELECT 1 FROM public.cities t
                               WHERE t.id <> a.id AND t.country_id = c.country_id
                                 AND coalesce(t.region_code,'') = coalesce(c.region_code,'')
                                 AND lower(t.name) = lower(a.new_name))) THEN
    RAISE EXCEPTION 'P1 failed: a target kept its old name without a collision to explain it';
  END IF;

  -- P2: every renamed row kept its old name as an alias.
  IF EXISTS (SELECT 1 FROM _anglicize a JOIN public.cities c USING (id)
             WHERE c.name = a.new_name
               AND NOT EXISTS (SELECT 1 FROM public.city_aliases x
                               WHERE x.city_id = a.id
                                 AND x.alias_key = public.city_canonical_key(a.old_name))) THEN
    RAISE EXCEPTION 'P2 failed: a renamed city lost its old name (no alias)';
  END IF;

  -- P3: no slug moved.
  IF EXISTS (SELECT 1 FROM _anglicize_slugs s JOIN public.cities c USING (id)
             WHERE c.slug IS DISTINCT FROM s.slug) THEN
    RAISE EXCEPTION 'P3 failed: a rename moved a slug';
  END IF;

  -- P4: both German shells are merged away (by this file or earlier).
  IF EXISTS (SELECT 1 FROM public.cities
             WHERE id IN ('3a6b6bf1-8779-4e93-a97f-2dcdf93735b9', 'c245c9d2-b129-4634-b25b-d3ebea4a9582')
               AND duplicate_of_id IS NULL) THEN
    RAISE EXCEPTION 'P4 failed: a German duplicate shell is still live';
  END IF;
END
$apply$;
