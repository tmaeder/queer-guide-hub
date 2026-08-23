-- RECOVERED, not authored. Applied to prod at version 20260823063544 with no file in
-- version control and no PR carrying it. Migration drift makes `supabase db push`
-- SKIP for the WHOLE repo, so every open PR fails migration-versions as
-- collateral and no merged migration reaches prod.
--
-- Byte-for-byte from supabase_migrations.schema_migrations.statements
-- (2809 chars, md5 ecfe512b6cc2d8d7c0d944b630789191), transported as base64 and decoded locally
-- so no hand-transcription could mangle an escape. Already live: applying it is
-- a no-op; the file exists so db push can match the version.
--
-- One of SEVEN orphans applied inside ~25 minutes on 2026-08-23 by concurrent
-- sessions. `apply_migration` is not done until the file is MERGED TO MAIN.

-- profession_review_queue: count REAL work, not "absent from a 35-term vocabulary".
--
-- The original predicate was "does not exactly match an active professions.name",
-- correct while the corpus was 90% German, wrong now. After the translation tier
-- landed, all 190 remaining entries were correct English professions that simply are
-- not among the 35 canonicals -- Astrophysicist, Paleontologist, Software Developer,
-- Wheelchair Racer, Vibraphonist. Nothing is wrong with them and there is no action
-- a reviewer could take: mapping Paleontologist onto Researcher DESTROYS information,
-- and adding it as a 36th canonical puts it in the People page facet chips beside
-- Actor and Activist. A queue reporting 190 items when zero exist is worse than no
-- queue -- it sends the next session hunting defects that are not there.

CREATE OR REPLACE VIEW public.profession_review_queue AS
  SELECT
    p.profession,
    count(*)::bigint                                AS people,
    bool_or(p.visibility = 'public')                AS on_public_site,
    (p.profession ~ '[^[:ascii:]]'
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
         p.profession ~ '[^[:ascii:]]'                -- still German/other script
      OR p.profession ~ '(/|:|\*)in\M|innen\M'        -- gender markers
      OR p.profession ~ '-\s*$'                       -- hanging compound prefix
      OR p.profession ~ '^\s*\('                      -- parenthetical-only
      OR EXISTS (
           SELECT 1 FROM public.profession_translations t
            WHERE t.source_term = lower(p.profession)
         )
    )
  GROUP BY p.profession
  ORDER BY count(*) DESC, p.profession;

COMMENT ON VIEW public.profession_review_queue IS
  'Profession values that still need translating, or are not professions at all. Deliberately does NOT list correct English professions merely absent from the 35-term vocabulary (Botanist, Paleontologist, ...) -- that is the normal resting state, not a defect. The hanging-hyphen and parenthetical-only arms are kept as a live regression alarm for the normalizer defects fixed in profession_compound_ellipsis. Drain by adding a row to profession_translations (english = NULL means "not a profession, clear it"), or an alias in professions.aliases when the term really is one of the 35 canonicals under another spelling.';

REVOKE ALL ON public.profession_review_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profession_review_queue TO service_role;
