-- ============================================================================
-- Repair the three classes of scheduled-job failure left on production
-- (79 failed cron runs in 24h across 11 jobs, 2026-07-27).
--
-- 1. pgmq metrics after the extension was collaterally dropped  (46 fails/day)
-- 2. recount_all_tag_usage() ambiguous overload                  (1 fail/day)
-- 3. human_reviewed guard blocking derived-column recomputes     (3 fails/day)
-- ============================================================================


-- 1. pgmq metrics without the pgmq extension ---------------------------------
-- The P3b queue drop (20260801032000) used `DROP TABLE pgmq.q_* CASCADE` as a
-- fallback because pgmq.drop_queue() errors on this project's detached queue
-- tables. That CASCADE took the extension with it: pg_extension has no pgmq
-- row, every pgmq.* function is gone, and pgmq.meta plus the per-queue msg_id
-- sequences no longer exist. The three queues P3b deliberately KEPT
-- (dead_letter, enrichment_queue, pipeline_steps) still hold live rows —
-- q_dead_letter alone has 183 — but every public.pgmq_* wrapper now raises
-- "function pgmq.metrics(text) does not exist".
--
-- The blast radius is bigger than the wrappers: check_pipeline_health() reads
-- the DLQ depth in its FIRST statement, so the whole function aborted and
-- pipeline failure alerting has been silently dead — the consecutive-failure
-- detection and auto-resolve below it never ran at all. The admin Health tab
-- (HealthTab.tsx) and the workflow-dispatcher DLQ probe fail the same way.
--
-- Read the queue tables directly. Identical signatures, no extension
-- dependency, and resilient if a queue table is retired later. total_messages
-- was the msg_id sequence's last_value (total ever enqueued); with the
-- sequences gone, live + archived rows is the faithful stand-in.

CREATE OR REPLACE FUNCTION public.pgmq_metrics(p_queue text)
RETURNS TABLE(queue_name text, queue_length bigint, newest_msg_age_sec integer,
              oldest_msg_age_sec integer, total_messages bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF p_queue NOT IN ('dead_letter','enrichment_queue','pipeline_steps') THEN
    RAISE EXCEPTION 'Invalid queue name: % (workflow queues were retired in P3)', p_queue;
  END IF;

  RETURN QUERY EXECUTE format($q$
    SELECT %L::text,
           count(*)::bigint,
           COALESCE(EXTRACT(EPOCH FROM now() - max(enqueued_at))::int, 0),
           COALESCE(EXTRACT(EPOCH FROM now() - min(enqueued_at))::int, 0),
           ((SELECT count(*) FROM pgmq.%I) + count(*))::bigint
      FROM pgmq.%I
  $q$, p_queue, 'a_' || p_queue, 'q_' || p_queue);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pgmq_metrics_all()
RETURNS TABLE(queue_name text, queue_length bigint, newest_msg_age_sec integer,
              oldest_msg_age_sec integer, total_messages bigint,
              scrape_time timestamp with time zone, queue_visible_length bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_q text;
BEGIN
  FOREACH v_q IN ARRAY ARRAY['dead_letter','enrichment_queue','pipeline_steps']
  LOOP
    -- Skip cleanly rather than raising if a queue is retired in a later pass.
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'pgmq' AND table_name = 'q_' || v_q) THEN
      RETURN QUERY EXECUTE format($q$
        SELECT %L::text,
               count(*)::bigint,
               COALESCE(EXTRACT(EPOCH FROM now() - max(enqueued_at))::int, 0),
               COALESCE(EXTRACT(EPOCH FROM now() - min(enqueued_at))::int, 0),
               ((SELECT count(*) FROM pgmq.%I) + count(*))::bigint,
               now(),
               count(*) FILTER (WHERE vt <= now())::bigint
          FROM pgmq.%I
      $q$, v_q, 'a_' || v_q, 'q_' || v_q);
    END IF;
  END LOOP;
END;
$function$;


-- 2. recount_all_tag_usage() ambiguity ---------------------------------------
-- Two overloads coexist: the legacy unbatched recount_all_tag_usage() and the
-- newer recount_all_tag_usage(p_batch integer DEFAULT 500). Because the newer
-- one defaults its only argument, the cron's `SELECT recount_all_tag_usage();`
-- matches BOTH and fails with 42725 "function is not unique" every night.
-- Drop the legacy unbatched one: batching is this project's standing
-- discipline for tag writes (search_documents reindex trigger storm), so the
-- defaulted call resolving to the batched body is the intended behaviour.

DROP FUNCTION IF EXISTS public.recount_all_tag_usage();


-- 3. human_reviewed guard vs. derived-column recomputes -----------------------
-- log_unified_tag_change() raises whenever a `system:%` actor updates a
-- human_reviewed tag AT ALL. The guard exists to stop automated enrichment
-- from overwriting human curation — but three scheduled jobs only recompute
-- DERIVED bookkeeping (tag_quality_recompute writes quality_score /
-- quality_breakdown / last_quality_at; tag_assignment_reconcile and
-- personality-auto-tag write usage_count), and each dies on the first
-- human_reviewed tag it reaches.
--
-- recount_all_tag_usage already works around this by spoofing
-- `app.actor = 'recount:usage-sync'` — a bypass that defeats the audit trail
-- and only works because someone remembered it. Make the guard column-aware
-- instead: automation may touch the derived set and nothing else, so every
-- curated column (name, slug, description, category, sensitivity, image,
-- i18n, verification, merge target …) stays protected exactly as before, and
-- the audit row is still written with the true actor.

CREATE OR REPLACE FUNCTION public.log_unified_tag_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_actor TEXT := COALESCE(current_setting('app.actor', true), 'system:trigger');
  -- Recomputed by scheduled jobs, never human-curated.
  v_derived CONSTANT text[] := ARRAY[
    'usage_count', 'updated_at', 'quality_score', 'quality_breakdown', 'last_quality_at'
  ];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.human_reviewed = TRUE
       AND v_actor LIKE 'system:%'
       AND (to_jsonb(NEW) - v_derived) IS DISTINCT FROM (to_jsonb(OLD) - v_derived) THEN
      RAISE EXCEPTION 'human_reviewed tag % cannot be modified by %', OLD.id, v_actor;
    END IF;
    INSERT INTO tag_change_log(tag_id, action_type, before_data, after_data, actor)
      VALUES (OLD.id, 'update', to_jsonb(OLD), to_jsonb(NEW), v_actor);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO tag_change_log(tag_id, action_type, before_data, actor)
      VALUES (OLD.id, 'delete', to_jsonb(OLD), v_actor);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO tag_change_log(tag_id, action_type, after_data, actor)
      VALUES (NEW.id, 'create', to_jsonb(NEW), v_actor);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;
