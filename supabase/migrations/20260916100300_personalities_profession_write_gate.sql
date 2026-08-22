-- Single write gate for personalities.profession + personalities.roles.
--
-- Until now exactly ONE of the six writers normalized: commit_personality_staging_item
-- (20260608200002). The other five write raw text —
--   supabase/functions/pipeline-normalize/index.ts   (arrays joined with ', ' — the
--                                                     literal origin of the comma lists)
--   supabase/functions/pipeline-commit/build-record.ts
--   supabase/functions/bulk-create-personalities/index.ts
--   supabase/functions/import-personalities-csv/index.ts
--   the CMS free-text inputs (ProfessionAutocompleteField, AddPersonalityDialog)
-- — which is why the German cohort regrew after the single June 2026 backfill and
-- would regrow again the moment this one finishes. A BEFORE trigger gates all of
-- them at once and cannot be bypassed by a writer added later.
--
-- Template: 20260810120000_event_taxonomy_write_gate.sql.
--
-- NOT column-scoped, deliberately: a trigger declared `UPDATE OF profession` fires
-- on the columns named in the UPDATE STATEMENT, not on what the statement actually
-- changed — the defect documented in 20260807100200 for trg_venues_safety_gated.
--
-- TRIGGER NAME IS LOAD-BEARING. BEFORE triggers fire in NAME order, and
-- `trg_personalities_adult_dates_guard` (BEFORE INSERT OR UPDATE OF …, is_adult)
-- is the chimera guard that flags an "adult performer" born before 1900 as a
-- probable same-named historical figure. For this gate's is_adult assertion to be
-- seen by that guard on INSERT, this trigger must sort BEFORE it:
--     trg_personalities_aa_profession_gate  <  trg_personalities_adult_dates_guard
-- Renaming it to anything sorting later silently disables that safety check.

CREATE OR REPLACE FUNCTION public.normalize_personality_profession()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_raw   text;
  v_nf    jsonb;
  v_roles text[];
BEGIN
  -- Cheap early-out FIRST. Without it every unrelated write — the hourly enrichment
  -- loop stamping last_refreshed_at, a visibility flip, a city link — pays a
  -- vocabulary lookup per row. The facets matview migration measured that cost at
  -- ~1 ms/row, which is the difference between a free trigger and a tax on the
  -- whole table.
  IF TG_OP = 'UPDATE'
     AND NEW.profession IS NOT DISTINCT FROM OLD.profession
     AND NEW.roles      IS NOT DISTINCT FROM OLD.roles THEN
    RETURN NEW;
  END IF;

  v_raw := NEW.profession;

  -- Adult cohort, asserted from the RAW string before normalization — the same
  -- patterns and the same ordering commit_personality_staging_item already uses.
  --
  -- INSERT ONLY, and one-way (never true -> false). Two reasons it must not run on
  -- UPDATE: (1) trg_personalities_adult_dates_guard is column-scoped on is_adult, so
  -- on `UPDATE ... SET profession = …` it does not fire at all and a flip here would
  -- escape the chimera check no matter how this trigger is named; (2) flipping a
  -- flag an admin deliberately cleared is a decision, not a normalization. An UPDATE
  -- that means to change adult status names the column and is guarded normally.
  IF TG_OP = 'INSERT' AND v_raw IS NOT NULL AND (
       v_raw ILIKE '%adult performer%' OR v_raw ILIKE '%adult model%'
    OR v_raw ILIKE '%adult film%'      OR v_raw ILIKE '%porn%'
  ) THEN
    NEW.is_adult := true;
  END IF;

  -- Validate any caller-supplied roles against the vocabulary (default-reject).
  -- roles is an exact-match filter and a live search facet since
  -- 20260716120000_person_roles_field.sql, so a free-text member is a visible
  -- false positive, not a harmless extra.
  v_roles := ARRAY(
    SELECT DISTINCT r
    FROM unnest(coalesce(NEW.roles, '{}'::text[])) r
    WHERE EXISTS (SELECT 1 FROM public.professions p WHERE p.is_active AND p.slug = r)
    ORDER BY r
  );

  IF v_raw IS NULL OR btrim(v_raw) = '' THEN
    -- '' and NULL both mean "missing" to personality_data_health; store one of them.
    NEW.profession := NULL;
    NEW.roles      := v_roles;
    RETURN NEW;
  END IF;

  v_nf := public.normalize_profession_full(v_raw);

  -- Idempotent by construction: tier 1 of normalize_profession_full returns a
  -- canonical name unchanged, so re-writing an already-normalized row is a no-op.
  -- Asserted over every canonical in
  -- supabase/migrations/__tests__/profession_normalize.sql — this is the exact
  -- failure 20260810120000 had to retrofit after normalize_event_accessibility
  -- destroyed 11 of 18 stored slugs on its second pass.
  NEW.profession := v_nf ->> 'profession';

  NEW.roles := ARRAY(
    SELECT DISTINCT r
    FROM unnest(v_roles || ARRAY(SELECT jsonb_array_elements_text(v_nf -> 'roles'))) r
    WHERE r IS NOT NULL AND r <> ''
    ORDER BY r
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.normalize_personality_profession() IS
  'Write gate for personalities.profession + roles. Routes profession through '
  'normalize_profession_full, default-rejects unknown role slugs, and asserts the '
  'adult cohort from the raw string on INSERT only. Early-outs when neither column '
  'changed.';

DROP TRIGGER IF EXISTS trg_personalities_aa_profession_gate ON public.personalities;
CREATE TRIGGER trg_personalities_aa_profession_gate
  BEFORE INSERT OR UPDATE ON public.personalities
  FOR EACH ROW EXECUTE FUNCTION public.normalize_personality_profession();
