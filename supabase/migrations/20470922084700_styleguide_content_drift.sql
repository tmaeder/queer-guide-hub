-- ============================================================================
-- Styleguide content drift: make the backlog a number that moves
-- ============================================================================
-- The standard shipped with a sentinel that checks the STANDARD (fence intact,
-- scopes known, binding rules reasoned, something published) and an adoption
-- count from the source tree. Nothing measured whether the CORPUS agrees with
-- it, so the first audit's findings — 354 "vibrant", 168 "explore", 64
-- "gay-friendly", and cities.editorial_hook flagged at 48 of 105 — were
-- invisible to CI and would have stayed invisible.
--
-- WHY THIS IS A COUNTER AND NOT A REWRITE. The obvious move is to have an LLM
-- rewrite the 400-odd offending city descriptions. That is precisely the
-- experiment this repo has already run and retired: the tag prose judge
-- retracted 16 of its first 18 rows and 13 of those were WRONG, and its two
-- rewrites included a downgrade into the exact register TAG_STYLE_SYSTEM bans.
-- Both auto-apply paths are disabled and `tag_prose_apply` lost its retract
-- branch at the DB layer so it cannot come back by accident. Pointing the same
-- class of machine at city descriptions would repeat that, at six times the
-- scale, on pages that rank. So: measure it, show it, let it be fixed
-- deliberately.
--
-- The other half — stopping NEW copy from arriving in this register — is a
-- `withVoice()` adoption on city-agentic-enrich, and it is deliberately NOT in
-- this migration. That is a live enrichment pipeline whose prompts demand bare
-- JSON from reasoning models that already need `chat_template_kwargs:
-- {thinking:false}` to answer at all; prepending ~13k characters of voice to a
-- 1.8k prompt is a change that wants its own before/after measurement, not a
-- side effect of a sentinel. tag-enrichment-sweep was chosen as first adopter
-- exactly because its cron is disabled and its auto-apply paths are retired.
--
-- WARN, DO NOT FAIL. A backlog of known editorial debt is depth, not a
-- regression — the same reasoning that makes the embedding drain warn on depth
-- and fail on liveness. What DOES hard-fail is a broken probe: `rows_scanned`
-- and `phrases_active` are reported separately from the counts, because an
-- empty corpus, a dropped vocabulary and a clean corpus otherwise all read as
-- the same reassuring zero.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.styleguide_content_drift()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_rx        text;
  v_phrases   int;
  v_scanned   int;
  v_by_surface jsonb;
  v_by_phrase  jsonb;
BEGIN
  -- Literal-scannable subset of the vocabulary.
  --  * phrases containing '(' are editorial annotations, not strings to match
  --    ("barebacking (in our own voice)", "a transgender (as a noun)")
  --  * 'it', 'clean' and 'accessible' are real guidance for a model but useless
  --    to a matcher — they fire on "clean towels" and "accessible toilet". They
  --    are EXCLUDED HERE ONLY; the assertion below proves they still exist in
  --    the vocabulary, so this list can never become a way of quietly retiring
  --    a term.
  SELECT count(*), '\m(' || string_agg(regexp_replace(a,'([.*+?^${}()|\[\]\\])','\\\1','g'),'|') || ')\M'
    INTO v_phrases, v_rx
    FROM (SELECT DISTINCT unnest(avoid) a FROM public.styleguide_terms WHERE is_active) p
   WHERE a NOT LIKE '%(%'
     AND lower(a) NOT IN ('it','clean','accessible');

  IF v_phrases IS NULL OR v_phrases = 0 THEN
    RETURN jsonb_build_object('phrases_active', 0, 'rows_scanned', 0,
                              'total_flagged', NULL, 'by_surface', '{}'::jsonb,
                              'by_phrase', '{}'::jsonb);
  END IF;

  WITH corpus AS (
    SELECT 'city.description'        s, description      b FROM public.cities WHERE description      IS NOT NULL AND duplicate_of_id IS NULL
    UNION ALL SELECT 'city.editorial_hook',   editorial_hook   FROM public.cities WHERE editorial_hook   IS NOT NULL AND duplicate_of_id IS NULL
    UNION ALL SELECT 'city.local_customs',    local_customs    FROM public.cities WHERE local_customs    IS NOT NULL AND duplicate_of_id IS NULL
    UNION ALL SELECT 'country.editorial_long',editorial_long   FROM public.countries WHERE editorial_long IS NOT NULL
    UNION ALL SELECT 'country.description',   description      FROM public.countries WHERE description    IS NOT NULL
    UNION ALL SELECT 'tag.description',       description      FROM public.unified_tags WHERE description       IS NOT NULL AND status='active'
    UNION ALL SELECT 'tag.short_description', short_description FROM public.unified_tags WHERE short_description IS NOT NULL AND status='active'
    UNION ALL SELECT 'tag.long_description',  long_description  FROM public.unified_tags WHERE long_description  IS NOT NULL AND status='active'
    UNION ALL SELECT 'village.description',   description      FROM public.queer_villages WHERE description IS NOT NULL
    UNION ALL SELECT 'village.history',       history          FROM public.queer_villages WHERE history     IS NOT NULL
  ),
  scanned AS (
    SELECT s, b, (b ~* v_rx) AS hit FROM corpus
  ),
  per_surface AS (
    SELECT s, count(*) FILTER (WHERE hit) n FROM scanned GROUP BY s HAVING count(*) FILTER (WHERE hit) > 0
  ),
  per_phrase AS (
    SELECT lower(m[1]) w, count(*) n
      FROM scanned, LATERAL regexp_matches(b, v_rx, 'gi') m
     WHERE hit GROUP BY 1
  )
  SELECT (SELECT count(*) FROM scanned),
         coalesce((SELECT jsonb_object_agg(s, n) FROM per_surface), '{}'::jsonb),
         coalesce((SELECT jsonb_object_agg(w, n) FROM (SELECT w, n FROM per_phrase ORDER BY n DESC LIMIT 12) t), '{}'::jsonb)
    INTO v_scanned, v_by_surface, v_by_phrase;

  RETURN jsonb_build_object(
    'phrases_active', v_phrases,
    'rows_scanned',   v_scanned,
    'total_flagged',  (SELECT coalesce(sum(value::int),0) FROM jsonb_each_text(v_by_surface)),
    'by_surface',     v_by_surface,
    'by_phrase',      v_by_phrase);
END
$fn$;

ALTER FUNCTION public.styleguide_content_drift() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.styleguide_content_drift() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.styleguide_content_drift() TO service_role;

COMMENT ON FUNCTION public.styleguide_content_drift() IS
  'Per-surface count of our-own-voice rows matching an active styleguide avoid phrase. '
  'Advisory depth, not an invariant: check-pipeline-health warns on the counts and fails '
  'only when the probe itself is broken (rows_scanned or phrases_active at zero).';

-- ---------------------------------------------------------------
-- Postconditions
-- ---------------------------------------------------------------
DO $verify$
DECLARE d jsonb; v_n int;
BEGIN
  d := public.styleguide_content_drift();

  -- A probe that scanned nothing must never read as a clean corpus.
  IF coalesce((d->>'rows_scanned')::int,0) = 0 THEN
    RAISE EXCEPTION 'content drift probe scanned 0 rows — it is broken, not clean';
  END IF;
  IF coalesce((d->>'phrases_active')::int,0) = 0 THEN
    RAISE EXCEPTION 'content drift probe has no phrases — the vocabulary is empty or unreadable';
  END IF;

  -- The excluded phrases must still exist as guidance. This is what stops the
  -- scanner's exclusion list from becoming a back door for deleting a term.
  SELECT count(DISTINCT lower(a)) INTO v_n
    FROM public.styleguide_terms t, unnest(t.avoid) a
   WHERE t.is_active AND lower(a) IN ('it','clean','accessible');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'scanner excludes 3 phrases but only % remain in the vocabulary — '
                    'a term was removed behind the exclusion list', v_n;
  END IF;

  -- Positive control: the corpus is known to be non-clean today, so a zero here
  -- means the regex stopped matching rather than that the backlog was fixed.
  IF coalesce((d->>'total_flagged')::int,0) = 0 THEN
    RAISE EXCEPTION 'content drift returned 0 flagged rows against a corpus measured at >400 — '
                    'the matcher is broken';
  END IF;

  RAISE NOTICE 'styleguide content drift: % of % rows flagged across % phrases',
    d->>'total_flagged', d->>'rows_scanned', d->>'phrases_active';
END
$verify$;
