-- ============================================================
-- Security Fix: pgmq Wrapper Functions
-- - Add queue name allowlist validation
-- - Fix search_path (remove 'public', use empty + fully qualified)
-- - REVOKE EXECUTE from anon/authenticated/public
-- - Restrict workflow_runs/workflow_definitions SELECT to admin
-- ============================================================

-- 1. Recreate all pgmq wrappers with queue allowlist + fixed search_path

CREATE OR REPLACE FUNCTION public.pgmq_send(p_queue TEXT, p_msg JSONB, p_delay INT DEFAULT 0)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_queue NOT IN ('scheduled_jobs', 'import_jobs', 'content_processing', 'dead_letter') THEN
    RAISE EXCEPTION 'Invalid queue name: %', p_queue;
  END IF;
  RETURN pgmq.send(p_queue, p_msg, p_delay);
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_send_batch(p_queue TEXT, p_msgs JSONB[], p_delay INT DEFAULT 0)
RETURNS SETOF BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_queue NOT IN ('scheduled_jobs', 'import_jobs', 'content_processing', 'dead_letter') THEN
    RAISE EXCEPTION 'Invalid queue name: %', p_queue;
  END IF;
  RETURN QUERY SELECT * FROM pgmq.send_batch(p_queue, p_msgs, p_delay);
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_read(p_queue TEXT, p_vt INT, p_qty INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, enqueued_at TIMESTAMPTZ, vt TIMESTAMPTZ, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_queue NOT IN ('scheduled_jobs', 'import_jobs', 'content_processing', 'dead_letter') THEN
    RAISE EXCEPTION 'Invalid queue name: %', p_queue;
  END IF;
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.enqueued_at, r.vt, r.message
    FROM pgmq.read(p_queue, p_vt, p_qty) r;
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_archive(p_queue TEXT, p_msg_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_queue NOT IN ('scheduled_jobs', 'import_jobs', 'content_processing', 'dead_letter') THEN
    RAISE EXCEPTION 'Invalid queue name: %', p_queue;
  END IF;
  RETURN pgmq.archive(p_queue, p_msg_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_delete(p_queue TEXT, p_msg_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_queue NOT IN ('scheduled_jobs', 'import_jobs', 'content_processing', 'dead_letter') THEN
    RAISE EXCEPTION 'Invalid queue name: %', p_queue;
  END IF;
  RETURN pgmq.delete(p_queue, p_msg_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_set_vt(p_queue TEXT, p_msg_id BIGINT, vt_seconds INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, enqueued_at TIMESTAMPTZ, vt TIMESTAMPTZ, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_queue NOT IN ('scheduled_jobs', 'import_jobs', 'content_processing', 'dead_letter') THEN
    RAISE EXCEPTION 'Invalid queue name: %', p_queue;
  END IF;
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.enqueued_at, r.vt, r.message
    FROM pgmq.set_vt(p_queue, p_msg_id, vt_seconds) r;
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_metrics(p_queue TEXT)
RETURNS TABLE(queue_name TEXT, queue_length BIGINT, newest_msg_age_sec INT, oldest_msg_age_sec INT, total_messages BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_queue NOT IN ('scheduled_jobs', 'import_jobs', 'content_processing', 'dead_letter') THEN
    RAISE EXCEPTION 'Invalid queue name: %', p_queue;
  END IF;
  RETURN QUERY SELECT r.queue_name, r.queue_length, r.newest_msg_age_sec, r.oldest_msg_age_sec, r.total_messages
    FROM pgmq.metrics(p_queue) r;
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_metrics_all()
RETURNS TABLE(queue_name TEXT, queue_length BIGINT, newest_msg_age_sec INT, oldest_msg_age_sec INT, total_messages BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY SELECT r.queue_name, r.queue_length, r.newest_msg_age_sec, r.oldest_msg_age_sec, r.total_messages
    FROM pgmq.metrics_all() r;
END;
$$;

-- 2. REVOKE EXECUTE from anon, authenticated, public on all pgmq wrappers
REVOKE EXECUTE ON FUNCTION public.pgmq_send(TEXT, JSONB, INT) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.pgmq_send_batch(TEXT, JSONB[], INT) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.pgmq_read(TEXT, INT, INT) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.pgmq_archive(TEXT, BIGINT) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.pgmq_delete(TEXT, BIGINT) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.pgmq_set_vt(TEXT, BIGINT, INT) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.pgmq_metrics(TEXT) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.pgmq_metrics_all() FROM anon, authenticated, public;

-- Grant only to service_role (edge functions use service_role key)
GRANT EXECUTE ON FUNCTION public.pgmq_send(TEXT, JSONB, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pgmq_send_batch(TEXT, JSONB[], INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pgmq_read(TEXT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pgmq_archive(TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pgmq_delete(TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pgmq_set_vt(TEXT, BIGINT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pgmq_metrics(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pgmq_metrics_all() TO service_role;

-- 3. Restrict workflow_definitions and workflow_runs SELECT to admin only
DROP POLICY IF EXISTS "workflow_definitions_select" ON public.workflow_definitions;
CREATE POLICY "workflow_definitions_select"
  ON public.workflow_definitions FOR SELECT
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "workflow_runs_select" ON public.workflow_runs;
CREATE POLICY "workflow_runs_select"
  ON public.workflow_runs FOR SELECT
  USING (has_role((SELECT auth.uid()), 'admin'::app_role));
