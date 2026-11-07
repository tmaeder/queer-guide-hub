BEGIN;

ALTER TABLE public.pipeline_runs
  ADD COLUMN reliable_steps boolean NOT NULL DEFAULT false,
  ADD COLUMN step_recovery_at timestamptz;

CREATE INDEX pipeline_runs_step_recovery_idx
  ON public.pipeline_runs (step_recovery_at)
  WHERE reliable_steps AND status = 'running';

-- Preserve the legacy watchdog and its schedule. Pilot runs are watched by
-- step lease/delivery deadlines instead of total age since run creation.
CREATE OR REPLACE FUNCTION public.reap_legacy_pipeline_runs()
RETURNS INT
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH reaped AS (
    UPDATE public.pipeline_runs r
    SET status = 'failed',
        error_message = COALESCE(
          r.error_message,
          format('reaped: running > %s s without heartbeat',
                 COALESCE(d.timeout_seconds, 3600))
        ),
        completed_at = now()
    FROM public.pipeline_definitions d
    WHERE r.pipeline_id = d.id
      AND r.status = 'running' AND NOT r.reliable_steps
      AND r.started_at IS NOT NULL
      AND r.started_at < now()
          - make_interval(secs => COALESCE(d.timeout_seconds, 3600))
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM reaped;

  -- Runs whose pipeline_id got nulled out: fall back to 1h.
  WITH reaped AS (
    UPDATE public.pipeline_runs
    SET status = 'failed',
        error_message = COALESCE(error_message, 'reaped: orphan run running > 1h'),
        completed_at = now()
    WHERE status = 'running' AND NOT reliable_steps
      AND pipeline_id IS NULL
      AND started_at IS NOT NULL
      AND started_at < now() - INTERVAL '1 hour'
    RETURNING 1
  )
  SELECT v_count + count(*) INTO v_count FROM reaped;

  RETURN v_count;
END;
$$;

CREATE FUNCTION public.pipeline_step_ready(p_graph jsonb, p_states jsonb, p_node text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT NOT EXISTS (
    SELECT FROM jsonb_array_elements(p_graph->'edges') edge
    WHERE edge->>'target' = p_node AND NOT COALESCE(
      p_states->(edge->>'source')->>'status' IN ('completed', 'skipped')
      OR (p_states->(edge->>'source')->>'status' = 'failed'
          AND p_states->(edge->>'source')->>'tolerated' = 'true'), false)
  )
$$;

-- The caller holds the pipeline_runs row lock (or just inserted the row).
-- pgmq_send and the saved delivery deadlines commit together.
CREATE FUNCTION public.schedule_reliable_pipeline_steps(p_run uuid)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  run public.pipeline_runs%ROWTYPE;
  node_id text;
  state jsonb;
  now_at timestamptz := clock_timestamp();
  wake_at timestamptz;
  delay_seconds integer;
BEGIN
  SELECT * INTO run FROM public.pipeline_runs
  WHERE id = p_run AND reliable_steps AND status = 'running' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  FOR node_id, state IN SELECT key, value FROM jsonb_each(run.node_states) LOOP
    IF state->>'status' <> 'pending'
       OR NOT public.pipeline_step_ready(run.pipeline_snapshot, run.node_states, node_id)
       OR (state->>'wake_at')::timestamptz > now_at THEN
      CONTINUE;
    END IF;

    IF COALESCE((state->>'deliveries')::integer, 0) >= 4 THEN
      state := state - 'wake_at' || jsonb_build_object(
        'status', 'failed', 'completed_at', now_at, 'error', 'Step was never claimed after repeated delivery');
      UPDATE public.pipeline_runs
      SET status = 'failed', completed_at = now_at, step_recovery_at = NULL,
          node_states = jsonb_set(run.node_states, ARRAY[node_id], state),
          error_message = format('Node %s: %s', node_id, state->>'error')
      WHERE id = p_run;
      RETURN;
    END IF;

    delay_seconds := GREATEST(0, ceil(extract(epoch FROM
      ((state->>'retry_at')::timestamptz - now_at)))::integer);
    PERFORM public.pgmq_send('pipeline_steps', jsonb_build_object(
      'workflow', 'pipeline-executor', 'action', 'continue', 'pipeline_run_id', p_run,
      'pipeline_id', run.pipeline_id, 'pipeline_name', run.pipeline_name,
      'current_node_id', node_id, 'current_step', 0,
      'total_steps', jsonb_array_length(run.pipeline_snapshot->'nodes'), 'context', run.context
    ), delay_seconds);
    run.node_states := jsonb_set(run.node_states, ARRAY[node_id], state || jsonb_build_object(
      'wake_at', now_at + make_interval(secs => delay_seconds + 600),
      'deliveries', COALESCE((state->>'deliveries')::integer, 0) + 1));
  END LOOP;

  SELECT min((value->>'wake_at')::timestamptz) INTO wake_at FROM jsonb_each(run.node_states)
    WHERE value->>'status' IN ('pending', 'running');
  UPDATE public.pipeline_runs
  SET node_states = run.node_states, step_recovery_at = wake_at
  WHERE id = p_run;
END;
$$;

CREATE FUNCTION public.start_reliable_tags_pipeline(p_pipeline uuid, p_context jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  graph jsonb;
  states jsonb;
  run_id uuid;
BEGIN
  SELECT jsonb_build_object(
    'id', id, 'name', name, 'display_name', display_name, 'version', version,
    'nodes', nodes, 'edges', edges, 'default_context', default_context,
    'max_concurrency', max_concurrency, 'timeout_seconds', timeout_seconds, 'snapshotted_at', now()
  ) INTO graph FROM public.pipeline_definitions WHERE id = p_pipeline;
  IF graph->>'name' IS DISTINCT FROM 'tags-ingestion' THEN
    RAISE EXCEPTION 'The reliability pilot is only available for tags-ingestion';
  END IF;

  SELECT jsonb_object_agg(node->>'id', '{"status":"pending","items_in":0,"items_out":0}'::jsonb)
  INTO states FROM jsonb_array_elements(graph->'nodes') node;
  IF states IS NULL OR jsonb_array_length(graph->'nodes') <>
      (SELECT count(*) FROM jsonb_object_keys(states))
     OR EXISTS (SELECT FROM jsonb_array_elements(graph->'edges') edge
                WHERE NOT COALESCE(states ? (edge->>'source') AND states ? (edge->>'target'), false))
     OR EXISTS (
       -- Iteratively remove nodes whose prerequisites are already reachable.
       WITH RECURSIVE walk(done) AS (
         SELECT ARRAY[]::text[]
         UNION ALL
         SELECT walk.done || ready.ids FROM walk
         CROSS JOIN LATERAL (
           SELECT ARRAY(SELECT key FROM jsonb_object_keys(states) key
             WHERE NOT key = ANY(walk.done) AND NOT EXISTS (
               SELECT FROM jsonb_array_elements(graph->'edges') edge
               WHERE edge->>'target' = key AND NOT (edge->>'source') = ANY(walk.done)
             )) AS ids
         ) ready WHERE cardinality(ready.ids) > 0
       )
       SELECT 1 WHERE NOT EXISTS (
         SELECT FROM walk WHERE cardinality(done) = jsonb_array_length(graph->'nodes'))
     ) THEN
    RAISE EXCEPTION 'Invalid pipeline graph';
  END IF;

  INSERT INTO public.pipeline_runs
    (pipeline_id, pipeline_name, status, node_states, context, started_at, triggered_by,
     pipeline_snapshot, pipeline_version, reliable_steps)
  VALUES (p_pipeline, graph->>'name', 'running', states, p_context, clock_timestamp(),
    COALESCE(p_context->>'triggered_by', 'manual'), graph, (graph->>'version')::integer, true)
  RETURNING id INTO run_id;
  PERFORM public.schedule_reliable_pipeline_steps(run_id);
  RETURN run_id;
END;
$$;

CREATE FUNCTION public.reliable_tags_commit_node(p_node jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE(p_node->>'type' IN ('pipeline-commit', 'committer')
    AND p_node #>> '{data,config,targetTable}' = 'unified_tags'
    AND COALESCE(p_node #>> '{data,config,strategy}', 'upsert') = 'upsert'
    AND p_node #>> '{data,config,conflictKey}' = 'slug', false)
$$;

CREATE FUNCTION public.claim_reliable_pipeline_step(p_run uuid, p_node text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  run public.pipeline_runs%ROWTYPE;
  state jsonb;
  token uuid := gen_random_uuid();
  now_at timestamptz;
  deadline timestamptz;
  node jsonb;
BEGIN
  SELECT * INTO run FROM public.pipeline_runs WHERE id = p_run AND reliable_steps FOR UPDATE;
  now_at := clock_timestamp();
  state := run.node_states->p_node;
  IF NOT FOUND OR run.status <> 'running' OR state->>'status' IS DISTINCT FROM 'pending'
     OR (state->>'retry_at')::timestamptz > now_at
     OR NOT public.pipeline_step_ready(run.pipeline_snapshot, run.node_states, p_node) THEN
    RETURN NULL;
  END IF;

  deadline := now_at + make_interval(secs => COALESCE((run.pipeline_snapshot->>'timeout_seconds')::integer, 150) + 60);
  state := state - 'retry_at' || jsonb_build_object(
    'status', 'running', 'attempt', COALESCE((state->>'attempt')::integer, 0) + 1,
    'token', token, 'started_at', now_at, 'wake_at', deadline);
  UPDATE public.pipeline_runs
  SET node_states = jsonb_set(run.node_states, ARRAY[p_node], state),
      step_recovery_at = LEAST(step_recovery_at, deadline)
  WHERE id = p_run;

  SELECT n INTO node FROM jsonb_array_elements(run.pipeline_snapshot->'nodes') n WHERE n->>'id' = p_node;
  RETURN jsonb_build_object('token', token, 'tag_commit', public.reliable_tags_commit_node(node),
    'node_states', jsonb_set(run.node_states, ARRAY[p_node], state));
END;
$$;

CREATE FUNCTION public.finish_reliable_pipeline_step(
  p_run uuid, p_node text, p_token uuid, p_outcome text,
  p_items integer DEFAULT 0, p_error text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  run public.pipeline_runs%ROWTYPE;
  state jsonb;
  node jsonb;
  now_at timestamptz;
  tolerated boolean;
  all_done boolean;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('completed', 'skipped', 'failed', 'uncertain', 'retry', 'expired') THEN
    RAISE EXCEPTION 'Invalid step outcome';
  END IF;
  SELECT * INTO run FROM public.pipeline_runs WHERE id = p_run AND reliable_steps FOR UPDATE;
  now_at := clock_timestamp();
  state := run.node_states->p_node;
  IF NOT FOUND OR run.status <> 'running' OR state->>'status' IS DISTINCT FROM 'running'
     OR p_token IS NULL OR state->>'token' IS DISTINCT FROM p_token::text
     OR (((state->>'wake_at')::timestamptz <= now_at) IS DISTINCT FROM (p_outcome = 'expired')) THEN
    RETURN false;
  END IF;

  SELECT n INTO node FROM jsonb_array_elements(run.pipeline_snapshot->'nodes') n WHERE n->>'id' = p_node;
  IF p_outcome IN ('expired', 'retry') THEN
    IF public.reliable_tags_commit_node(node) AND (state->>'attempt')::integer < 3 THEN
      state := state - 'token' - 'wake_at' - 'deliveries' || jsonb_build_object(
        'status', 'pending', 'error', p_error,
        'retry_at', now_at + make_interval(secs => 30 * (state->>'attempt')::integer));
      UPDATE public.pipeline_runs SET node_states = jsonb_set(run.node_states, ARRAY[p_node], state) WHERE id = p_run;
      PERFORM public.schedule_reliable_pipeline_steps(p_run);
      RETURN true;
    END IF;
    p_error := CASE WHEN public.reliable_tags_commit_node(node)
      THEN 'Retry limit reached: ' ELSE 'Interrupted step requires operator review: ' END
      || COALESCE(p_error, 'lease expired');
    p_outcome := 'uncertain';
  END IF;

  tolerated := p_outcome = 'failed' AND COALESCE(node #>> '{data,config,continue_on_error}' = 'true', false);
  state := state - 'token' - 'wake_at' - 'retry_at' - 'error' || jsonb_build_object(
    'status', CASE WHEN p_outcome = 'uncertain' THEN 'failed' ELSE p_outcome END,
    'completed_at', now_at, 'items_out', p_items, 'tolerated', tolerated,
    'duration_ms', round(extract(epoch FROM (now_at - (state->>'started_at')::timestamptz)) * 1000)::integer);
  IF p_error IS NOT NULL THEN state := state || jsonb_build_object('error', p_error); END IF;
  run.node_states := jsonb_set(run.node_states, ARRAY[p_node], state);

  IF p_outcome IN ('failed', 'uncertain') AND NOT tolerated THEN
    UPDATE public.pipeline_runs SET node_states = run.node_states, status = 'failed',
      completed_at = now_at, error_message = format('Node %s: %s', p_node, p_error), step_recovery_at = NULL
    WHERE id = p_run;
    RETURN true;
  END IF;

  SELECT NOT EXISTS (SELECT FROM jsonb_each(run.node_states)
    WHERE value->>'status' IN ('pending', 'running')) INTO all_done;
  UPDATE public.pipeline_runs SET node_states = run.node_states,
    status = CASE WHEN all_done THEN 'completed' ELSE 'running' END,
    completed_at = CASE WHEN all_done THEN now_at END,
    error_message = (SELECT string_agg(format('%s: %s', key, value->>'error'), ', ' ORDER BY key)
                     FROM jsonb_each(run.node_states) WHERE value->>'tolerated' = 'true'),
    items_processed = COALESCE(items_processed, 0) + p_items,
    items_succeeded = COALESCE(items_succeeded, 0) + p_items,
    step_recovery_at = NULL
  WHERE id = p_run;
  IF NOT all_done THEN PERFORM public.schedule_reliable_pipeline_steps(p_run); END IF;
  RETURN true;
END;
$$;

-- One transaction for the tag, staging checkpoint, audit and DAG handoff.
-- Lock order is run -> staging -> tag. Check the token before any side effects.
CREATE FUNCTION public.commit_reliable_pipeline_tags(
  p_run uuid, p_node text, p_token uuid, p_limit integer, p_dry_run boolean
)
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  run public.pipeline_runs%ROWTYPE;
  state jsonb;
  node jsonb;
  item public.ingestion_staging%ROWTYPE;
  record_data jsonb;
  columns_sql text;
  updates_sql text;
  tag_id uuid;
  committed integer := 0;
BEGIN
  SELECT * INTO run FROM public.pipeline_runs WHERE id = p_run AND reliable_steps FOR UPDATE;
  state := run.node_states->p_node;
  SELECT n INTO node FROM jsonb_array_elements(run.pipeline_snapshot->'nodes') n WHERE n->>'id' = p_node;
  IF NOT public.reliable_tags_commit_node(node) THEN
    RAISE EXCEPTION 'Unknown pilot tag commit step';
  END IF;
  IF state->>'status' = 'completed' THEN RETURN (state->>'items_out')::integer; END IF;
  IF run.status <> 'running' OR state->>'status' IS DISTINCT FROM 'running'
     OR p_token IS NULL OR state->>'token' IS DISTINCT FROM p_token::text
     OR (state->>'wake_at')::timestamptz <= clock_timestamp() THEN
    RETURN NULL;
  END IF;

  FOR item IN SELECT * FROM public.ingestion_staging
    WHERE pipeline_run_id = p_run AND target_table = 'unified_tags'
      AND disposition IN ('pending', 'approved')
      AND dedup_status IN ('unique', 'pending', 'duplicate', 'merge_candidate')
      AND ai_validation_status = 'approved' AND COALESCE(review_status, 'auto') IN ('auto', 'approved')
    ORDER BY created_at, id LIMIT LEAST(GREATEST(p_limit, 1), 500) FOR UPDATE
  LOOP
    IF item.target_record_id IS NOT NULL OR EXISTS (
      SELECT FROM public.ingestion_staging sibling WHERE sibling.id <> item.id
        AND sibling.idempotency_key = item.idempotency_key AND sibling.disposition = 'committed'
    ) THEN
      IF NOT p_dry_run THEN
        UPDATE public.ingestion_staging SET disposition = 'committed', processed_at = now(), updated_at = now()
        WHERE id = item.id;
      END IF;
      CONTINUE;
    END IF;
    IF p_dry_run THEN committed := committed + 1; CONTINUE; END IF;

    BEGIN
      -- Same record shape as the legacy buildRecord fallback. Build the
      -- column list from real tag columns so omitted attributes retain their
      -- database defaults on insert and their previous values on conflict.
      IF item.dedup_match_id IS NOT NULL THEN
        RAISE data_exception USING MESSAGE = 'unsupported matched target';
      END IF;
      record_data := jsonb_strip_nulls(jsonb_build_object(
        'name', NULLIF(item.normalized_data->>'name', ''),
        'description', NULLIF(item.normalized_data->>'description', '')
      )) || COALESCE(NULLIF(item.normalized_data->'metadata', 'null'::jsonb), '{}'::jsonb);
      IF jsonb_typeof(record_data) <> 'object' OR EXISTS (
        SELECT FROM jsonb_object_keys(record_data) key
        WHERE NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'public.unified_tags'::regclass
                           AND attname = key AND attnum > 0 AND NOT attisdropped AND attgenerated = '')
      ) THEN
        RAISE data_exception USING MESSAGE = 'invalid tag metadata columns';
      END IF;
      SELECT string_agg(format('%I', key), ', ' ORDER BY key),
             string_agg(format('%1$I = excluded.%1$I', key), ', ' ORDER BY key)
      INTO columns_sql, updates_sql FROM jsonb_object_keys(record_data) key;
      IF columns_sql IS NULL THEN RAISE data_exception USING MESSAGE = 'empty tag record'; END IF;

      EXECUTE format('INSERT INTO public.unified_tags (%1$s)
        SELECT %1$s FROM jsonb_populate_record(NULL::public.unified_tags, $1)
        ON CONFLICT (slug) DO UPDATE SET %2$s RETURNING id', columns_sql, updates_sql)
      USING record_data INTO tag_id;
    EXCEPTION WHEN data_exception OR integrity_constraint_violation THEN
      UPDATE public.ingestion_staging
      SET disposition = 'rejected', error_message = 'commit: ' || SQLERRM, updated_at = now()
      WHERE id = item.id;
      INSERT INTO public.ingestion_events (staging_id, stage, new_status, actor, payload)
      VALUES (item.id, 'commit', 'rejected', 'pipeline-commit', jsonb_build_object('error', SQLERRM));
      CONTINUE;
    END;

    UPDATE public.ingestion_staging SET disposition = 'committed', target_record_id = tag_id,
      processed_at = now(), updated_at = now() WHERE id = item.id;
    INSERT INTO public.ingestion_events (staging_id, stage, new_status, actor, payload)
    VALUES (item.id, 'commit', 'committed', 'pipeline-commit',
      jsonb_build_object('target_table', 'unified_tags', 'record_id', tag_id));
    committed := committed + 1;
  END LOOP;

  IF NOT public.finish_reliable_pipeline_step(p_run, p_node, p_token, 'completed', committed) THEN
    RAISE EXCEPTION 'Tag commit lost its step claim';
  END IF;
  RETURN committed;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_reliable_pipeline_tags(uuid,text,uuid,integer,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_reliable_pipeline_tags(uuid,text,uuid,integer,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.reap_stuck_pipeline_runs()
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  run record;
  expired record;
  handled integer := public.reap_legacy_pipeline_runs();
BEGIN
  FOR run IN SELECT id, node_states FROM public.pipeline_runs
    WHERE reliable_steps AND status = 'running' AND step_recovery_at <= now()
    ORDER BY step_recovery_at LIMIT 25 FOR UPDATE SKIP LOCKED
  LOOP
    FOR expired IN SELECT key, value FROM jsonb_each(run.node_states)
      WHERE value->>'status' = 'running' AND (value->>'wake_at')::timestamptz <= clock_timestamp()
    LOOP
      PERFORM public.finish_reliable_pipeline_step(run.id, expired.key, (expired.value->>'token')::uuid,
        'expired', 0, 'worker lease expired');
    END LOOP;
    PERFORM public.schedule_reliable_pipeline_steps(run.id);
    handled := handled + 1;
  END LOOP;
  RETURN handled;
END;
$$;

REVOKE ALL ON FUNCTION public.reap_stuck_pipeline_runs(), public.reap_legacy_pipeline_runs(),
  public.pipeline_step_ready(jsonb,jsonb,text), public.schedule_reliable_pipeline_steps(uuid),
  public.start_reliable_tags_pipeline(uuid,jsonb), public.claim_reliable_pipeline_step(uuid,text),
  public.reliable_tags_commit_node(jsonb),
  public.finish_reliable_pipeline_step(uuid,text,uuid,text,integer,text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reap_stuck_pipeline_runs(), public.reap_legacy_pipeline_runs(), public.pipeline_step_ready(jsonb,jsonb,text),
  public.schedule_reliable_pipeline_steps(uuid), public.start_reliable_tags_pipeline(uuid,jsonb),
  public.claim_reliable_pipeline_step(uuid,text), public.reliable_tags_commit_node(jsonb),
  public.finish_reliable_pipeline_step(uuid,text,uuid,text,integer,text) TO service_role;

COMMIT;
