-- ============================================================================
-- Dedup autoapprove: 'resolved' violates the status CHECK — use 'superseded'
-- ----------------------------------------------------------------------------
-- dedup_review_queue.status CHECK allows only open/approved/rejected/
-- superseded. v2 (20260817101000) wrote 'resolved' for stale pairs, so every
-- stale-pair UPDATE threw inside its per-pair exception block and the run
-- reported skipped=200, resolved_stale=0 — same visible outcome as the bug it
-- fixed, different cause. 'superseded' is the vocabulary's exact word for
-- "events made this pair moot". (public.review_queue — the staging-side table
-- touched by run_staging_auto_reject_stale — has NO status CHECK; its
-- 'resolved' writes are fine.)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_dedup_review_autoapprove(p_min_confidence numeric DEFAULT 0.95, p_limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started_at timestamptz := now();
  r record;
  v_keep uuid; v_hops int;
  v_dup uuid;
  v_approved int := 0; v_resolved_stale int := 0; v_skipped int := 0;
  v_tbl text;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'dedup_review_autoapprove';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'dedup_review_autoapprove', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF v_automation_id IS NOT NULL AND v_enabled IS DISTINCT FROM true THEN
    UPDATE public.admin_automation_runs
       SET finished_at = now(), summary = jsonb_build_object('skipped', true, 'reason', 'paused')
     WHERE id = v_run_id;
    UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'paused'
     WHERE id = v_automation_id;
    RETURN jsonb_build_object('skipped', true, 'reason', 'paused');
  END IF;

  FOR r IN
    SELECT q.id, q.entity_type, q.keep_id, q.drop_id
    FROM public.dedup_review_queue q
    WHERE q.status = 'open'
      AND q.confidence >= p_min_confidence
      AND q.entity_type <> 'personality'
    ORDER BY q.created_at
    LIMIT greatest(p_limit, 0)
  LOOP
    BEGIN
      v_tbl := CASE r.entity_type
        WHEN 'marketplace' THEN 'marketplace_listings'
        WHEN 'news' THEN 'news_articles'
        WHEN 'city' THEN 'cities'
        WHEN 'country' THEN 'countries'
        WHEN 'venue' THEN 'venues'
        WHEN 'hotel' THEN 'venues'
        WHEN 'event' THEN 'events'
        WHEN 'organization' THEN 'organizations'
        WHEN 'milestone' THEN 'milestones'
        WHEN 'queer_village' THEN 'queer_villages'
        WHEN 'group' THEN 'community_groups'
        ELSE NULL
      END;
      IF v_tbl IS NULL THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      EXECUTE format('SELECT duplicate_of_id FROM public.%I WHERE id = $1', v_tbl)
        INTO v_dup USING r.drop_id;
      IF v_dup IS NOT NULL THEN
        UPDATE public.dedup_review_queue
           SET status = 'superseded', reviewed_at = now(),
               reviewer_note = 'auto: drop side already merged (stale pair)'
         WHERE id = r.id;
        v_resolved_stale := v_resolved_stale + 1;
        CONTINUE;
      END IF;

      v_keep := r.keep_id; v_hops := 0;
      LOOP
        EXECUTE format('SELECT duplicate_of_id FROM public.%I WHERE id = $1', v_tbl)
          INTO v_dup USING v_keep;
        EXIT WHEN v_dup IS NULL OR v_hops >= 8;
        v_keep := v_dup; v_hops := v_hops + 1;
      END LOOP;

      IF v_keep = r.drop_id THEN
        UPDATE public.dedup_review_queue
           SET status = 'superseded', reviewed_at = now(),
               reviewer_note = 'auto: already merged in reverse direction (stale pair)'
         WHERE id = r.id;
        v_resolved_stale := v_resolved_stale + 1;
        CONTINUE;
      END IF;

      IF v_keep = r.keep_id THEN
        PERFORM public.approve_dedup_review(r.id);
      ELSE
        PERFORM public.approve_dedup_review(r.id, v_keep);
      END IF;
      v_approved := v_approved + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  UPDATE public.admin_automation_runs
     SET finished_at = now(),
         items_changed = v_approved + v_resolved_stale,
         summary = jsonb_build_object('approved', v_approved,
           'resolved_stale', v_resolved_stale, 'skipped', v_skipped,
           'min_confidence', p_min_confidence, 'limit', p_limit)
   WHERE id = v_run_id;
  UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'success'
   WHERE id = v_automation_id;

  RETURN jsonb_build_object('approved', v_approved,
    'resolved_stale', v_resolved_stale, 'skipped', v_skipped);
END $$;
