-- Deterministic, vocabulary-backed profession normalizer + in-place backfill.
--
-- Maps any raw profession string to one canonical vocabulary term:
--   1. exact name / alias match on the full trimmed string (catches multi-word
--      canonicals and slash-bearing aliases like "hiv/aids activist"),
--   2. else split on the primary token (comma / slash / ampersand / " and ") and
--      retry name / alias / slug match,
--   3. else a clean Title-cased fallback (unknown but rare singletons).
-- Replaces the weak display-only `canonical_profession()` CASE.

CREATE OR REPLACE FUNCTION public.normalize_profession(p text)
RETURNS text
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
AS $$
DECLARE
  v_full    text;
  v_primary text;
  v_key     text;
  v_hit     text;
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN
    RETURN NULL;
  END IF;

  v_full := lower(btrim(p));

  -- 1. full-string exact name or alias match
  SELECT name INTO v_hit FROM public.professions
   WHERE is_active AND (lower(name) = v_full
      OR v_full = ANY (SELECT lower(a) FROM unnest(aliases) a))
   ORDER BY sort_order LIMIT 1;
  IF v_hit IS NOT NULL THEN RETURN v_hit; END IF;

  -- 2. primary token (first of comma / slash / ampersand / " and " separated list)
  v_primary := btrim(split_part(regexp_replace(p, '\s*(/|&|\yand\y)\s*', ',', 'gi'), ',', 1));
  IF v_primary = '' THEN v_primary := btrim(p); END IF;
  v_key := lower(v_primary);

  SELECT name INTO v_hit FROM public.professions
   WHERE is_active AND (lower(name) = v_key
      OR v_key = ANY (SELECT lower(a) FROM unnest(aliases) a)
      OR slug = btrim(regexp_replace(v_key, '[^a-z0-9]+', '-', 'g'), '-'))
   ORDER BY sort_order LIMIT 1;
  IF v_hit IS NOT NULL THEN RETURN v_hit; END IF;

  -- 3. clean Title-case fallback
  RETURN initcap(v_primary);
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_profession(text) TO anon, authenticated;

COMMENT ON FUNCTION public.canonical_profession(text) IS
  'DEPRECATED 2026-06-08: superseded by normalize_profession(text) (vocabulary-backed). Retained for back-compat.';

-- One-time, batched, reversible backfill. Every personality UPDATE fires the
-- search_documents sync trigger, so this MUST run in small chunks (default 300)
-- driven by a loop in scripts/data-quality/normalize-professions.mjs, not as one
-- statement (memory: amenity search-trigger storm + disk-constrained DB).
-- The raw original is snapshotted into enrichment_status.profession (reversible),
-- which also marks the row as done so re-runs skip it.
CREATE OR REPLACE FUNCTION public.run_profession_normalize_backfill(p_batch int DEFAULT 300)
RETURNS TABLE(processed int, changed int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_processed int := 0;
  v_changed   int := 0;
BEGIN
  WITH due AS (
    SELECT id, profession AS old_prof
    FROM public.personalities
    WHERE profession IS NOT NULL AND btrim(profession) <> ''
      AND (enrichment_status->'profession'->>'raw') IS NULL
    ORDER BY id
    LIMIT greatest(p_batch, 1)
    FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.personalities p SET
      profession = public.normalize_profession(d.old_prof),
      enrichment_status = jsonb_set(
        coalesce(p.enrichment_status, '{}'::jsonb),
        '{profession}',
        jsonb_build_object(
          'raw', d.old_prof,
          'all', (
            SELECT coalesce(jsonb_agg(btrim(x) ORDER BY ord), '[]'::jsonb)
            FROM regexp_split_to_table(
                   regexp_replace(d.old_prof, '\s*(/|&|\yand\y)\s*', ',', 'gi'), ','
                 ) WITH ORDINALITY AS t(x, ord)
            WHERE btrim(x) <> ''
          ),
          'normalized_at', now(),
          'source', 'normalize_profession'
        ),
        true
      )
    FROM due d
    WHERE p.id = d.id
    RETURNING (public.normalize_profession(d.old_prof) IS DISTINCT FROM d.old_prof) AS did_change
  )
  SELECT count(*)::int, count(*) FILTER (WHERE did_change)::int
    INTO v_processed, v_changed
  FROM upd;

  RETURN QUERY SELECT v_processed, v_changed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_profession_normalize_backfill(int) TO service_role;

-- Facets now group on the normalized value (defensive: stays correct even if a row
-- slips in un-normalized). Cheap over the ~1.1k public rows. Adult cohort excluded.
CREATE OR REPLACE FUNCTION public.get_personality_profession_facets(lim int DEFAULT 20)
RETURNS TABLE (profession text, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT public.normalize_profession(p.profession) AS profession
    FROM public.personalities p
    WHERE p.visibility = 'public'
      AND p.profession IS NOT NULL
      AND p.profession <> ''
      AND p.profession NOT ILIKE '%adult performer%'
      AND p.profession NOT ILIKE '%adult model%'
      AND p.profession NOT ILIKE '%adult film%'
      AND p.profession NOT ILIKE '%porn%'
  )
  SELECT profession, COUNT(*)::bigint AS cnt
  FROM base
  WHERE profession IS NOT NULL
  GROUP BY profession
  ORDER BY COUNT(*) DESC, profession ASC
  LIMIT GREATEST(lim, 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_personality_profession_facets(int) TO anon, authenticated;
