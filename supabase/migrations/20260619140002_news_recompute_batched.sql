-- News truth-loop recompute: batched + timeout-safe.
--
-- Root cause (cron.job_run_details, every night since 2026-06-07): both
-- run_news_quality_recompute() and run_news_trust_recompute() did ONE giant
-- UPDATE over all ~18.8k live rows. Every row update fires search_documents_sync()
-- -> search_documents_index_news(new.id), so a single statement performed ~18.8k
-- index upserts and hit the 2-min statement_timeout -> full rollback. The data
-- never converged: trust_score=0 for every row, quality_score NULL for ~6k rows.
--
-- Fix: keyset-batch the work (500 rows/batch) and keep the IS DISTINCT FROM guard
-- so steady-state nightly runs only touch (and only reindex) changed rows. The
-- one giant statement is gone, but statement_timeout is armed once per top-level
-- statement and SET LOCAL inside a function does NOT re-arm the already-running
-- call, so the durable protection is a `SET statement_timeout = 0;` prepended to
-- the pg_cron command (a separate prior statement DOES re-arm the next one). The
-- cron.alter_job calls at the bottom apply that. SET LOCAL is kept in-function as
-- defence-in-depth for any future direct caller that sets it first.
--
-- Both functions are chunk-drivable for the one-time backfill:
--   p_full        true  -> scan ALL live rows (initial convergence)
--                 false -> nightly light scope (never-scored / recently-changed)
--   p_after       keyset cursor (process ids strictly greater than this)
--   p_max_batches >0 -> stop after N batches and return {done,last_id} so a client
--                       can drive the backfill in bounded calls; 0 -> drain fully
--                       (used by pg_cron). admin_automation bookkeeping only runs
--                       on full cron drains (p_max_batches=0).

-- Drop the old zero-arg versions first: adding default params would otherwise
-- create overloads, and the pg_cron `SELECT run_news_*_recompute();` calls would
-- keep resolving to the old (broken) zero-arg functions. After the drop the
-- no-arg cron call resolves to the new all-defaults signature.
DROP FUNCTION IF EXISTS public.run_news_quality_recompute();
DROP FUNCTION IF EXISTS public.run_news_trust_recompute();

CREATE OR REPLACE FUNCTION public.run_news_quality_recompute(
  p_full boolean DEFAULT false,
  p_after uuid DEFAULT NULL,
  p_max_batches integer DEFAULT 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started_at timestamptz := now();
  v_changed int := 0; v_examined int := 0; v_batch_changed int := 0;
  v_batches int := 0; v_book boolean := (p_max_batches = 0);
  v_last uuid := coalesce(p_after, '00000000-0000-0000-0000-000000000000'::uuid);
  v_ids uuid[]; v_n int; v_done boolean := false;
BEGIN
  -- Allow the full per-row reindex to complete; the work is batched below.
  SET LOCAL statement_timeout = 0;

  IF v_book THEN
    SELECT id, enabled INTO v_automation_id, v_enabled
    FROM public.admin_automations WHERE slug = 'news_quality_recompute';
    INSERT INTO public.admin_automation_runs
      (automation_id, automation_slug, started_at, status, items_examined, items_changed)
    VALUES (v_automation_id, 'news_quality_recompute', v_started_at, 'success', 0, 0)
    RETURNING id INTO v_run_id;
    IF v_enabled IS DISTINCT FROM true AND NOT p_full THEN
      UPDATE public.admin_automation_runs
        SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
      UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
      RETURN jsonb_build_object('skipped',true,'reason','paused');
    END IF;
  END IF;

  LOOP
    SELECT array_agg(id ORDER BY id)
      INTO v_ids
    FROM (
      SELECT id FROM public.news_articles
      WHERE duplicate_of_id IS NULL
        AND id > v_last
        AND (p_full
             OR quality_score IS NULL
             OR updated_at > now() - interval '2 days')
      ORDER BY id
      LIMIT 500
    ) s;
    v_n := coalesce(cardinality(v_ids), 0);   -- max(uuid) does not exist; keyset off the sorted array

    IF v_n = 0 THEN
      v_done := true;
      EXIT;
    END IF;
    v_last := v_ids[v_n];

    UPDATE public.news_articles a
      SET quality_score = r.new_score, last_quality_run_at = now()
    FROM (
      SELECT id,
        public.news_completeness_score(title, content, excerpt, author, image_url,
                                       published_at, source_id, tags) AS new_score
      FROM public.news_articles WHERE id = ANY(v_ids)
    ) r
    WHERE a.id = r.id AND a.quality_score IS DISTINCT FROM r.new_score;
    GET DIAGNOSTICS v_batch_changed = ROW_COUNT;

    v_changed := v_changed + v_batch_changed;
    v_examined := v_examined + v_n;
    v_batches := v_batches + 1;

    IF v_n < 500 THEN v_done := true; EXIT; END IF;
    IF p_max_batches > 0 AND v_batches >= p_max_batches THEN EXIT; END IF;
  END LOOP;

  IF v_book THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), items_examined=v_examined, items_changed=v_changed,
          summary=jsonb_build_object('rescored',v_changed,'examined',v_examined) WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  END IF;

  RETURN jsonb_build_object('rescored',v_changed,'examined',v_examined,
                            'done',v_done,'last_id',v_last,'batches',v_batches);
EXCEPTION WHEN OTHERS THEN
  IF v_book AND v_run_id IS NOT NULL THEN
    UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  END IF;
  RAISE;
END; $function$;

CREATE OR REPLACE FUNCTION public.run_news_trust_recompute(
  p_full boolean DEFAULT false,
  p_after uuid DEFAULT NULL,
  p_max_batches integer DEFAULT 0
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started_at timestamptz := now();
  v_changed int := 0; v_examined int := 0; v_batch_changed int := 0;
  v_batches int := 0; v_book boolean := (p_max_batches = 0);
  v_last uuid := coalesce(p_after, '00000000-0000-0000-0000-000000000000'::uuid);
  v_ids uuid[]; v_n int; v_done boolean := false;
BEGIN
  SET LOCAL statement_timeout = 0;

  IF v_book THEN
    SELECT id, enabled INTO v_automation_id, v_enabled
    FROM public.admin_automations WHERE slug = 'news_trust_recompute';
    INSERT INTO public.admin_automation_runs
      (automation_id, automation_slug, started_at, status, items_examined, items_changed)
    VALUES (v_automation_id, 'news_trust_recompute', v_started_at, 'success', 0, 0)
    RETURNING id INTO v_run_id;
    IF v_enabled IS DISTINCT FROM true AND NOT p_full THEN
      UPDATE public.admin_automation_runs
        SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
      UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
      RETURN jsonb_build_object('skipped',true,'reason','paused');
    END IF;
  END IF;

  LOOP
    -- Nightly scope: freshly published (freshness decay moves their trust) or
    -- recently changed. Full scope: every live row (one-time convergence).
    -- last_verified_at is intentionally NOT a scope gate: the IS DISTINCT FROM
    -- guard leaves unchanged rows' last_verified_at untouched, so gating on it
    -- would re-scan the entire table forever.
    SELECT array_agg(id ORDER BY id)
      INTO v_ids
    FROM (
      SELECT id FROM public.news_articles
      WHERE duplicate_of_id IS NULL
        AND id > v_last
        AND (p_full
             OR published_at > now() - interval '90 days'
             OR updated_at > now() - interval '2 days')
      ORDER BY id
      LIMIT 500
    ) s;
    v_n := coalesce(cardinality(v_ids), 0);   -- max(uuid) does not exist; keyset off the sorted array

    IF v_n = 0 THEN
      v_done := true;
      EXIT;
    END IF;
    v_last := v_ids[v_n];

    WITH scope AS (
      SELECT id, quality_score, relevance_score, corroboration_count,
             published_at, updated_at, needs_attention
      FROM public.news_articles WHERE id = ANY(v_ids)
    ),
    adminfb AS (
      SELECT DISTINCT ON (article_id) article_id, value
      FROM public.news_quality_signals
      WHERE signal_type='admin_feedback' AND article_id = ANY(v_ids)
      ORDER BY article_id, created_at DESC
    ),
    scored AS (
      SELECT s.id,
        least(1.0, greatest(0.0, coalesce(s.quality_score,0)/100.0))                         AS completeness,
        least(1.0, coalesce(s.corroboration_count,1)/3.0)                                    AS corroboration,
        exp(-greatest(0, extract(epoch FROM now()-coalesce(s.published_at,s.updated_at))/86400.0)/30.0) AS freshness,
        coalesce(s.relevance_score, 0.5)::numeric                                            AS relevance,
        coalesce(a.value, 0.5)                                                               AS admin_feedback,
        s.needs_attention
      FROM scope s LEFT JOIN adminfb a ON a.article_id=s.id
    ),
    final AS (
      SELECT id, round(100 * greatest(0.0, least(1.0,
          0.30*completeness + 0.20*corroboration + 0.20*freshness
        + 0.20*relevance     + 0.10*admin_feedback
        - CASE WHEN needs_attention THEN 0.15 ELSE 0 END)))::smallint AS new_trust
      FROM scored
    )
    UPDATE public.news_articles n
      SET trust_score = f.new_trust, last_verified_at = now()
    FROM final f
    WHERE n.id = f.id AND n.trust_score IS DISTINCT FROM f.new_trust;
    GET DIAGNOSTICS v_batch_changed = ROW_COUNT;

    v_changed := v_changed + v_batch_changed;
    v_examined := v_examined + v_n;
    v_batches := v_batches + 1;

    IF v_n < 500 THEN v_done := true; EXIT; END IF;
    IF p_max_batches > 0 AND v_batches >= p_max_batches THEN EXIT; END IF;
  END LOOP;

  IF v_book THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), items_examined=v_examined, items_changed=v_changed,
          summary=jsonb_build_object('rescored',v_changed,'examined',v_examined) WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  END IF;

  RETURN jsonb_build_object('rescored',v_changed,'examined',v_examined,
                            'done',v_done,'last_id',v_last,'batches',v_batches);
EXCEPTION WHEN OTHERS THEN
  IF v_book AND v_run_id IS NOT NULL THEN
    UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  END IF;
  RAISE;
END; $function$;

-- Durable timeout protection: prepend `SET statement_timeout = 0;` to the nightly
-- pg_cron commands so the recompute statement starts with no per-statement cap
-- (SET LOCAL inside the function cannot re-arm the already-running call).
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname='news_quality_recompute';
  IF jid IS NOT NULL THEN
    PERFORM cron.alter_job(jid, command := 'SET statement_timeout = 0; SELECT public.run_news_quality_recompute();');
  END IF;
  SELECT jobid INTO jid FROM cron.job WHERE jobname='news_trust_recompute';
  IF jid IS NOT NULL THEN
    PERFORM cron.alter_job(jid, command := 'SET statement_timeout = 0; SELECT public.run_news_trust_recompute();');
  END IF;
END $$;
