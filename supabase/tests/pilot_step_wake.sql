-- Run after the reliability and fast-wake migrations on a disposable database.
BEGIN;
SET LOCAL statement_timeout = '30s';

DO $test$
DECLARE
  pipeline uuid;
  run uuid;
  token uuid;
  wakes text[];
  step_id text;
  total_wakes integer := 0;
  nodes jsonb := '[
    {"id":"a","type":"fan-out"},
    {"id":"b","type":"fan-out"},
    {"id":"c","type":"fan-out"},
    {"id":"commit","type":"pipeline-commit","data":{"config":{"targetTable":"unified_tags","conflictKey":"slug"}}}
  ]';
  edges jsonb := '[{"source":"a","target":"commit"},{"source":"b","target":"commit"},{"source":"c","target":"commit"}]';
BEGIN
  INSERT INTO public.pipeline_definitions(name, nodes, edges, timeout_seconds)
  VALUES ('tags-ingestion', nodes, edges, 120)
  ON CONFLICT (name) DO UPDATE SET nodes = excluded.nodes, edges = excluded.edges
  RETURNING id INTO pipeline;

  run := public.start_reliable_tags_pipeline(pipeline, '{}');
  IF cardinality(public.reserve_reliable_pipeline_wakes(run)) <> 0 THEN
    RAISE EXCEPTION 'Fast wake activated without opt-in';
  END IF;
  IF has_function_privilege('anon', 'public.reserve_reliable_pipeline_wakes(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reserve_reliable_pipeline_wakes(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Fast wake reservations must be service-only';
  END IF;

  run := public.start_reliable_tags_pipeline(pipeline, '{"fast_step_wake":true}');
  wakes := public.reserve_reliable_pipeline_wakes(run);
  IF wakes IS DISTINCT FROM ARRAY['a','b'] OR cardinality(public.reserve_reliable_pipeline_wakes(run)) <> 0 THEN
    RAISE EXCEPTION 'Fast wake did not bound in-flight reservations: %', wakes;
  END IF;
  IF (SELECT count(*) FROM pgmq.q_pipeline_steps WHERE message->>'pipeline_run_id' = run::text) <> 3 THEN
    RAISE EXCEPTION 'Fast wake removed or duplicated a durable queue message';
  END IF;

  -- The a wake was lost. Its original queue delivery can claim the step,
  -- and a late wake cannot start a second attempt.
  token := (public.claim_reliable_pipeline_step(run, 'a')->>'token')::uuid;
  IF token IS NULL OR public.claim_reliable_pipeline_step(run, 'a') IS NOT NULL THEN
    RAISE EXCEPTION 'Lost fast wake prevented ordinary delivery or admitted a duplicate';
  END IF;
  PERFORM public.finish_reliable_pipeline_step(run, 'a', token, 'completed');
  IF public.reserve_reliable_pipeline_wakes(run) IS DISTINCT FROM ARRAY['c'] THEN
    RAISE EXCEPTION 'A released slot did not wake the next ready step';
  END IF;

  FOREACH step_id IN ARRAY ARRAY['b','c'] LOOP
    token := (public.claim_reliable_pipeline_step(run, step_id)->>'token')::uuid;
    PERFORM public.finish_reliable_pipeline_step(run, step_id, token, 'completed');
  END LOOP;
  token := (public.claim_reliable_pipeline_step(run, 'commit')->>'token')::uuid;
  IF token IS NULL OR NOT public.finish_reliable_pipeline_step(run, 'commit', token, 'retry', 0, 'fixture') THEN
    RAISE EXCEPTION 'Could not schedule a commit retry';
  END IF;
  IF cardinality(public.reserve_reliable_pipeline_wakes(run)) <> 0
     OR public.claim_reliable_pipeline_step(run, 'commit') IS NOT NULL THEN
    RAISE EXCEPTION 'Fast wake bypassed retry backoff';
  END IF;

  UPDATE public.pipeline_definitions
  SET nodes = (SELECT jsonb_agg(jsonb_build_object('id', i::text, 'type', 'fan-out')) FROM generate_series(1,10) i),
      edges = '[]'
  WHERE id = pipeline;
  run := public.start_reliable_tags_pipeline(pipeline, '{"fast_step_wake":true}');
  LOOP
    wakes := public.reserve_reliable_pipeline_wakes(run);
    EXIT WHEN cardinality(wakes) = 0;
    total_wakes := total_wakes + cardinality(wakes);
    FOREACH step_id IN ARRAY wakes LOOP
      token := (public.claim_reliable_pipeline_step(run, step_id)->>'token')::uuid;
      PERFORM public.finish_reliable_pipeline_step(run, step_id, token, 'completed');
    END LOOP;
  END LOOP;
  IF total_wakes <> 8 THEN
    RAISE EXCEPTION 'Expected a bounded per-run wake budget, got %', total_wakes;
  END IF;
END;
$test$;

ROLLBACK;
