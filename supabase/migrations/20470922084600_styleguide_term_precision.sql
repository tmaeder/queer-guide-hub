-- ============================================================================
-- Styleguide terminology: six entries corrected by running the standard
-- ============================================================================
-- The first content audit against the published standard (2026-09-11, our own
-- voice only: cities, countries, unified_tags, queer_villages) found that the
-- vocabulary's PRECISION, not the corpus, was the largest source of noise. Each
-- change below is a measured count, not a hunch.
--
-- 1. `gay friendly` IS STORED SPACE-ONLY AND MISSES EVERY REAL USE.
--    Measured: 64 occurrences of "gay-friendly", 0 of "gay friendly". A
--    legal_safety term with a 100% miss rate against live copy. "queer-friendly"
--    (48 more) was not in the vocabulary at all, though it is the same
--    construction and the same problem — it asserts a welcome the platform has
--    not verified.
--
-- 2. `a transgender` MATCHES THE CORRECT ADJECTIVE. All 9 occurrences are
--    "a transgender woman", "a transgender man", "a transgender or non-binary
--    person" — which is exactly what this term's own `preferred` recommends.
--    The avoid target is the NOUN ("he is a transgender"), so it is annotated
--    the way three existing entries already annotate themselves
--    ("barebacking (in our own voice)", "black people (lowercase)").
--
-- 3. BARE `ethnic` IS ~100% FALSE POSITIVE. All 26 occurrences are "ethnic
--    groups", "ethnic minority", "ethnic majority" — neutral demographic
--    description, much of it Wikipedia-derived city prose. The rule targets
--    exoticising use, so it now names the collocations that actually exoticise.
--
-- 4. BARE `lifestyle` FIGHTS THE VERNACULAR RULES. 34 occurrences, and they are
--    overwhelmingly the kink community's own word — "the lifestyle", "swinging
--    lifestyle", "Gorean lifestyle", "Naturism is a lifestyle" — which
--    `community-words-in-their-real-sense` and `reclaimed-words` exist to
--    protect, plus "lifestyle changes" in pelvic-health copy, which is ordinary
--    medical English. The harmful sense was already covered twice over by
--    "gay lifestyle" and "chosen lifestyle"; bare "lifestyle" only told the
--    model to avoid the community's own vocabulary.
--
-- 5. BARE `minorities` IS STANDARD RIGHTS VOCABULARY. 10 occurrences, and the
--    live examples are "racial and ethnic minorities" (BIPOC) and "gender and
--    sexual minorities" (Minority Rights) — the register a rights glossary
--    should use. The euphemistic sense is already carried by "non-white" and
--    "diverse crowd".
--
-- 6. BARE `urban area` IS A UNIT OF GEOGRAPHY. 158 occurrences — "the Sonoma
--    urban area had a population of 31,479", "the largest urban area of
--    Germany", "forms a continuous urban area with Hellaby" — all of it
--    Wikipedia-derived city prose using the standard demographic term. The
--    coded sense this rule exists to catch is "urban" applied to PEOPLE as a
--    stand-in for race, so it now names that instead. Left alone, this one
--    phrase would have been 22% of the drift baseline, all of it noise.
--
-- WHAT IS DELIBERATELY NOT CHANGED. `clean` (hiv-negative) and `accessible`
-- (step-free) stay exactly as they are. Both are unusable as literal scans —
-- "clean towels", "accessible toilet" — but both are real and important
-- guidance for a model reading the prompt, and `step-free` carries severity
-- `context` precisely because it needs a human rather than a matcher. A term's
-- job is to instruct an LLM, not to be greppable; these five changed because
-- they instruct WRONGLY, not merely because they are hard to scan.
--
-- Soft on preconditions, hard on postconditions: a concurrent session may have
-- edited any of these rows, so each UPDATE is idempotent and the assertions at
-- the end are what this migration guarantees.
-- ============================================================================

-- 1. gay-friendly / queer-friendly, both spellings
UPDATE public.styleguide_terms
   SET avoid = ARRAY['gay friendly','gay-friendly','queer friendly','queer-friendly',
                     'LGBT welcoming','LGBT-welcoming'],
       context_note = 'Both spellings, and the queer- forms. The problem is the claim, not the '
                   || 'hyphen: it asserts a welcome nobody has verified. Say what the venue itself states.'
 WHERE slug = 'gay-friendly';

-- 2. the noun, not the adjective
UPDATE public.styleguide_terms
   SET avoid = ARRAY['transwoman','transman','a transgender (as a noun)','transgenders','transsexual'],
       context_note = 'Use "transsexual" only when a person uses it of themselves. "Transgender" is an '
                   || 'ADJECTIVE and "a transgender woman" is correct; what is wrong is the noun, '
                   || 'as in "he is a transgender".'
 WHERE slug = 'trans-adjective';

-- 3. exoticising collocations, not the demographic word
UPDATE public.styleguide_terms
   SET avoid = ARRAY['exotic','ethnic food','ethnic restaurant','ethnic neighbourhood',
                     'tribal','oriental','third-world'],
       context_note = '"Ethnic group", "ethnic minority" and "ethnic majority" are correct neutral '
                   || 'description and are not what this bans. The ban is on using a culture as '
                   || 'flavour for a reader assumed to be outside it.'
 WHERE slug = 'no-exoticism';

-- 4. the orientation sense only
UPDATE public.styleguide_terms
   SET avoid = ARRAY['sexual preference','gay lifestyle','chosen lifestyle','alternative lifestyle'],
       context_note = 'The ban is on "lifestyle" as a word for an ORIENTATION. It is not a ban on the '
                   || 'word: "the lifestyle" is the kink and swinging communities'' own term, naturism '
                   || 'describes itself as a lifestyle, and "lifestyle changes" is ordinary health copy.'
 WHERE slug = 'sexual-orientation';

-- 5. the euphemism, not the legal term of art
UPDATE public.styleguide_terms
   SET avoid = ARRAY['non-white','diverse crowd'],
       context_note = '"People of colour" is fine where the grouping is genuinely what is meant, and so '
                   || 'are "sexual minorities" and "ethnic minorities" where the law or the demography '
                   || 'is what is being described. What this bans is naming people only by what they '
                   || 'are not.'
 WHERE slug = 'qtipoc';

-- 6. the coded sense: "urban" applied to people, not to geography
UPDATE public.styleguide_terms
   SET avoid = ARRAY['sketchy neighbourhood','rough area','dodgy part of town','up-and-coming',
                     'urban crowd','urban vibe','urban clientele'],
       context_note = '"Urban area", "urban planning" and "urban population" are geography and are not '
                   || 'what this bans. The ban is on "urban" as a stand-in for race when describing '
                   || 'people or a crowd.'
 WHERE slug = 'coded-area-language';

-- ---------------------------------------------------------------
-- Republish: the compiled prompt is frozen at publish time, so an edit that is
-- never published changes nothing for any consumer. styleguide_signals()
-- reports exactly this as `unpublished_drift`.
-- ---------------------------------------------------------------
DO $publish$
DECLARE v_version text;
BEGIN
  v_version := public._styleguide_publish_core(
    'minor',
    'Term precision: both spellings of gay-/queer-friendly; transgender noun vs adjective; '
    || 'narrow ethnic/lifestyle/minorities to the senses that are actually wrong',
    NULL);
  RAISE NOTICE 'published styleguide v%', v_version;
END
$publish$;

-- ---------------------------------------------------------------
-- Postconditions
-- ---------------------------------------------------------------
DO $verify$
DECLARE
  v_prompt text;
  v_drift  boolean;
  v_n      int;
BEGIN
  SELECT compiled_prompt INTO v_prompt FROM public.styleguide_versions WHERE is_active;
  IF v_prompt IS NULL THEN RAISE EXCEPTION 'no active styleguide version after publish'; END IF;

  -- The spelling that actually occurs in the corpus must now be in the prompt.
  IF position('gay-friendly' in v_prompt) = 0 THEN
    RAISE EXCEPTION 'the hyphenated spelling did not reach the compiled prompt';
  END IF;
  IF position('queer-friendly' in v_prompt) = 0 THEN
    RAISE EXCEPTION 'queer-friendly did not reach the compiled prompt';
  END IF;

  -- The bare words must be gone as standalone avoid entries.
  SELECT count(*) INTO v_n
    FROM public.styleguide_terms t, unnest(t.avoid) a
   WHERE t.is_active AND lower(a) IN ('ethnic','lifestyle','minorities','a transgender','urban area');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% bare avoid entries survived the narrowing', v_n;
  END IF;

  -- ...but the senses they were protecting must still be banned somewhere.
  SELECT count(*) INTO v_n
    FROM public.styleguide_terms t, unnest(t.avoid) a
   WHERE t.is_active AND lower(a) IN ('gay lifestyle','chosen lifestyle','non-white','exotic',
                                      'oriental','sketchy neighbourhood','rough area');
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'narrowing dropped a sense it should have kept (found % of 7)', v_n;
  END IF;

  -- Nothing here may switch the voice off or break the fence.
  SELECT (public.styleguide_signals()->>'unpublished_drift')::boolean INTO v_drift;
  IF v_drift THEN RAISE EXCEPTION 'edits were not published — every consumer still serves the old prompt'; END IF;

  IF (public.styleguide_signals()->>'fence_begin_count')::int <> 1
     OR (public.styleguide_signals()->>'fence_end_count')::int <> 1 THEN
    RAISE EXCEPTION 'fence is no longer exactly one pair';
  END IF;
  IF (public.styleguide_signals()->>'empty_wrapper_artifacts')::int <> 0 THEN
    RAISE EXCEPTION 'empty-wrapper artifacts appeared in the published prompt';
  END IF;
  IF NOT (public.styleguide_signals()->>'has_non_negotiables')::boolean THEN
    RAISE EXCEPTION 'non-negotiables lost from the published prompt';
  END IF;
END
$verify$;
