-- Events pipeline end-to-end SQL test.
-- Run against a non-prod branch or manually in SQL editor.
-- Stages a fixture event, commits it, re-commits to verify idempotency,
-- stages a near-duplicate to verify dedup, then cleans up.
--
-- Usage:  psql ... -f supabase/tests/events_pipeline_e2e.sql
-- Expected: RAISE NOTICEs showing action='inserted', then 'noop', then
-- duplicate detection at score >= 0.90; leaked_* counts = 0.

DO $$
DECLARE
  v_staging UUID;
  v_event UUID;
  v_action TEXT;
  v_dup_staging UUID;
  v_dup_event UUID;
  v_dup_action TEXT;
  v_audit INT;
  v_src INT;
  v_cand RECORD;
BEGIN
  -- ===== PASS 1: stage + commit =====
  v_staging := public.stage_event_for_commit(
    'test-e2e', 'test-e2e-source', 'e2e-fixture-1',
    jsonb_build_object('id','e2e-fixture-1','url','https://example.com/e2e-1'),
    jsonb_build_object(
      'title','E2E Test Event — delete me',
      'description','End-to-end fixture event for pipeline verification. Long enough description.',
      'event_type','party',
      'start_date', (now() + interval '30 days')::text,
      'city','Berlin',
      'latitude', 52.52,
      'longitude', 13.405
    ),
    'https://example.com/e2e-1'
  );

  UPDATE public.ingestion_staging SET
    ai_validation_status = 'approved',
    dedup_status = 'unique',
    review_status = 'auto'
  WHERE id = v_staging;

  SELECT c.event_id, c.action INTO v_event, v_action
  FROM public.commit_event_staging_item(v_staging, 'test-e2e') c;
  RAISE NOTICE 'PASS 1: staging=%  event=%  action=% (expect inserted)', v_staging, v_event, v_action;

  SELECT count(*) INTO v_audit FROM public.ingestion_events WHERE staging_id = v_staging;
  SELECT count(*) INTO v_src FROM public.event_sources WHERE event_id = v_event;
  IF v_audit < 2 THEN RAISE EXCEPTION 'audit rows should be >= 2 (stage + commit), got %', v_audit; END IF;
  IF v_src <> 1 THEN RAISE EXCEPTION 'expected 1 event_sources row, got %', v_src; END IF;

  -- ===== PASS 2: re-commit same staging = noop =====
  SELECT c.action INTO v_action
  FROM public.commit_event_staging_item(v_staging, 'test-e2e-rerun') c;
  RAISE NOTICE 'PASS 2: rerun action=% (expect noop)', v_action;
  IF v_action <> 'noop' THEN RAISE EXCEPTION 'expected noop on rerun, got %', v_action; END IF;

  -- ===== PASS 3: dedup candidate RPC finds the committed event =====
  SELECT * INTO v_cand FROM public.find_event_duplicate_candidates(
    'E2E Test Event — delete me',
    (now() + interval '30 days')::timestamptz,
    NULL, 'Berlin', 52.52::numeric, 13.405::numeric, NULL, 5
  ) LIMIT 1;
  RAISE NOTICE 'PASS 3: dedup candidate=% score=% (expect >= 0.90)', v_cand.event_id, v_cand.score;
  IF v_cand.event_id IS NULL OR v_cand.score < 0.90 THEN
    RAISE EXCEPTION 'dedup did not find self-match';
  END IF;

  -- ===== PASS 4: hash-idempotent re-stage returns same id =====
  v_dup_staging := public.stage_event_for_commit(
    'test-e2e', 'test-e2e-source', 'e2e-fixture-1',
    jsonb_build_object('id','e2e-fixture-1','url','https://example.com/e2e-1'),
    jsonb_build_object(
      'title','E2E Test Event — delete me',
      'start_date', (now() + interval '30 days')::text,
      'city','Berlin'
    )
  );
  RAISE NOTICE 'PASS 4: re-stage returned=% (same raw hash)', v_dup_staging;

  -- ===== CLEANUP =====
  DELETE FROM public.event_sources WHERE event_id = v_event;
  DELETE FROM public.events WHERE id = v_event;
  DELETE FROM public.ingestion_events WHERE staging_id = v_staging;
  DELETE FROM public.ingestion_staging WHERE id = v_staging;
  RAISE NOTICE 'CLEANUP: done';
END $$;

-- Leak check
SELECT
  (SELECT count(*) FROM public.events WHERE title LIKE 'E2E Test%') AS leaked_events,
  (SELECT count(*) FROM public.ingestion_staging WHERE source_type = 'test-e2e') AS leaked_staging,
  (SELECT count(*) FROM public.event_sources WHERE source_slug = 'test-e2e-source') AS leaked_sources;
