-- Is this `cities` row a city, or a district of one?
--
-- Nothing in the schema answers that. `cities` has no place-class column, so a
-- Stadtteil filed as a city is indistinguishable from a city, and several are
-- published with venues on them.
--
-- MEASURED: 48 live, seo_indexable, QID-bearing, venue-bearing rows sampled at
-- random and resolved against Wikidata P31. NINE are not an ordinary city:
--   Kensington    Q288781   "area of London"                        15 venues
--   Croydon       Q2213391  "area of London, market town"
--   Greenwich     Q179385   "town, district, area of London"         9 venues
--   Amber Valley  Q457014   "borough in the UK, non-metropolitan district"
--   Dihlabeng     Q1225159  "local municipality of South Africa"
--   City of Nottingham Q21885994 "unitary authority area, county borough,
--                                 unparished area, district with city status"
--   plus Wyke Regis, Köseköy, Chapultepec, San Simeón Xipetzinco (villages and
--   localities -- settlements smaller than a city, NOT defects).
-- Over the 2,090 indexable QID-bearing rows that extrapolates to roughly
-- 130-400. THE RATE IS A SAMPLE, NOT A PROPERTY -- re-measure before sizing
-- anything on it.
--
-- THIS REPORTS AND NEVER ACTS, which inverts the polarity of
-- `_shared/city-class-guard.ts`. That guard is a WHITELIST applied at QID
-- ADOPTION, where a wrong link is permanent and self-reinforcing, so an
-- unrecognised class is refused. Here the destructive direction is the
-- opposite: demoting a live indexable page with venues on a class vocabulary
-- that has never been measured against this corpus cannot be undone per row.
-- So the verdict is stored, surfaced, and left for a human.
--
-- A SETTLEMENT LABEL RESCUES THE ENTITY, and this is the load-bearing rule.
-- `Croydon` is an area of London AND a market town; `Greenwich` is an area of
-- London AND a town. Vetoing on the district label alone would condemn two real
-- towns -- the `\yprefecture\y` mistake that 99991789807686's sibling recorded,
-- with the polarity reversed. Evaluation is therefore PER LABEL, and any clean
-- settlement label wins outright.
--
-- THE OVERRIDE IS THE OTHER HALF. A label can carry a settlement word and still
-- not be evidence: "local municipality of South Africa" contains `municipality`
-- but names a rural district containing several towns, and "district with city
-- status" contains `city` but names Nottingham's unitary authority rather than
-- Nottingham. Both are MEASURED, not imagined -- the fixture this repo's tag
-- work once invented (`megacity` + `federal entity of Mexico`) matched no real
-- entity, so every entry here comes off a row.
--
-- `borough` IS DELIBERATELY IN NEITHER LIST. In the UK it is an administrative
-- district; in Alaska, New Jersey and Pennsylvania it is a municipality. It
-- would misfile one or the other, and `Amber Valley` and `City of Nottingham`
-- are both already reached by a more specific label.
--
-- NO NETWORK IN A MIGRATION. `db push` aborts the whole repo on a failing file,
-- so a migration that waits on query.wikidata.org is a repo-wide outage waiting
-- for a slow upstream. The seed below is the subset whose verdicts the
-- self-test asserts; `scripts/data-quality/probe-city-place-class.mjs` fills the
-- rest, and `city_place_class_signals()` reports coverage FIRST so an unprobed
-- corpus can never read as a clean one.

-- ---------------------------------------------------------------- table
CREATE TABLE IF NOT EXISTS public.city_place_class_probe (
  wikidata_qid text        NOT NULL PRIMARY KEY,
  classes      text[]      NOT NULL,
  probed_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.city_place_class_probe IS
  'Wikidata P31 English class labels per city QID. Stores the EVIDENCE only; '
  'the verdict is derived by city_place_class_verdict() so a vocabulary change '
  'reclassifies the whole corpus without a re-probe. Filled by '
  'scripts/data-quality/probe-city-place-class.mjs.';

ALTER TABLE public.city_place_class_probe ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.city_place_class_probe FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.city_place_class_probe TO service_role;

-- ---------------------------------------------------------------- verdict
CREATE OR REPLACE FUNCTION public.city_place_class_verdict(p_classes text[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  lbl text;
  -- A label carrying a settlement word that is nevertheless NOT evidence.
  -- Checked per label, so it can never veto a clean sibling label.
  overrides  text[] := ARRAY[
    '\ylocal municipality\y',
    '\ydistrict with city status\y'
  ];
  settlement text[] := ARRAY[
    '\ycity\y', '\ycities\y', '\ytown\y', '\yvillage\y', '\yhamlet\y',
    '\ymunicipality\y', '\ycommune\y', '\ycomune\y', '\ylocality\y',
    '\ysettlement\y',
    '\ymetropolis\y', '\ymegacity\y', '\ycapital\y'
  ];
  -- Not a settlement at all: an administrative unit that CONTAINS settlements.
  admin_area text[] := ARRAY[
    '\ylocal municipality\y', 'non-metropolitan district',
    'metropolitan district', 'unitary authority', 'county borough',
    'unparished area', '\ydistrict with city status\y',
    '\ycounty\y', '\yprovince\y', '\yprefecture\y', '\yoblast\y',
    '\ydepartment\y', 'administrative'
  ];
  -- A part of a settlement: the Stadtteil this whole file is about.
  subdivision text[] := ARRAY[
    '\yarea of\y', '\ydistrict\y', '\yneighborhood\y', '\yneighbourhood\y',
    '\yquarter\y', '\ystadtteil\y', '\yortsteil\y', '\yarrondissement\y',
    '\yborough of\y', '\ysubdistrict\y', '\ysuburb\y'
  ];
  pat text;
  is_override boolean;
BEGIN
  IF p_classes IS NULL OR cardinality(p_classes) = 0 THEN
    RETURN 'undetermined';
  END IF;

  -- 1. Any clean settlement label wins outright. Per label, so "area of
  --    London, market town" is a town.
  FOREACH lbl IN ARRAY p_classes LOOP
    is_override := false;
    FOREACH pat IN ARRAY overrides LOOP
      IF lower(lbl) ~ pat THEN is_override := true; EXIT; END IF;
    END LOOP;
    IF NOT is_override THEN
      FOREACH pat IN ARRAY settlement LOOP
        IF lower(lbl) ~ pat THEN RETURN 'settlement'; END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- 2. Administrative unit before subdivision: the admin phrases are the more
  --    specific ones, and several of them contain the bare word `district`.
  FOREACH lbl IN ARRAY p_classes LOOP
    FOREACH pat IN ARRAY admin_area LOOP
      IF lower(lbl) ~ pat THEN RETURN 'admin_area'; END IF;
    END LOOP;
  END LOOP;

  FOREACH lbl IN ARRAY p_classes LOOP
    FOREACH pat IN ARRAY subdivision LOOP
      IF lower(lbl) ~ pat THEN RETURN 'subdivision'; END IF;
    END LOOP;
  END LOOP;

  -- 3. `undetermined` is a THIRD verdict and must never collapse into one of
  --    the others: a vocabulary gap has to show up as a rising count of
  --    namable labels rather than as a confident answer.
  RETURN 'undetermined';
END;
$fn$;

COMMENT ON FUNCTION public.city_place_class_verdict(text[]) IS
  'settlement | admin_area | subdivision | undetermined, from Wikidata P31 '
  'English labels. Evaluated PER LABEL and any clean settlement label wins, so '
  'an entity that is both an area of London and a market town is a town.';

GRANT EXECUTE ON FUNCTION public.city_place_class_verdict(text[]) TO service_role;

-- ---------------------------------------------------------------- seed
--
-- The rows whose verdicts the self-test below asserts. Every array is the
-- English P31 label set as Wikidata served it on 2026-09-23. This is EVIDENCE:
-- the verdict is recomputed from it by the same function the sentinel uses, so
-- a wrong vocabulary produces a visibly wrong verdict instead of a frozen id
-- list producing the right one by luck.
INSERT INTO public.city_place_class_probe (wikidata_qid, classes) VALUES
  ('Q288781',   ARRAY['area of London']),
  ('Q2213391',  ARRAY['area of London','market town']),
  ('Q179385',   ARRAY['town','district','area of London']),
  ('Q457014',   ARRAY['borough in the United Kingdom','non-metropolitan district']),
  ('Q1225159',  ARRAY['local municipality of South Africa']),
  ('Q21885994', ARRAY['borough in the United Kingdom','unitary authority area','county borough','unparished area','district with city status']),
  ('Q1520409',  ARRAY['village','civil parish']),
  ('Q568114',   ARRAY['village']),
  ('Q6595949',  ARRAY['village of Turkey']),
  ('Q20261215', ARRAY['locality of Mexico']),
  ('Q28842779', ARRAY['locality of Mexico']),
  ('Q406',      ARRAY['megacity','big city','port city','metropolitan municipality in Turkey','former capital','largest city']),
  ('Q459',      ARRAY['municipality seat','oblast seat','city in Bulgaria','large city']),
  ('Q580',      ARRAY['city','city with powiat rights in Poland','big city']),
  ('Q1449',     ARRAY['comune of Italy','big city','port city']),
  ('Q1930',     ARRAY['federal capital','big city','single-tier municipality','census subdivision in Canada','census division of Canada']),
  ('Q36600',    ARRAY['city','cadastral populated place in the Netherlands','municipality of the Netherlands','place with town rights and privileges']),
  ('Q42956',    ARRAY['city','sub-province-level division']),
  ('Q69345',    ARRAY['municipality of Switzerland','college town','cantonal capital of Switzerland','city of Switzerland']),
  ('Q755140',   ARRAY['New England town']),
  ('Q1024647',  ARRAY['city','local government area of Nigeria']),
  ('Q41262',    ARRAY['city','big city','unitary authority area']),
  ('Q1842',     ARRAY['city','capital city','big city','municipality of Luxembourg','largest city']),
  ('Q3766',     ARRAY['city','big city','ancient city','populated place in Syria','largest city','national capital'])
ON CONFLICT (wikidata_qid) DO UPDATE
  SET classes = EXCLUDED.classes, probed_at = now();

-- ---------------------------------------------------------------- work list
CREATE OR REPLACE VIEW public.city_place_class_review
WITH (security_invoker = on) AS
SELECT c.id,
       c.name,
       c.slug,
       c.wikidata_qid,
       c.shell_status,
       c.seo_indexable,
       co.code AS country_code,
       p.classes,
       public.city_place_class_verdict(p.classes) AS verdict,
       (SELECT count(*) FROM public.venues v
         WHERE v.city_id = c.id AND v.duplicate_of_id IS NULL) AS venues,
       (SELECT count(*) FROM public.events e WHERE e.city_id = c.id) AS events,
       p.probed_at
  FROM public.cities c
  JOIN public.city_place_class_probe p ON p.wikidata_qid = c.wikidata_qid
  LEFT JOIN public.countries co ON co.id = c.country_id
 WHERE c.duplicate_of_id IS NULL
   AND public.city_place_class_verdict(p.classes) IN ('subdivision', 'admin_area');

-- The `public` schema's default privileges in this database grant anon and
-- authenticated on a NEWLY CREATED relation, so a view that is merely not
-- granted is still readable. Revoke explicitly.
REVOKE ALL ON public.city_place_class_review FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.city_place_class_review TO service_role;

COMMENT ON VIEW public.city_place_class_review IS
  'Live cities whose Wikidata class says district or administrative area. A '
  'work list for a human: the remedy differs per row (a merge, an archive, a '
  'venue repoint), which is why this is not routed through '
  'entity_review_queue -- approve_entity_review applies a FIELD write.';

-- ---------------------------------------------------------------- sentinel
CREATE OR REPLACE FUNCTION public.city_place_class_signals()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $fn$
  WITH live AS (
    SELECT c.id, c.wikidata_qid, c.seo_indexable
      FROM public.cities c
     WHERE c.duplicate_of_id IS NULL AND c.wikidata_qid IS NOT NULL
  ),
  judged AS (
    SELECT l.seo_indexable,
           public.city_place_class_verdict(p.classes) AS verdict,
           p.classes
      FROM live l JOIN public.city_place_class_probe p ON p.wikidata_qid = l.wikidata_qid
  )
  SELECT jsonb_build_object(
    -- Coverage FIRST and separately: zero districts over an unprobed corpus is
    -- vacuous, not clean, and only these two tell the difference.
    'live_qid_rows',        (SELECT count(*) FROM live),
    'probe_rows',           (SELECT count(*) FROM public.city_place_class_probe),
    'judged_rows',          (SELECT count(*) FROM judged),
    'settlement',           (SELECT count(*) FROM judged WHERE verdict = 'settlement'),
    'subdivision',          (SELECT count(*) FROM judged WHERE verdict = 'subdivision'),
    'admin_area',           (SELECT count(*) FROM judged WHERE verdict = 'admin_area'),
    'undetermined',         (SELECT count(*) FROM judged WHERE verdict = 'undetermined'),
    -- The two that gate: a district or an admin area that a crawler can reach.
    'indexable_subdivision',(SELECT count(*) FROM judged WHERE verdict = 'subdivision' AND seo_indexable),
    'indexable_admin_area', (SELECT count(*) FROM judged WHERE verdict = 'admin_area'  AND seo_indexable),
    -- Reported VERBATIM so a vocabulary gap is a rising count of namable
    -- labels rather than silence.
    'unrecognised_classes', coalesce((
        SELECT jsonb_agg(DISTINCT lbl)
          FROM judged j, unnest(j.classes) AS lbl
         WHERE j.verdict = 'undetermined'
    ), '[]'::jsonb)
  );
$fn$;

ALTER FUNCTION public.city_place_class_signals() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.city_place_class_signals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.city_place_class_signals() TO service_role;

COMMENT ON FUNCTION public.city_place_class_signals() IS
  'Coverage and verdict counts for the city place-class probe. Reports '
  'live_qid_rows and probe_rows first: a zero district count over an unprobed '
  'corpus is vacuous, not clean.';

-- ---------------------------------------------------------------- verify
DO $verify$
DECLARE
  r      record;
  v_bad  int := 0;
  v_sig  jsonb;
BEGIN
  -- Self-test against the seeded evidence. These are the judgements a human
  -- made by hand; if the vocabulary stops reproducing them it is wrong.
  FOR r IN
    SELECT * FROM (VALUES
      -- district: the class this file exists to surface
      ('Q288781',   'subdivision'),
      -- rescued by a settlement sibling -- the load-bearing rule
      ('Q2213391',  'settlement'),
      ('Q179385',   'settlement'),
      -- administrative units that contain settlements
      ('Q457014',   'admin_area'),
      ('Q1225159',  'admin_area'),
      ('Q21885994', 'admin_area'),
      -- settlements smaller than a city are NOT defects
      ('Q1520409',  'settlement'),
      ('Q568114',   'settlement'),
      ('Q6595949',  'settlement'),
      ('Q20261215', 'settlement'),
      ('Q28842779', 'settlement'),
      -- ordinary cities, including every shape the sample threw up
      ('Q406','settlement'), ('Q459','settlement'), ('Q580','settlement'),
      ('Q1449','settlement'), ('Q1930','settlement'), ('Q36600','settlement'),
      ('Q42956','settlement'), ('Q69345','settlement'), ('Q755140','settlement'),
      ('Q1024647','settlement'), ('Q41262','settlement'), ('Q1842','settlement'),
      ('Q3766','settlement')
    ) AS t(qid, expected)
  LOOP
    IF public.city_place_class_verdict(
         (SELECT classes FROM public.city_place_class_probe WHERE wikidata_qid = r.qid)
       ) IS DISTINCT FROM r.expected THEN
      RAISE WARNING 'verdict for % is %, expected %', r.qid,
        public.city_place_class_verdict(
          (SELECT classes FROM public.city_place_class_probe WHERE wikidata_qid = r.qid)),
        r.expected;
      v_bad := v_bad + 1;
    END IF;
  END LOOP;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION '% seeded verdicts disagree with the hand-read judgement', v_bad;
  END IF;

  -- An empty array and a null must never produce a confident answer.
  IF public.city_place_class_verdict(NULL) <> 'undetermined'
     OR public.city_place_class_verdict(ARRAY[]::text[]) <> 'undetermined'
     OR public.city_place_class_verdict(ARRAY['fictional country']) <> 'undetermined' THEN
    RAISE EXCEPTION 'city_place_class_verdict does not return undetermined for an unknown class';
  END IF;

  v_sig := public.city_place_class_signals();
  IF (v_sig->>'live_qid_rows')::int < 100 THEN
    RAISE EXCEPTION 'city_place_class_signals sees only % live QID rows -- it is measuring nothing',
      v_sig->>'live_qid_rows';
  END IF;
  IF (v_sig->>'probe_rows')::int < 20 THEN
    RAISE EXCEPTION 'the probe seed did not land (% rows)', v_sig->>'probe_rows';
  END IF;

  RAISE NOTICE 'ok: % seeded verdicts agree; % live QID rows, % probed, subdivision=%, admin_area=%',
    24, v_sig->>'live_qid_rows', v_sig->>'probe_rows',
    v_sig->>'subdivision', v_sig->>'admin_area';
END $verify$;
