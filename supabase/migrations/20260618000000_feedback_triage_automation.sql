-- ============================================================================
-- Feedback triage automation (Phase 1)
-- ----------------------------------------------------------------------------
-- The admin feedback board is over-built on the (dead) Claude auto-fix loop and
-- under-built on triage: ~776 open items, 434 of them 30-90d stale, 693 api_errors
-- untriaged, 141 duplicate suggestions unreviewed. The substrate (embeddings,
-- detect_feedback_duplicates, stories) exists — we just don't ACT on it.
--
-- This migration adds three self-maintaining, reversible, audited automations,
-- plus the column + trigger that let new submissions arrive pre-triaged:
--   1a. autotriage column + INSERT trigger -> feedback-autotriage edge fn
--   1b. auto_apply_feedback_duplicates  (auto-merge >=0.9 dup pairs)
--   1c. gc_stale_api_errors             (auto-close stale single-occurrence errors)
--   1d. flag_stale_feedback             (label aging human feedback; never auto-close)
-- Each run_*() wrapper logs to admin_automation_runs and is registered in
-- admin_automations (data-driven dispatch — no dispatcher edit needed).
-- ============================================================================

-- ── 1a. Autotriage output column ───────────────────────────────────
-- Top-level jsonb (NOT inside data) so writing it does not trip the
-- AFTER UPDATE OF data embed trigger (no re-embed storm on backfill).
ALTER TABLE public.community_submissions
  ADD COLUMN IF NOT EXISTS autotriage jsonb;

COMMENT ON COLUMN public.community_submissions.autotriage IS
  'LLM triage suggestion {category,category_confidence,summary,suggested_priority,suggested_labels,is_probably_spam,model,at}. priority/labels are also written directly so sorting works; this block backs the accept/override chip.';

-- INSERT-only trigger: fan out new feedback/api_error rows to feedback-autotriage.
-- INSERT-only (not UPDATE) so the function's own priority/labels/autotriage write
-- cannot loop. Carries the vault internal secret (the fn self-gates with
-- requireInternalOrAdmin; anon-only would 401, matching the secured-cron pattern).
CREATE OR REPLACE FUNCTION public.notify_feedback_autotriage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.content_type NOT IN ('feedback','api_error') THEN
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/feedback-autotriage',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := jsonb_build_object('submission_ids', ARRAY[NEW.id::text])
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_feedback_autotriage ON public.community_submissions;
CREATE TRIGGER trg_notify_feedback_autotriage
  AFTER INSERT ON public.community_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_feedback_autotriage();

-- ── 1b. Auto-merge high-confidence duplicates ──────────────────────
-- detect_feedback_duplicates already populates feedback_duplicate_suggestions
-- (canonical a_id < b_id, similarity). For undismissed pairs >= threshold, mark
-- the NEWER row a duplicate of the OLDER (survivor), close it, bump the survivor's
-- occurrence_count, and dismiss the suggestion. Reversible: clear duplicate_of +
-- reopen. Sub-threshold pairs stay in the review queue.
CREATE OR REPLACE FUNCTION public.auto_apply_feedback_duplicates(
  p_threshold real DEFAULT 0.9
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_examined int := 0;
  v_merged   int := 0;
  v_dismissed int := 0;
  r RECORD;
  v_survivor uuid;
  v_dup uuid;
  v_dup_occ int;
BEGIN
  FOR r IN
    SELECT s.id AS sug_id, s.a_id, s.b_id,
           a.submitted_at AS a_at, b.submitted_at AS b_at,
           a.duplicate_of AS a_dupof, b.duplicate_of AS b_dupof,
           a.feedback_status AS a_status, b.feedback_status AS b_status,
           coalesce(b.occurrence_count,1) AS b_occ, coalesce(a.occurrence_count,1) AS a_occ
    FROM public.feedback_duplicate_suggestions s
    JOIN public.community_submissions a ON a.id = s.a_id
    JOIN public.community_submissions b ON b.id = s.b_id
    WHERE s.dismissed = false
      AND s.similarity >= p_threshold
      AND a.content_type = 'feedback' AND b.content_type = 'feedback'
      AND coalesce(a.is_spam,false) = false AND coalesce(b.is_spam,false) = false
    ORDER BY s.similarity DESC
    LIMIT 300
  LOOP
    v_examined := v_examined + 1;

    -- Either side already a duplicate => the pair is moot. Dismiss the stale
    -- suggestion (don't merge — avoid chains) so it stops polluting the queue.
    IF r.a_dupof IS NOT NULL OR r.b_dupof IS NOT NULL THEN
      UPDATE public.feedback_duplicate_suggestions
        SET dismissed = true, dismissed_at = now() WHERE id = r.sug_id;
      v_dismissed := v_dismissed + 1;
      CONTINUE;
    END IF;

    -- Survivor = earlier submitted_at; duplicate = later.
    IF r.a_at <= r.b_at THEN
      v_survivor := r.a_id; v_dup := r.b_id; v_dup_occ := r.b_occ;
    ELSE
      v_survivor := r.b_id; v_dup := r.a_id; v_dup_occ := r.a_occ;
    END IF;

    -- Don't re-close an already-done duplicate.
    IF (v_dup = r.a_id AND r.a_status = 'done') OR (v_dup = r.b_id AND r.b_status = 'done') THEN
      UPDATE public.feedback_duplicate_suggestions
        SET dismissed = true, dismissed_at = now() WHERE id = r.sug_id;
      CONTINUE;
    END IF;

    UPDATE public.community_submissions
      SET duplicate_of = v_survivor,
          resolution = 'duplicate',
          feedback_status = 'done',
          resolved_at = now(),
          reviewer_notes = left(
            coalesce(reviewer_notes,'') ||
            CASE WHEN coalesce(reviewer_notes,'') = '' THEN '' ELSE E'\n' END ||
            'auto-merged: duplicate (sim ' || round(p_threshold::numeric,2) || '+)', 2000)
      WHERE id = v_dup;

    UPDATE public.community_submissions
      SET occurrence_count = coalesce(occurrence_count,1) + v_dup_occ
      WHERE id = v_survivor;

    UPDATE public.feedback_duplicate_suggestions
      SET dismissed = true, dismissed_at = now() WHERE id = r.sug_id;

    INSERT INTO public.community_submissions_audit (submission_id, actor_id, field, old_value, new_value)
    VALUES (v_dup, NULL, 'duplicate_of', 'null'::jsonb, to_jsonb(v_survivor));

    v_merged := v_merged + 1;
  END LOOP;

  RETURN jsonb_build_object('examined', v_examined, 'merged', v_merged,
    'dismissed_stale', v_dismissed, 'threshold', p_threshold);
END;
$$;

-- ── 1c. Stale api_error garbage collection ─────────────────────────
-- Single-/low-occurrence api_errors that have been 'new' and untouched for >age
-- days are almost always transient and already gone. Auto-close them as invalid;
-- recurrent/recent errors stay for humans. Batched (search/embed triggers).
CREATE OR REPLACE FUNCTION public.gc_stale_api_errors(
  p_age_days int DEFAULT 30,
  p_max_occurrence int DEFAULT 2
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_threshold timestamptz := now() - make_interval(days => p_age_days);
  v_examined int := 0;
  v_changed int := 0;
  v_batch int;
BEGIN
  SELECT count(*) INTO v_examined
  FROM public.community_submissions
  WHERE content_type = 'api_error' AND feedback_status = 'new'
    AND submitted_at < v_threshold AND coalesce(occurrence_count,1) <= p_max_occurrence;

  LOOP
    WITH upd AS (
      UPDATE public.community_submissions
      SET feedback_status = 'done', resolution = 'invalid', resolved_at = now(),
          reviewer_notes = left(
            coalesce(reviewer_notes,'') ||
            CASE WHEN coalesce(reviewer_notes,'') = '' THEN '' ELSE E'\n' END ||
            'auto-closed: stale single-occurrence error (>'|| p_age_days ||'d)', 2000)
      WHERE id IN (
        SELECT id FROM public.community_submissions
        WHERE content_type = 'api_error' AND feedback_status = 'new'
          AND submitted_at < v_threshold AND coalesce(occurrence_count,1) <= p_max_occurrence
        LIMIT 300
      )
      RETURNING 1
    )
    SELECT count(*) INTO v_batch FROM upd;
    v_changed := v_changed + v_batch;
    EXIT WHEN v_batch = 0;
  END LOOP;

  RETURN jsonb_build_object('examined', v_examined, 'closed', v_changed,
    'age_days', p_age_days, 'max_occurrence', p_max_occurrence);
END;
$$;

-- ── 1d. Flag stale human feedback (no auto-close) ──────────────────
-- Open human-feedback items older than age get a 'stale' label so the Phase 2
-- needs-attention queue can surface them. Human feedback is never auto-closed.
CREATE OR REPLACE FUNCTION public.flag_stale_feedback(
  p_age_days int DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_threshold timestamptz := now() - make_interval(days => p_age_days);
  v_examined int := 0;
  v_changed int := 0;
  v_batch int;
BEGIN
  SELECT count(*) INTO v_examined
  FROM public.community_submissions
  WHERE content_type = 'feedback' AND feedback_status <> 'done'
    AND coalesce(is_spam,false) = false AND submitted_at < v_threshold
    AND NOT ('stale' = ANY(coalesce(labels, ARRAY[]::text[])));

  LOOP
    WITH upd AS (
      UPDATE public.community_submissions
      SET labels = (
        SELECT array_agg(DISTINCT l)
        FROM unnest(coalesce(labels, ARRAY[]::text[]) || ARRAY['stale']) AS l
      )
      WHERE id IN (
        SELECT id FROM public.community_submissions
        WHERE content_type = 'feedback' AND feedback_status <> 'done'
          AND coalesce(is_spam,false) = false AND submitted_at < v_threshold
          AND NOT ('stale' = ANY(coalesce(labels, ARRAY[]::text[])))
        LIMIT 300
      )
      RETURNING 1
    )
    SELECT count(*) INTO v_batch FROM upd;
    v_changed := v_changed + v_batch;
    EXIT WHEN v_batch = 0;
  END LOOP;

  RETURN jsonb_build_object('examined', v_examined, 'flagged', v_changed, 'age_days', p_age_days);
END;
$$;

-- ── run_*() wrappers with admin_automation_runs audit ──────────────
CREATE OR REPLACE FUNCTION public.run_feedback_auto_dedup()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid; v_run bigint; v_enabled boolean; v_started timestamptz := now(); v_res jsonb;
BEGIN
  SELECT id, enabled INTO v_id, v_enabled FROM public.admin_automations WHERE slug = 'feedback_auto_dedup';
  INSERT INTO public.admin_automation_runs (automation_id, automation_slug, started_at, status)
    VALUES (v_id, 'feedback_auto_dedup', v_started, 'success') RETURNING id INTO v_run;
  IF NOT coalesce(v_enabled,true) THEN
    UPDATE public.admin_automation_runs SET finished_at=now(), summary=jsonb_build_object('skipped',true) WHERE id=v_run;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='paused' WHERE id=v_id;
    RETURN jsonb_build_object('skipped',true);
  END IF;
  v_res := public.auto_apply_feedback_duplicates(0.9);
  UPDATE public.admin_automation_runs SET finished_at=now(),
    items_examined=(v_res->>'examined')::int, items_changed=(v_res->>'merged')::int, summary=v_res WHERE id=v_run;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_id;
  RETURN v_res;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='error' WHERE id=v_id;
  RAISE;
END; $$;

CREATE OR REPLACE FUNCTION public.run_feedback_stale_error_gc()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid; v_run bigint; v_enabled boolean; v_started timestamptz := now(); v_res jsonb;
BEGIN
  SELECT id, enabled INTO v_id, v_enabled FROM public.admin_automations WHERE slug = 'feedback_stale_error_gc';
  INSERT INTO public.admin_automation_runs (automation_id, automation_slug, started_at, status)
    VALUES (v_id, 'feedback_stale_error_gc', v_started, 'success') RETURNING id INTO v_run;
  IF NOT coalesce(v_enabled,true) THEN
    UPDATE public.admin_automation_runs SET finished_at=now(), summary=jsonb_build_object('skipped',true) WHERE id=v_run;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='paused' WHERE id=v_id;
    RETURN jsonb_build_object('skipped',true);
  END IF;
  v_res := public.gc_stale_api_errors(30, 2);
  UPDATE public.admin_automation_runs SET finished_at=now(),
    items_examined=(v_res->>'examined')::int, items_changed=(v_res->>'closed')::int, summary=v_res WHERE id=v_run;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_id;
  RETURN v_res;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='error' WHERE id=v_id;
  RAISE;
END; $$;

CREATE OR REPLACE FUNCTION public.run_feedback_stale_flag()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid; v_run bigint; v_enabled boolean; v_started timestamptz := now(); v_res jsonb;
BEGIN
  SELECT id, enabled INTO v_id, v_enabled FROM public.admin_automations WHERE slug = 'feedback_stale_flag';
  INSERT INTO public.admin_automation_runs (automation_id, automation_slug, started_at, status)
    VALUES (v_id, 'feedback_stale_flag', v_started, 'success') RETURNING id INTO v_run;
  IF NOT coalesce(v_enabled,true) THEN
    UPDATE public.admin_automation_runs SET finished_at=now(), summary=jsonb_build_object('skipped',true) WHERE id=v_run;
    UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='paused' WHERE id=v_id;
    RETURN jsonb_build_object('skipped',true);
  END IF;
  v_res := public.flag_stale_feedback(30);
  UPDATE public.admin_automation_runs SET finished_at=now(),
    items_examined=(v_res->>'examined')::int, items_changed=(v_res->>'flagged')::int, summary=v_res WHERE id=v_run;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='success' WHERE id=v_id;
  RETURN v_res;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run;
  UPDATE public.admin_automations SET last_run_at=v_started, last_run_status='error' WHERE id=v_id;
  RAISE;
END; $$;

-- ── Ownership + grants (match run_ingestion_events_purge) ───────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'auto_apply_feedback_duplicates(real)',
    'gc_stale_api_errors(int,int)',
    'flag_stale_feedback(int)',
    'run_feedback_auto_dedup()',
    'run_feedback_stale_error_gc()',
    'run_feedback_stale_flag()'
  ] LOOP
    EXECUTE format('ALTER FUNCTION public.%s OWNER TO postgres', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;

-- ── Register automations (data-driven dispatch reads action.fn) ────
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('feedback_auto_dedup', 'Auto-merge duplicate feedback',
   'Merge undismissed feedback_duplicate_suggestions with similarity >= 0.9: newer item becomes a duplicate of the older, closed as resolution=duplicate. Reversible.',
   'system', true, '{"type":"schedule"}'::jsonb,
   '[{"field":"similarity","op":"gte","value":0.9},{"field":"dismissed","op":"eq","value":false}]'::jsonb,
   '{"type":"rpc","fn":"run_feedback_auto_dedup"}'::jsonb, '30 3 * * *'),
  ('feedback_stale_error_gc', 'Close stale api errors',
   'Close api_error items still new after 30d with occurrence_count <= 2 (resolution=invalid). Recurrent/recent errors untouched.',
   'system', true, '{"type":"schedule"}'::jsonb,
   '[{"field":"content_type","op":"eq","value":"api_error"},{"field":"feedback_status","op":"eq","value":"new"},{"field":"submitted_at","op":"lt","value":"now() - interval ''30 days''"}]'::jsonb,
   '{"type":"rpc","fn":"run_feedback_stale_error_gc"}'::jsonb, '40 4 * * *'),
  ('feedback_stale_flag', 'Flag stale feedback',
   'Add a stale label to open human-feedback items older than 30d so the needs-attention queue surfaces them. Never auto-closes human feedback.',
   'system', true, '{"type":"schedule"}'::jsonb,
   '[{"field":"content_type","op":"eq","value":"feedback"},{"field":"feedback_status","op":"neq","value":"done"},{"field":"submitted_at","op":"lt","value":"now() - interval ''30 days''"}]'::jsonb,
   '{"type":"rpc","fn":"run_feedback_stale_flag"}'::jsonb, '50 4 * * *')
ON CONFLICT (slug) DO UPDATE
SET name=EXCLUDED.name, description=EXCLUDED.description, trigger=EXCLUDED.trigger,
    conditions=EXCLUDED.conditions, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

-- ── Schedule crons (off-hour, after detect-feedback-duplicates @03:17) ──
DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY['feedback_auto_dedup','feedback_stale_error_gc','feedback_stale_flag'] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

SELECT cron.schedule('feedback_auto_dedup',     '30 3 * * *', 'SELECT public.run_feedback_auto_dedup();');
SELECT cron.schedule('feedback_stale_error_gc', '40 4 * * *', 'SELECT public.run_feedback_stale_error_gc();');
SELECT cron.schedule('feedback_stale_flag',     '50 4 * * *', 'SELECT public.run_feedback_stale_flag();');
