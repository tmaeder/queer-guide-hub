-- ============================================================================
-- Review automation inside the guardrails — overhaul Phase 4
-- ----------------------------------------------------------------------------
-- (1) run_dedup_truth_sweep_all learns per-type mode overrides, and the
--     registry flips the sweep from queue_only to full FOR SAFE TYPES ONLY.
--     Personalities stay queue_only FOR EVER by explicit override — name-only
--     person pairs carry namesake/outing risk; the 46 open personality pairs
--     are the designed steady state, not a backlog (see 20260725201000 header
--     and _personality_merge_core's "no auto-merge sweep" contract).
--     Auto-merges only ever fire on the sweep's exact-identity gates
--     (despace key + geo/time/domain corroboration, conf ≥ 0.95) and go
--     through the reversible merge cores (entity_merge_audit + unmerge).
-- (2) Nightly drain of the ambiguous-pair queue at very high confidence via
--     the EXISTING approve_dedup_review_batch (which hard-excludes
--     personalities in its own WHERE clause). Baseline: 649 open pairs.
-- (3) run_staging_auto_reject_stale gains a second arm: news rows held
--     'awaiting_llm_verdict' whose verdict never landed within 7 days are
--     auto-rejected (166 pending live, oldest 5 days — these only exist when
--     pipeline-quality-enhance permanently failed for the row; the hourly
--     sweep re-gates any row whose verdict DID land).
--     Bodies below are edits of the LIVE pg_proc.prosrc (read 2026-08-07).
-- ============================================================================

-- (1a) per-type mode overrides ------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_dedup_truth_sweep_all(p_mode text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_conditions jsonb; v_started_at timestamptz := now();
  v_mode text; v_type text; v_type_mode text;
  v_out jsonb := '[]'::jsonb; v_one jsonb; v_modes jsonb := '{}'::jsonb;
  v_types constant text[] := array['venue','event','marketplace','personality','city',
    'hotel','milestone','organization','news','queer_village','country','group'];
begin
  perform public.assert_admin_or_internal();

  select id, enabled, conditions into v_automation_id, v_enabled, v_conditions
  from public.admin_automations where slug = 'dedup_truth_sweep';

  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  values (v_automation_id, 'dedup_truth_sweep', v_started_at, 'success', 0, 0)
  returning id into v_run_id;

  if v_automation_id is not null and v_enabled is distinct from true then
    update public.admin_automation_runs
      set finished_at = now(), summary = jsonb_build_object('skipped', true, 'reason', 'paused')
      where id = v_run_id;
    update public.admin_automations
      set last_run_at = v_started_at, last_run_status = 'paused' where id = v_automation_id;
    return jsonb_build_object('skipped', true, 'reason', 'paused');
  end if;

  v_mode := coalesce(p_mode, v_conditions->>'mode', 'queue_only');

  foreach v_type in array v_types loop
    -- Per-type override (2026-08 overhaul P4). conditions.mode_overrides is a
    -- {type: mode} map; personality is pinned 'queue_only' there and, belt +
    -- braces, clamped here too so no registry edit can ever auto-merge people.
    v_type_mode := coalesce(v_conditions->'mode_overrides'->>v_type, v_mode);
    if v_type = 'personality' and v_type_mode = 'full' then
      v_type_mode := 'queue_only';
    end if;
    v_modes := v_modes || jsonb_build_object(v_type, v_type_mode);
    begin
      v_one := public.run_dedup_truth_sweep(v_type, v_type_mode);
    exception when others then
      v_one := jsonb_build_object('type', v_type, 'error', SQLERRM);
    end;
    v_out := v_out || jsonb_build_array(v_one);
  end loop;

  update public.admin_automation_runs
    set finished_at = now(), summary = jsonb_build_object('mode', v_mode, 'modes', v_modes, 'results', v_out)
    where id = v_run_id;
  if v_automation_id is not null then
    update public.admin_automations
      set last_run_at = v_started_at, last_run_status = 'success' where id = v_automation_id;
  end if;

  return jsonb_build_object('mode', v_mode, 'modes', v_modes, 'results', v_out);
end $$;

COMMENT ON FUNCTION public.run_dedup_truth_sweep_all(text) IS
  'Nightly dedup sweep across 12 types. Mode from admin_automations.conditions (mode + per-type mode_overrides); personality is hard-clamped to queue_only in-function — automated person merges are forbidden (namesake/outing risk).';

-- (1b) flip safe types to full; personality pinned
UPDATE public.admin_automations
   SET conditions = coalesce(case when jsonb_typeof(conditions) = 'object' then conditions else '{}'::jsonb end, '{}'::jsonb)
       || '{"mode":"full","mode_overrides":{"personality":"queue_only"}}'::jsonb
 WHERE slug = 'dedup_truth_sweep';

-- (2) nightly high-confidence queue drain ------------------------------------
CREATE OR REPLACE FUNCTION public.run_dedup_review_autoapprove(p_min_confidence numeric DEFAULT 0.95, p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started_at timestamptz := now(); v_result jsonb;
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

  -- approve_dedup_review_batch excludes entity_type='personality' in its own
  -- WHERE clause and routes each pair through approve_dedup_review → the
  -- reversible merge cores (audited, unmergeable).
  v_result := public.approve_dedup_review_batch(p_min_confidence, p_limit);

  UPDATE public.admin_automation_runs
     SET finished_at = now(),
         items_changed = coalesce((v_result->>'approved')::int, 0),
         summary = v_result || jsonb_build_object('min_confidence', p_min_confidence, 'limit', p_limit)
   WHERE id = v_run_id;
  UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'success'
   WHERE id = v_automation_id;

  RETURN v_result;
END $$;

COMMENT ON FUNCTION public.run_dedup_review_autoapprove(numeric, integer) IS
  'Nightly: auto-approves dedup_review_queue pairs at confidence ≥ p_min_confidence (default 0.95) via approve_dedup_review_batch, which excludes personalities and uses the reversible merge cores. Caps at p_limit/night.';

REVOKE EXECUTE ON FUNCTION public.run_dedup_review_autoapprove(numeric, integer) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.run_dedup_review_autoapprove(numeric, integer) TO service_role;

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'dedup_review_autoapprove',
  'Auto-approve high-confidence dedup pairs',
  'Nightly at 06:30 (after the 05:50 sweep): approves dedup review pairs at confidence ≥ 0.95, max 100/night. Personalities are excluded by approve_dedup_review_batch itself; every merge is reversible (entity_merge_audit + unmerge_entities).',
  'system',
  true,
  '{"type":"schedule"}'::jsonb,
  '[]'::jsonb,
  jsonb_build_object(
    'type', 'rpc',
    'fn', 'run_dedup_review_autoapprove',
    'jobname', 'dedup_review_autoapprove',
    'command', 'SELECT public.run_dedup_review_autoapprove();'
  ),
  '30 6 * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      action   = EXCLUDED.action,
      enabled  = EXCLUDED.enabled;

DO $$
BEGIN
  PERFORM cron.unschedule('dedup_review_autoapprove');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'dedup_review_autoapprove',
  '30 6 * * *',
  'SELECT public.run_dedup_review_autoapprove();'
);

-- (3) stale awaiting_llm_verdict arm -----------------------------------------
CREATE OR REPLACE FUNCTION public.run_staging_auto_reject_stale()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_automation_id uuid;
  v_run_id bigint;
  v_examined int := 0;
  v_changed int := 0;
  v_verdict_changed int := 0;
  v_started_at timestamptz := now();
  v_threshold timestamptz := now() - interval '30 days';
  v_verdict_threshold timestamptz := now() - interval '7 days';
  v_enabled boolean;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'staging_auto_reject_stale';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'staging_auto_reject_stale', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF NOT v_enabled THEN
    UPDATE public.admin_automation_runs
    SET finished_at = now(),
        summary = jsonb_build_object('skipped', true, 'reason', 'paused')
    WHERE id = v_run_id;
    UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'paused'
    WHERE id = v_automation_id;
    RETURN jsonb_build_object('skipped', true, 'reason', 'paused');
  END IF;

  -- Arm 1 (unchanged): anything pending human review for 30 days is rejected.
  SELECT count(*) INTO v_examined FROM public.ingestion_staging
  WHERE review_status='pending_review' AND disposition='pending'
    AND created_at < v_threshold;

  WITH pick AS (
    SELECT id FROM public.ingestion_staging
    WHERE review_status='pending_review' AND disposition='pending'
      AND created_at < v_threshold
    ORDER BY created_at
    LIMIT 5000
  ), upd AS (
    UPDATE public.ingestion_staging s
    SET review_status='rejected', disposition='rejected',
        review_notes = COALESCE(s.review_notes || E'\n','') ||
          'Auto-rejected: stale (no human action within 30 days)',
        reviewed_at=now()
    FROM pick WHERE s.id = pick.id
    RETURNING s.id
  )
  SELECT count(*) INTO v_changed FROM upd;

  -- Arm 2 (2026-08 overhaul P4): news rows held for an LLM verdict that never
  -- arrived within 7 days. The hourly review-gate sweep re-gates any row whose
  -- verdict DID land, so surviving this long means quality-enhance permanently
  -- failed for the row — reject it and resolve its review_queue mirror.
  WITH stale_holds AS (
    SELECT rq.id AS rq_id, rq.entity_id AS staging_id
    FROM public.review_queue rq
    JOIN public.ingestion_staging s ON s.id = rq.entity_id
    WHERE rq.review_type = 'awaiting_llm_verdict'
      AND rq.status = 'pending'
      AND rq.created_at < v_verdict_threshold
      AND s.review_status = 'pending_review'
      AND s.disposition = 'pending'
    ORDER BY rq.created_at
    LIMIT 2000
  ), upd_staging AS (
    UPDATE public.ingestion_staging s
    SET review_status='rejected', disposition='rejected',
        review_notes = COALESCE(s.review_notes || E'\n','') ||
          'Auto-rejected: LLM verdict never arrived within 7 days',
        reviewed_at=now()
    FROM stale_holds h WHERE s.id = h.staging_id
    RETURNING s.id
  ), upd_queue AS (
    UPDATE public.review_queue rq
    SET status='resolved', resolved_at=now()
    FROM stale_holds h WHERE rq.id = h.rq_id
    RETURNING rq.id
  )
  SELECT count(*) INTO v_verdict_changed FROM upd_staging;

  UPDATE public.admin_automation_runs
  SET finished_at = now(), items_examined = v_examined,
      items_changed = v_changed + v_verdict_changed,
      summary = jsonb_build_object('examined', v_examined, 'changed', v_changed,
        'verdict_timeouts_rejected', v_verdict_changed,
        'threshold_days', 30, 'verdict_threshold_days', 7, 'batch_cap', 5000,
        'rule', 'pending_review + pending + age>30d -> rejected (max 5000/run); awaiting_llm_verdict>7d -> rejected (max 2000/run)')
  WHERE id = v_run_id;

  UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'success'
  WHERE id = v_automation_id;

  RETURN jsonb_build_object('examined', v_examined, 'changed', v_changed,
    'verdict_timeouts_rejected', v_verdict_changed);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs
  SET finished_at = now(), status = 'error', error = SQLERRM WHERE id = v_run_id;
  UPDATE public.admin_automations SET last_run_at = v_started_at, last_run_status = 'error'
  WHERE id = v_automation_id;
  RAISE;
END;
$$;
