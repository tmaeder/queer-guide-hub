BEGIN;

-- A wake is an acceleration hint. The step already has a durable pgmq
-- message, so a lost reservation or HTTP request needs no extra recovery.
CREATE FUNCTION public.reserve_reliable_pipeline_wakes(p_run uuid)
RETURNS text[] LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  run public.pipeline_runs%ROWTYPE;
  reserved_at timestamptz;
  slots integer;
  step_id text;
  ready_ids text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO run FROM public.pipeline_runs
  WHERE id = p_run AND reliable_steps AND status = 'running'
    AND context @> '{"fast_step_wake":true}'::jsonb
  FOR UPDATE;
  IF NOT FOUND THEN RETURN ready_ids; END IF;

  reserved_at := clock_timestamp();
  -- Bound both fan-out and the total number of HTTP calls in a run.
  SELECT greatest(least(
    8 - count(*) FILTER (WHERE value ? 'fast_wake_at'),
    2 - count(*) FILTER (WHERE value->>'status' = 'running'
      OR (value->>'status' = 'pending' AND value ? 'fast_wake_at' AND NOT value ? 'retry_at'))
  ), 0)::integer INTO slots
  FROM jsonb_each(run.node_states);
  IF slots = 0 THEN RETURN ready_ids; END IF;

  FOR step_id IN
    SELECT key FROM jsonb_each(run.node_states)
    WHERE value->>'status' = 'pending'
      AND value ? 'wake_at'
      AND NOT (value ? 'fast_wake_at' OR value ? 'retry_at')
    ORDER BY (value->>'wake_at')::timestamptz, key
    LIMIT slots
  LOOP
    run.node_states := jsonb_set(run.node_states, ARRAY[step_id, 'fast_wake_at'], to_jsonb(reserved_at));
    ready_ids := array_append(ready_ids, step_id);
  END LOOP;

  IF cardinality(ready_ids) > 0 THEN
    UPDATE public.pipeline_runs SET node_states = run.node_states WHERE id = p_run;
  END IF;
  RETURN ready_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_reliable_pipeline_wakes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_reliable_pipeline_wakes(uuid) TO service_role;

COMMIT;
