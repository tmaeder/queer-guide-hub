-- ============================================================================
-- Content-processing simplification P3b — retire the workflow pgmq queues
-- ----------------------------------------------------------------------------
-- Applied AFTER the direct-invoke enqueue_workflow (P3a) is live and the
-- slimmed workflow-dispatcher (pipeline_steps pump only) is deployed, with the
-- scheduled_jobs / import_jobs / content_processing queues confirmed empty.
-- The pgmq wrapper allowlists are trimmed (bodies otherwise identical to the
-- baseline definitions) so stray callers fail loudly rather than enqueueing
-- into a queue nothing drains. pgmq_metrics_all (used by the admin Health tab)
-- has no allowlist and simply stops listing the dropped queues.
-- ============================================================================

DO $$
DECLARE
  v_q text;
BEGIN
  FOREACH v_q IN ARRAY ARRAY['scheduled_jobs', 'import_jobs', 'content_processing']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'pgmq' AND table_name = 'q_' || v_q
    ) THEN
      PERFORM pgmq.drop_queue(v_q);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION "public"."pgmq_send"("p_queue" "text", "p_msg" "jsonb", "p_delay" integer DEFAULT 0) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF p_queue NOT IN ('dead_letter','enrichment_queue','pipeline_steps') THEN
    RAISE EXCEPTION 'Invalid queue name: % (workflow queues were retired in P3)', p_queue;
  END IF;
  RETURN pgmq.send(p_queue, p_msg, p_delay);
END; $$;

CREATE OR REPLACE FUNCTION "public"."pgmq_send_batch"("p_queue" "text", "p_msgs" "jsonb"[], "p_delay" integer DEFAULT 0) RETURNS SETOF bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF p_queue NOT IN ('dead_letter','enrichment_queue','pipeline_steps') THEN
    RAISE EXCEPTION 'Invalid queue name: % (workflow queues were retired in P3)', p_queue;
  END IF;
  RETURN QUERY SELECT * FROM pgmq.send_batch(p_queue, p_msgs, p_delay);
END; $$;

CREATE OR REPLACE FUNCTION "public"."pgmq_read"("p_queue" "text", "p_vt" integer, "p_qty" integer) RETURNS TABLE("msg_id" bigint, "read_ct" integer, "enqueued_at" timestamp with time zone, "vt" timestamp with time zone, "message" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF p_queue NOT IN ('dead_letter','enrichment_queue','pipeline_steps') THEN
    RAISE EXCEPTION 'Invalid queue name: % (workflow queues were retired in P3)', p_queue;
  END IF;
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.enqueued_at, r.vt, r.message FROM pgmq.read(p_queue, p_vt, p_qty) r;
END; $$;

CREATE OR REPLACE FUNCTION "public"."pgmq_archive"("p_queue" "text", "p_msg_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF p_queue NOT IN ('dead_letter','enrichment_queue','pipeline_steps') THEN
    RAISE EXCEPTION 'Invalid queue name: % (workflow queues were retired in P3)', p_queue;
  END IF;
  RETURN pgmq.archive(p_queue, p_msg_id);
END; $$;

CREATE OR REPLACE FUNCTION "public"."pgmq_delete"("p_queue" "text", "p_msg_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF p_queue NOT IN ('dead_letter','enrichment_queue','pipeline_steps') THEN
    RAISE EXCEPTION 'Invalid queue name: % (workflow queues were retired in P3)', p_queue;
  END IF;
  RETURN pgmq.delete(p_queue, p_msg_id);
END; $$;

CREATE OR REPLACE FUNCTION "public"."pgmq_metrics"("p_queue" "text") RETURNS TABLE("queue_name" "text", "queue_length" bigint, "newest_msg_age_sec" integer, "oldest_msg_age_sec" integer, "total_messages" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF p_queue NOT IN ('dead_letter','enrichment_queue','pipeline_steps') THEN
    RAISE EXCEPTION 'Invalid queue name: % (workflow queues were retired in P3)', p_queue;
  END IF;
  RETURN QUERY SELECT m.queue_name, m.queue_length, m.newest_msg_age_sec, m.oldest_msg_age_sec, m.total_messages FROM pgmq.metrics(p_queue) m;
END; $$;
