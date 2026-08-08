-- ============================================================================
-- search_documents indexers: ON CONFLICT SET lists normalized to full INSERT
-- coverage — the A2 (upsert-drain) precondition, executed early
-- ----------------------------------------------------------------------------
-- Audit 2026-08-08 (whitespace-normalized INSERT-vs-SET diff over live
-- pg_proc.prosrc): 14 of 14 search_documents_index_* functions have INSERT
-- columns absent from their DO UPDATE SET list. Mostly constant-NULL columns
-- for that type (harmless), but real drift exists — community_groups' mutable
-- `slug` is missing from index_groups' SET; venues' trust_score likewise.
--
-- TODAY this is invisible: the reindex path (search_reindex_drain A1, and the
-- old inline trigger before it) DELETEs the doc then re-inserts, so the ON
-- CONFLICT arm never fires. That is exactly why normalizing now is ZERO-RISK
-- behavior-wise — and it is the gate that A2 (upsert-only drain, no HNSW
-- churn) requires. After this, A2's only remaining gate is the 14-day
-- zero-fail soak (docs/plans/2026-08-pipeline-overhaul-wave-b.md).
--
-- Mechanics: for each indexer, parse the INSERT column list from the LIVE
-- body, generate the canonical SET (every column except the conflict key,
-- doc_id and created_at as col=excluded.col, plus updated_at=now()), and
-- replace the existing `do update set … ;` clause. Functions with anything
-- other than exactly one INSERT + one SET clause are skipped and reported —
-- none exist today; the guard is for future shapes.
-- ============================================================================

DO $$
DECLARE
  r record;
  v_def text;
  v_ins_cols text;
  v_set text;
  v_col text;
  v_fixed int := 0;
  v_skipped text[] := '{}';
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'search\_documents\_index\_%' ESCAPE '\'
    ORDER BY p.proname
  LOOP
    v_def := pg_get_functiondef(r.oid);

    -- exactly one INSERT into search_documents and one SET clause, else skip
    IF (SELECT count(*) FROM regexp_matches(v_def, 'insert into public\.search_documents', 'gi')) <> 1
       OR (SELECT count(*) FROM regexp_matches(v_def, 'do update set', 'gi')) <> 1 THEN
      v_skipped := v_skipped || r.proname;
      CONTINUE;
    END IF;

    v_ins_cols := (regexp_match(v_def, 'insert into public\.search_documents\s*\(([^)]+)\)', 'i'))[1];
    IF v_ins_cols IS NULL THEN
      v_skipped := v_skipped || r.proname;
      CONTINUE;
    END IF;

    v_set := '';
    FOR v_col IN
      SELECT lower(regexp_replace(c, '\s+', '', 'g'))
      FROM unnest(string_to_array(v_ins_cols, ',')) c
    LOOP
      IF v_col IN ('entity_type', 'entity_id', 'doc_id', 'created_at', 'updated_at') THEN
        CONTINUE;
      END IF;
      v_set := v_set || format('%s=excluded.%s, ', v_col, v_col);
    END LOOP;
    v_set := 'do update set ' || v_set || 'updated_at=now();';

    v_def := regexp_replace(v_def, 'do update set[^;]*;', v_set, 'i');
    EXECUTE v_def;
    v_fixed := v_fixed + 1;
  END LOOP;

  IF array_length(v_skipped, 1) IS NOT NULL THEN
    RAISE WARNING 'indexers skipped (unexpected shape, normalize by hand): %', v_skipped;
  END IF;
  RAISE NOTICE 'indexers normalized: %', v_fixed;

  -- Self-audit: after normalization no INSERT column may be missing from its
  -- SET list. Fails the migration loudly rather than leaving silent drift.
  IF EXISTS (
    WITH idx AS (
      SELECT p.proname, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'search\_documents\_index\_%' ESCAPE '\'
    ), parsed AS (
      SELECT proname,
        (regexp_match(prosrc, 'insert into public\.search_documents\s*\(([^)]+)\)', 'i'))[1] AS ins_cols,
        lower(regexp_replace((regexp_match(prosrc, 'do update set(.*)$', 'is'))[1], '\s+', '', 'g')) AS set_norm
      FROM idx
    ), ins AS (
      SELECT proname, lower(regexp_replace(c, '\s+', '', 'g')) AS col, set_norm
      FROM parsed, unnest(string_to_array(ins_cols, ',')) c
    )
    SELECT 1 FROM ins
    WHERE col NOT IN ('entity_type','entity_id','doc_id','created_at','updated_at')
      AND position(col || '=excluded.' IN set_norm) = 0
  ) THEN
    RAISE EXCEPTION 'indexer SET-list normalization left drift — inspect manually';
  END IF;
END $$;
