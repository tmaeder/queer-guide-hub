-- Two false-positive classes in the previous predicate, both found by running it.
--
-- 1. `[^[:ascii:]]` is too blunt. Correct English carries accents -- "Duke of
--    Orléans" was flagged as untranslated. The signal that means German HERE is the
--    German-specific letters, which is what the original v2 view used and was right
--    about: ä ö ü ß (and their capitals). Reverted to that.
--
-- 2. A translation whose English output equals its own source_term after casing
--    ("germanist" -> "Germanist", "domestic worker" -> "Domestic worker") re-matched
--    the membership arm forever: the row is FINISHED, and the queue listed it as
--    outstanding. Membership now requires the stored value to differ from the
--    translation's own output -- i.e. "this row has NOT yet been translated".
--
-- Both were caught because the view was queried after every change rather than
-- assumed correct; the first pass reported 3 items and all 3 were artifacts.

CREATE OR REPLACE VIEW public.profession_review_queue AS
  SELECT
    p.profession,
    count(*)::bigint                                AS people,
    bool_or(p.visibility = 'public')                AS on_public_site,
    (p.profession ~ '[äöüßÄÖÜ]'
      OR p.profession ~ '(/|:|\*)in\M|innen\M')     AS looks_german,
    min(p.enrichment_status->'profession'->>'raw')  AS example_raw
  FROM public.personalities p
  WHERE p.profession IS NOT NULL
    AND btrim(p.profession) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM public.professions pr
      WHERE pr.is_active AND lower(pr.name) = lower(p.profession)
    )
    AND (
         p.profession ~ '[äöüßÄÖÜ]'                   -- German-specific letters
      OR p.profession ~ '(/|:|\*)in\M|innen\M'        -- gender markers
      OR p.profession ~ '-\s*$'                       -- hanging compound prefix
      OR p.profession ~ '^\s*\('                      -- parenthetical-only
      OR EXISTS (
           SELECT 1 FROM public.profession_translations t
            WHERE t.source_term = lower(p.profession)
              AND t.english IS DISTINCT FROM p.profession   -- not already applied
         )
    )
  GROUP BY p.profession
  ORDER BY count(*) DESC, p.profession;

COMMENT ON VIEW public.profession_review_queue IS
  'Profession values that still need translating, or are not professions at all. Deliberately does NOT list correct English professions merely absent from the 35-term vocabulary (Botanist, Paleontologist, ...) -- that is the normal resting state, not a defect. Nor does it list a value that already IS its translation. The hanging-hyphen and parenthetical-only arms are kept as a live regression alarm for the normalizer defects fixed in profession_compound_ellipsis. Drain by adding a row to profession_translations (english = NULL means "not a profession, clear it"), or an alias in professions.aliases when the term really is one of the 35 canonicals under another spelling.';

REVOKE ALL ON public.profession_review_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profession_review_queue TO service_role;
