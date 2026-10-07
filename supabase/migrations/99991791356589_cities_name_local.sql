-- cities.name_local + cities.name_local_lang: the city's name in the language of
-- its own country, beside the English name in cities.name.
--
-- Why a column: until now the endonym had no reliable home. name_en / name_de
-- are filled on 7 rows each, name_i18n has no 'en' key (English lives in
-- `name`), and city_aliases carries the endonym mostly with locale = NULL
-- (München, Warszawa, Praha), so no consumer could ask "what is this city
-- called locally" and get a defensible answer. Munich / München is the
-- canonical example.
--
-- name_local is in the ORIGINAL SCRIPT (東京, Москва, Αθήνα), never a
-- transliteration. name_local_lang is the language tag of that value (ISO
-- 639-1, or the Wikidata tag such as 'zh-hant'), so a multilingual country
-- (BE, CH, CA) records WHICH official language was chosen. Both are NULL when
-- nothing corroborates a value: prefer no answer to a guessed one.
--
-- Writers: city-factual-backfill (link phase, fill-if-empty from Wikidata P1705
-- / the label in the country's official language), the one-shot driver
-- scripts/data-quality/backfill-city-name-local.mjs, and
-- commit_city_staging_item (metadata.name_local, fill-if-empty).
--
-- Lockstep, same six objects as 20261001110000_capital_scope_columns.sql
-- (geo_spine_drift_check() compares only name/slug/parent_id, so a missing
-- satellite column would never alarm):
--   cities + geo_city_profiles + sync_geo_spine_city() + cities_admin view
--   + cities_directory() + commit_city_staging_item().
--
-- The three functions are PATCHED from their live definition
-- (pg_get_functiondef + exact-anchor replace) rather than restated from a repo
-- file: several have been rewritten by string surgery since their last full
-- definition in this tree, and restating an older copy would silently revert
-- that. Every anchor must match exactly once or the migration aborts.

-- ---------------------------------------------------------------- columns

ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS name_local      text,
  ADD COLUMN IF NOT EXISTS name_local_lang text;

ALTER TABLE public.geo_city_profiles
  ADD COLUMN IF NOT EXISTS name_local      text,
  ADD COLUMN IF NOT EXISTS name_local_lang text;

ALTER TABLE public.cities
  DROP CONSTRAINT IF EXISTS cities_name_local_shape;
ALTER TABLE public.cities
  ADD CONSTRAINT cities_name_local_shape CHECK (
    (name_local IS NULL OR (btrim(name_local) <> '' AND length(name_local) <= 200))
    AND (name_local_lang IS NULL OR name_local_lang ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$')
    AND (name_local_lang IS NULL OR name_local IS NOT NULL)
  );

COMMENT ON COLUMN public.cities.name_local IS
  'Name of the city in the official language of its own country, original script (München, Warszawa, 東京). English stays in `name`. NULL when no source corroborates a value. Provenance in field_provenance.name_local.';
COMMENT ON COLUMN public.cities.name_local_lang IS
  'Language tag of name_local (ISO 639-1 or a Wikidata tag like zh-hant). Records which official language was chosen in a multilingual country.';

-- ---------------------------------------------------------------- spine sync

DO $patch$
DECLARE
  v_def text := pg_get_functiondef('public.sync_geo_spine_city()'::regprocedure);
  v_new text := v_def;
  a1 text := E'wikidata_qid, wikipedia_title)\n  values (new.id';
  a2 text := 'new.wikidata_qid, new.wikipedia_title)';
  a3 text := 'wikipedia_title = excluded.wikipedia_title;';
BEGIN
  IF position('name_local' in v_def) > 0 THEN
    RAISE NOTICE 'sync_geo_spine_city already carries name_local; skipping';
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1
     OR (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1
     OR (length(v_def) - length(replace(v_def, a3, ''))) / length(a3) <> 1 THEN
    RAISE EXCEPTION 'sync_geo_spine_city: an anchor did not match exactly once; refusing to patch';
  END IF;
  v_new := replace(v_new, a1, E'wikidata_qid, wikipedia_title, name_local, name_local_lang)\n  values (new.id');
  v_new := replace(v_new, a2, 'new.wikidata_qid, new.wikipedia_title, new.name_local, new.name_local_lang)');
  v_new := replace(v_new, a3, E'wikipedia_title = excluded.wikipedia_title,\n    name_local = excluded.name_local, name_local_lang = excluded.name_local_lang;');
  EXECUTE v_new;
END
$patch$;

-- Satellite backfill is a no-op today (both columns are new and NULL); kept so
-- a re-run after rows were written outside the trigger converges. Direct to
-- geo_city_profiles, so no spine/search cascade.
UPDATE public.geo_city_profiles p
   SET name_local = c.name_local, name_local_lang = c.name_local_lang
  FROM public.cities c
 WHERE c.id = p.place_id
   AND (p.name_local IS DISTINCT FROM c.name_local
        OR p.name_local_lang IS DISTINCT FROM c.name_local_lang);

-- ---------------------------------------------------------------- cities_admin
-- CREATE OR REPLACE VIEW can only APPEND columns; grants survive it.

DO $view$
DECLARE
  v_def text := pg_get_viewdef('public.cities_admin'::regclass);
  a1 text := E'c.capital_of_region\n   FROM';
BEGIN
  IF position('name_local' in v_def) > 0 THEN
    RAISE NOTICE 'cities_admin already carries name_local; skipping';
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 THEN
    RAISE EXCEPTION 'cities_admin: anchor did not match exactly once; refusing to patch';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.cities_admin AS '
    || replace(v_def, a1, E'c.capital_of_region,\n    c.name_local,\n    c.name_local_lang\n   FROM');
END
$view$;

-- ---------------------------------------------------------------- directory RPC
-- Emitted through the existing jsonb_strip_nulls, so a city with no endonym
-- adds no key.

DO $patch$
DECLARE
  v_def text := pg_get_functiondef('public.cities_directory()'::regprocedure);
  a1 text := E'c.capital_of_region,\n      c.editorial_hook,';
BEGIN
  IF position('name_local' in v_def) > 0 THEN
    RAISE NOTICE 'cities_directory already carries name_local; skipping';
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 THEN
    RAISE EXCEPTION 'cities_directory: anchor did not match exactly once; refusing to patch';
  END IF;
  EXECUTE replace(v_def, a1,
    E'c.capital_of_region,\n      c.name_local,\n      c.name_local_lang,\n      c.editorial_hook,');
END
$patch$;

-- ---------------------------------------------------------------- staging commit
-- Fill-if-empty from metadata.name_local / metadata.name_local_lang. The pair
-- is written together or not at all, so a source that supplies a language but
-- no name (or the reverse) cannot leave a half-filled row the CHECK refuses.

DO $patch$
DECLARE
  v_def text := pg_get_functiondef('public.commit_city_staging_item(uuid, text)'::regprocedure);
  a1 text := E'capital_of_region = CASE WHEN v_has_capital_of THEN v_capital_of_region ELSE capital_of_region END,\n';
BEGIN
  IF position('name_local' in v_def) > 0 THEN
    RAISE NOTICE 'commit_city_staging_item already carries name_local; skipping';
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 THEN
    RAISE EXCEPTION 'commit_city_staging_item: anchor did not match exactly once; refusing to patch';
  END IF;
  EXECUTE replace(v_def, a1, a1
    || E'    name_local = CASE WHEN name_local IS NULL AND nullif(btrim(v_meta->>''name_local''), '''') IS NOT NULL\n'
    || E'                      THEN btrim(v_meta->>''name_local'') ELSE name_local END,\n'
    || E'    name_local_lang = CASE WHEN name_local IS NULL AND nullif(btrim(v_meta->>''name_local''), '''') IS NOT NULL\n'
    || E'                      THEN nullif(lower(btrim(v_meta->>''name_local_lang'')), '''') ELSE name_local_lang END,\n');
END
$patch$;

-- ---------------------------------------------------------------- verify

DO $verify$
DECLARE
  v_src text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='geo_city_profiles' AND column_name='name_local_lang') THEN
    RAISE EXCEPTION 'P1 failed: geo_city_profiles.name_local_lang missing';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.sync_geo_spine_city()'::regprocedure;
  -- column list + values (new.) + upsert target + excluded. = 4
  IF (length(v_src) - length(replace(v_src, 'name_local_lang', ''))) / length('name_local_lang') <> 4 THEN
    RAISE EXCEPTION 'P2 failed: sync_geo_spine_city must name name_local_lang in column list, values and upsert (4 times)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='cities_admin' AND column_name='name_local') THEN
    RAISE EXCEPTION 'P3 failed: cities_admin.name_local missing';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.cities_directory()'::regprocedure;
  IF position('c.name_local,' in v_src) = 0 THEN
    RAISE EXCEPTION 'P4 failed: cities_directory does not emit name_local';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.commit_city_staging_item(uuid, text)'::regprocedure;
  IF position('name_local_lang =' in v_src) = 0 THEN
    RAISE EXCEPTION 'P5 failed: commit_city_staging_item does not write name_local_lang';
  END IF;

  -- The directory must still execute: a patched body that parses can still fail
  -- to plan.
  PERFORM public.cities_directory();
END
$verify$;
