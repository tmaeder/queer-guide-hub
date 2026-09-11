-- styleguide_rules.applies_to: free text -> controlled vocabulary.
--
-- Shipped as free text with only `cardinality BETWEEN 1 AND 12` and a
-- lowercase-slug regex, which means `venue` and `venues` BOTH validate and
-- silently mean different things. A typo does not error: the rule simply never
-- appears in the compile for the surface it was written for, and nothing
-- anywhere reports it. That is the exact failure this codebase has been bitten
-- by repeatedly — `venues.category` is governed by a DB CHECK plus a
-- drift-tested TS file, and `target_groups` had to normalise ~280 free-text
-- values because exact-match filters were silently broken by them.
--
-- Enforced with array containment (`applies_to <@ vocabulary`) rather than a
-- per-element trigger: it is one IMMUTABLE expression, it reads as the
-- vocabulary itself, and a drift test can parse it straight out of this file.
--
-- `glossary` is RETIRED in favour of `tag`. Both were in use on the seeded
-- rows — two spellings of one surface, which is how a vocabulary starts
-- rotting on day one. `tag` wins because it is what the table (`unified_tags`),
-- the route (`/tags/:slug`) and the consuming function (`tag-enrichment-sweep`)
-- are called; a caller passing a scope has to spell it the way its own code
-- spells it. The rules' PROSE still says "glossary", which is correct English
-- for the surface and is not a key.

-- ---------------------------------------------------------------
-- 1. The vocabulary, readable by SQL and by the app
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.styleguide_scope_values()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT ARRAY[
    'all',
    'venue', 'event', 'city', 'country', 'village', 'landmark',
    'hotel', 'marketplace', 'news', 'tag', 'personality', 'guide',
    'rights', 'safety'
  ]::text[];
$fn$;

COMMENT ON FUNCTION public.styleguide_scope_values() IS
  'The controlled vocabulary for styleguide_rules.applies_to. Mirrored in src/lib/styleguideScopes.ts (drift-tested).';

GRANT EXECUTE ON FUNCTION public.styleguide_scope_values() TO anon, authenticated;

-- ---------------------------------------------------------------
-- 2. Migrate the two rows using the retired spelling
-- ---------------------------------------------------------------
--
-- Idempotent and guarded: array_replace is a no-op on rows that never carried
-- it, so a re-run changes nothing.

UPDATE public.styleguide_rules
   SET applies_to = (
     SELECT array_agg(DISTINCT v ORDER BY v)
       FROM unnest(array_replace(applies_to, 'glossary', 'tag')) AS v
   )
 WHERE 'glossary' = ANY (applies_to);

-- ---------------------------------------------------------------
-- 3. The constraint
-- ---------------------------------------------------------------
--
-- VALIDATED, not NOT VALID: step 2 has just made every existing row conform,
-- and this table is small enough that a full scan is free. A NOT VALID
-- constraint here would let the very rows this migration exists to fix stay
-- broken.

ALTER TABLE public.styleguide_rules
  DROP CONSTRAINT IF EXISTS styleguide_rules_applies_to_known;

ALTER TABLE public.styleguide_rules
  ADD CONSTRAINT styleguide_rules_applies_to_known
  CHECK (applies_to <@ ARRAY[
    'all',
    'venue', 'event', 'city', 'country', 'village', 'landmark',
    'hotel', 'marketplace', 'news', 'tag', 'personality', 'guide',
    'rights', 'safety'
  ]::text[]);

-- ---------------------------------------------------------------
-- 4. Postconditions
-- ---------------------------------------------------------------

DO $verify$
DECLARE
  v_unknown int;
  v_glossary int;
  v_rules int;
BEGIN
  SELECT count(*) INTO v_glossary FROM public.styleguide_rules WHERE 'glossary' = ANY (applies_to);
  IF v_glossary > 0 THEN
    RAISE EXCEPTION 'the retired scope "glossary" still appears on % rule(s)', v_glossary;
  END IF;

  SELECT count(*) INTO v_unknown
    FROM public.styleguide_rules
   WHERE NOT (applies_to <@ public.styleguide_scope_values());
  IF v_unknown > 0 THEN
    RAISE EXCEPTION '% rule(s) carry a scope outside the vocabulary', v_unknown;
  END IF;

  -- Positive control: the constraint must actually REJECT something, or it is
  -- a comment with a name. "Zero unknown scopes" also passes on a table where
  -- the check does nothing at all.
  BEGIN
    INSERT INTO public.styleguide_rules (slug, section, title, body, applies_to)
    VALUES ('scope-probe', 'persona', 'probe', 'probe', ARRAY['venues']::text[]);
    RAISE EXCEPTION 'the applies_to vocabulary accepted "venues" — the constraint is not enforcing';
  EXCEPTION
    WHEN check_violation THEN NULL;  -- expected
  END;

  SELECT count(*) INTO v_rules FROM public.styleguide_rules;
  RAISE NOTICE 'applies_to vocabulary enforced across % rules', v_rules;
END
$verify$;
