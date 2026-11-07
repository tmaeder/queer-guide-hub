-- Run after the reliability migration on a disposable database.
BEGIN;
SET LOCAL statement_timeout = '30s';

DO $test$
DECLARE
  pipeline uuid;
  run uuid;
  staging_row uuid;
  tag uuid;
  left_token uuid;
  right_token uuid;
  old_token uuid;
  new_token uuid;
  result integer;
  test_slug text := 'pipeline-pilot-fixture-' || substr(gen_random_uuid()::text, 1, 8);
  nodes jsonb := '[
    {"id":"left","type":"fan-out"},
    {"id":"right","type":"fan-out"},
    {"id":"commit","type":"pipeline-commit","data":{"config":{"targetTable":"unified_tags","conflictKey":"slug"}}}
  ]';
  edges jsonb := '[{"source":"left","target":"commit"},{"source":"right","target":"commit"}]';
BEGIN
  -- Reuse the pilot's real identity without retaining any graph edits.
  INSERT INTO public.pipeline_definitions(name, nodes, edges, timeout_seconds)
  VALUES ('tags-ingestion', nodes, edges, 120)
  ON CONFLICT (name) DO UPDATE SET nodes = excluded.nodes, edges = excluded.edges
  RETURNING id INTO pipeline;

  run := public.start_reliable_tags_pipeline(pipeline, '{}');
  IF (SELECT count(*) FROM pgmq.q_pipeline_steps WHERE message->>'pipeline_run_id' = run::text) <> 2 THEN
    RAISE EXCEPTION 'Root scheduling is incomplete';
  END IF;

  left_token := (public.claim_reliable_pipeline_step(run, 'left')->>'token')::uuid;
  right_token := (public.claim_reliable_pipeline_step(run, 'right')->>'token')::uuid;
  IF left_token IS NULL OR right_token IS NULL
     OR public.claim_reliable_pipeline_step(run, 'left') IS NOT NULL THEN
    RAISE EXCEPTION 'Expected one claim per root';
  END IF;

  IF NOT public.finish_reliable_pipeline_step(run, 'left', left_token, 'completed', 2)
     OR public.claim_reliable_pipeline_step(run, 'commit') IS NOT NULL THEN
    RAISE EXCEPTION 'Fan-in became claimable too early';
  END IF;

  -- Roll back the handoff transaction as if it failed after advancing the node.
  BEGIN
    PERFORM public.finish_reliable_pipeline_step(run, 'right', right_token, 'completed', 3);
    RAISE EXCEPTION 'fixture interruption' USING ERRCODE = 'PZ001';
  EXCEPTION WHEN SQLSTATE 'PZ001' THEN NULL;
  END;
  IF EXISTS (SELECT FROM pgmq.q_pipeline_steps
    WHERE message->>'pipeline_run_id' = run::text AND message->>'current_node_id' = 'commit')
    OR public.claim_reliable_pipeline_step(run, 'commit') IS NOT NULL THEN
    RAISE EXCEPTION 'Handoff escaped rollback';
  END IF;

  IF NOT public.finish_reliable_pipeline_step(run, 'right', right_token, 'completed', 3) THEN
    RAISE EXCEPTION 'Could not complete right predecessor';
  END IF;
  IF (SELECT count(*) FROM pgmq.q_pipeline_steps WHERE message->>'pipeline_run_id' = run::text
         AND message->>'current_node_id' = 'commit') <> 1 THEN
    RAISE EXCEPTION 'Fan-in successor was not enqueued exactly once';
  END IF;

  -- Simulate a queue message that disappeared before any claim.
  DELETE FROM pgmq.q_pipeline_steps WHERE message->>'pipeline_run_id' = run::text
    AND message->>'current_node_id' = 'commit';
  UPDATE public.pipeline_runs SET node_states = jsonb_set(node_states, '{commit,wake_at}', to_jsonb(now() - interval '1s')),
    step_recovery_at = now() - interval '1s' WHERE id = run;
  PERFORM public.reap_stuck_pipeline_runs();
  IF (SELECT count(*) FROM pgmq.q_pipeline_steps WHERE message->>'pipeline_run_id' = run::text
      AND message->>'current_node_id' = 'commit') <> 1 THEN
    RAISE EXCEPTION 'Lost delivery was not recovered';
  END IF;

  old_token := (public.claim_reliable_pipeline_step(run, 'commit')->>'token')::uuid;
  IF old_token IS NULL THEN RAISE EXCEPTION 'Commit claim was unavailable'; END IF;
  UPDATE public.pipeline_runs SET node_states = jsonb_set(node_states, '{commit,wake_at}', to_jsonb(now() - interval '1s')),
    step_recovery_at = now() - interval '1s' WHERE id = run;
  PERFORM public.reap_stuck_pipeline_runs();
  IF public.claim_reliable_pipeline_step(run, 'commit') IS NOT NULL THEN
    RAISE EXCEPTION 'Retry backoff was bypassed';
  END IF;
  UPDATE public.pipeline_runs SET node_states = jsonb_set(node_states, '{commit,retry_at}', to_jsonb(now() - interval '1s'))
  WHERE id = run;
  new_token := (public.claim_reliable_pipeline_step(run, 'commit')->>'token')::uuid;
  IF new_token IS NULL OR new_token = old_token
     OR public.finish_reliable_pipeline_step(run, 'commit', old_token, 'completed') THEN
    RAISE EXCEPTION 'Expired attempt can still finalize';
  END IF;

  INSERT INTO public.ingestion_staging(pipeline_run_id, source_type, target_table, entity_type, raw_data, normalized_data,
    ai_validation_status, dedup_status, review_status)
  VALUES (run, 'csv', 'unified_tags', 'tag', '{}',
    jsonb_build_object('name', 'Pipeline Fixture', 'metadata', jsonb_build_object('slug', test_slug)),
    'approved', 'unique', 'approved')
  RETURNING id INTO staging_row;

  IF public.commit_reliable_pipeline_tags(run, 'commit', old_token, 50, false) IS NOT NULL
     OR EXISTS (SELECT FROM public.unified_tags WHERE slug = test_slug) THEN
    RAISE EXCEPTION 'Expired attempt wrote a tag';
  END IF;

  BEGIN
    PERFORM public.commit_reliable_pipeline_tags(run, 'commit', new_token, 50, false);
    RAISE EXCEPTION 'fixture interruption' USING ERRCODE = 'PZ001';
  EXCEPTION WHEN SQLSTATE 'PZ001' THEN NULL;
  END;
  IF EXISTS (SELECT FROM public.unified_tags WHERE slug = test_slug)
     OR (SELECT disposition FROM public.ingestion_staging WHERE id = staging_row) <> 'pending' THEN
    RAISE EXCEPTION 'Interrupted commit left a partial write';
  END IF;

  result := public.commit_reliable_pipeline_tags(run, 'commit', new_token, 50, false);
  SELECT target_record_id INTO tag FROM public.ingestion_staging WHERE id = staging_row AND disposition = 'committed';
  IF result IS DISTINCT FROM 1 OR tag IS NULL
     OR public.commit_reliable_pipeline_tags(run, 'commit', new_token, 50, false) IS DISTINCT FROM 1
     OR (SELECT count(*) FROM public.unified_tags WHERE id = tag AND slug = test_slug) <> 1
     OR (SELECT count(*) FROM public.ingestion_events WHERE staging_id = staging_row AND stage = 'commit') <> 1
     OR NOT EXISTS (SELECT FROM public.pipeline_runs WHERE id = run AND status = 'completed' AND items_processed = 6) THEN
    RAISE EXCEPTION 'Commit or lost-response replay did not preserve one publication and checkpoint';
  END IF;

  run := public.start_reliable_tags_pipeline(pipeline, '{}');
  left_token := (public.claim_reliable_pipeline_step(run, 'left')->>'token')::uuid;
  UPDATE public.pipeline_runs SET node_states = jsonb_set(node_states, '{left,wake_at}', to_jsonb(now() - interval '1s')),
    step_recovery_at = now() - interval '1s' WHERE id = run;
  PERFORM public.reap_stuck_pipeline_runs();
  IF NOT EXISTS (SELECT FROM public.pipeline_runs WHERE id = run AND status = 'failed'
                 AND error_message LIKE '%requires operator review%') THEN
    RAISE EXCEPTION 'Interrupted stage without a replay contract was not surfaced';
  END IF;

  run := public.start_reliable_tags_pipeline(pipeline, '{}');
  left_token := (public.claim_reliable_pipeline_step(run, 'left')->>'token')::uuid;
  PERFORM public.finish_reliable_pipeline_step(run, 'left', left_token, 'completed');
  right_token := (public.claim_reliable_pipeline_step(run, 'right')->>'token')::uuid;
  PERFORM public.finish_reliable_pipeline_step(run, 'right', right_token, 'completed');

  FOR attempt IN 1..3 LOOP
    new_token := (public.claim_reliable_pipeline_step(run, 'commit')->>'token')::uuid;
    IF new_token IS NULL OR NOT public.finish_reliable_pipeline_step(run, 'commit', new_token, 'retry', 0, 'fixture') THEN
      RAISE EXCEPTION 'Commit retry % was not accepted', attempt;
    END IF;
    UPDATE public.pipeline_runs SET node_states = jsonb_set(node_states, '{commit,retry_at}', to_jsonb(now() - interval '1s'))
    WHERE id = run AND status = 'running';
  END LOOP;
  IF NOT EXISTS (SELECT FROM public.pipeline_runs WHERE id = run AND status = 'failed'
                 AND error_message LIKE '%Retry limit reached%') THEN
    RAISE EXCEPTION 'Exhausted retry budget was not surfaced';
  END IF;
END;
$test$;

ROLLBACK;
