-- One-time City Truth Engine backfill: completeness -> trust -> coverage radar.
-- Forces a first pass over all 3,877 cities while the automations stay paused.
-- Disk-guarded: skips if the DB is within ~1.5 GB of the 8 GB ceiling (read-only cliff).
-- Cities are NOT in the search_documents sync, so these UPDATEs trigger no tsvector storm.
DO $$
DECLARE
  v_db_bytes bigint;
  v_ceiling  bigint := 8 * 1024::bigint * 1024 * 1024;   -- 8 GB plan ceiling
  v_headroom bigint := 1536::bigint * 1024 * 1024;        -- require >=1.5 GB free
  r1 jsonb; r2 jsonb; r3 jsonb;
BEGIN
  SELECT pg_database_size(current_database()) INTO v_db_bytes;
  IF v_db_bytes > (v_ceiling - v_headroom) THEN
    RAISE WARNING 'city_truth_backfill skipped: db_size=% bytes, insufficient headroom', v_db_bytes;
    RETURN;
  END IF;

  r1 := public.run_city_completeness_recompute(p_force => true);
  r2 := public.run_city_trust_recompute(p_force => true);
  r3 := public.run_city_coverage_radar(p_force => true);
  RAISE NOTICE 'city_truth_backfill: completeness=% trust=% radar=%', r1, r2, r3;
END $$;
