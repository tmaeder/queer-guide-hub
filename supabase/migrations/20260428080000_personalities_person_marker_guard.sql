-- Issue #113 — DB-layer guard for personalities.
--
-- A CSV upload on 2026-04-25/26 ingested ~10,600 rows into `personalities`
-- because target_table was a job-level constant. About 70% of those rows
-- weren't actually persons — they were saunas, clubs, glossary terms, and
-- postcodes. The validator now classifies per-row entity type (issue #113,
-- supabase/functions/_shared/entity-classifier.ts), but we want a belt-and-
-- braces guard at the DB layer so any future code path that bypasses the
-- validator can't repeat the regression.
--
-- Rule: a row inserted into `personalities` must look like a person. We
-- accept any of these signals:
--   * birth_date set
--   * death_date set
--   * wikidata_qid matching ^Q\d+$
--   * profession non-empty
--   * bio non-empty AND ≥ 60 chars (loose person-language check)
--
-- Enforcement is a BEFORE INSERT trigger so existing rows (including the
-- 1,675 rows currently flagged needs_attention=true from the cleanup) are
-- not retroactively broken. UPDATEs are also unrestricted so admins can
-- still rescue legacy rows.

BEGIN;

CREATE OR REPLACE FUNCTION public.personalities_require_person_marker()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.birth_date IS NOT NULL
     OR NEW.death_date IS NOT NULL
     OR (NEW.wikidata_qid IS NOT NULL AND NEW.wikidata_qid ~ '^Q[0-9]+$')
     OR (NEW.profession IS NOT NULL AND length(btrim(NEW.profession)) > 0)
     OR (NEW.bio IS NOT NULL AND length(btrim(NEW.bio)) >= 60)
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'personalities row missing person markers (need at least one of birth_date, death_date, wikidata_qid, profession, or bio ≥60 chars). name=%, id=%',
    NEW.name, NEW.id
    USING ERRCODE = 'check_violation', HINT = 'route this row to the correct staging table or supply person metadata';
END;
$$;

DROP TRIGGER IF EXISTS personalities_require_person_marker ON public.personalities;
CREATE TRIGGER personalities_require_person_marker
  BEFORE INSERT ON public.personalities
  FOR EACH ROW
  EXECUTE FUNCTION public.personalities_require_person_marker();

COMMENT ON FUNCTION public.personalities_require_person_marker() IS
  'Issue #113: blocks INSERTs that lack any person marker. The pipeline-validate classifier should already have rejected these — this is the DB-layer fallback.';

COMMIT;
