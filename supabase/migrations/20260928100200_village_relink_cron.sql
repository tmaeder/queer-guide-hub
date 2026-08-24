-- Schedule the village relink sweep. The engine existed; nothing ever ran it.
--
-- The Village Truth Engine shipped `relink_village_venues(village, radius)` and
-- `run_village_relink_batch(radius, batch)`, which attach unlinked venues to
-- the nearest village in the same city. Neither is in any `cron.job` and
-- neither has an `admin_automations` row — the registry holds only
-- village_completeness_recompute, village_trust_recompute,
-- village_coverage_radar and village_agentic_enrich. Measured 2026-08-24:
-- 58 of 190 villages had zero venues and 21 of 47,815 events carried a village
-- at all, which is what drove 60 rows into the 'ghost' tier. The districts were
-- not empty; nothing was ever pointed at them.
--
-- Radius 800 m, the function's own default. `queer_villages.geometry` is NULL
-- on all 190 rows, so a village is a POINT, not an area, and the radius is the
-- entire notion of "inside this district". Dry run on prod: 800 m links 370
-- venues across 84 villages and lifts 11 of the 58 empty ones; 1200 m links
-- 1,161 and lifts 24; 2000 m links 2,337 and lifts 30. The wider radii buy
-- their extra reach by pulling neighbouring districts' venues in — in a city
-- with a single village the nearest-village rule cannot correct for that. The
-- radius is a registry argument, so it can be widened later by editing the row
-- rather than by another migration.
--
-- 03:20 is before village_completeness_recompute (03:35) and
-- village_trust_recompute (03:50): link first, then rescore, then let the
-- deindex classifier in 20260928100100 re-index whatever climbed out of the
-- ghost tier the same night.
--
-- `run_village_relink_batch` records nothing, so it is wrapped rather than
-- rewritten — same run bookkeeping as the other three village jobs, the
-- reviewed link logic untouched.

CREATE OR REPLACE FUNCTION public.run_village_relink_sweep(
  p_radius_m integer DEFAULT 800,
  p_batch    integer DEFAULT 300,
  p_force    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_started_at timestamptz := now(); v_linked int := 0; v_examined int := 0;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'village_relink';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'village_relink', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  v_linked := public.run_village_relink_batch(p_radius_m, p_batch);

  SELECT count(*) INTO v_examined FROM public.venues v
   WHERE v.queer_village_id IS NULL AND v.duplicate_of_id IS NULL
     AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
     AND NOT (v.latitude = 0 AND v.longitude = 0);

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_examined, items_changed=v_linked,
        summary=jsonb_build_object('linked',v_linked,'unlinked_remaining',v_examined,
                                   'radius_m',p_radius_m,'batch',p_batch)
  WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('linked',v_linked,'unlinked_remaining',v_examined);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;

ALTER FUNCTION public.run_village_relink_sweep(integer, integer, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_village_relink_sweep(integer, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_village_relink_sweep(integer, integer, boolean) TO service_role;

-- Registry row. `action.type='rpc'` with `fn`/`jobname`, matching the three
-- sibling village jobs (a pure-SQL family-C job: cron.job_run_details is exact
-- for it, so admin_automation_effective_command leaves the command alone).
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'village_relink',
  'Link venues to their queer village',
  'Nightly: attaches unlinked venues to the nearest queer village in the same city within 800 m (run_village_relink_batch, 300/run — search-trigger cap). Runs before the completeness (03:35) and trust (03:50) recomputes so a village that gains venues is rescored and re-indexed the same night. Widen the radius by editing action.command here; kill switch = disable this row.',
  'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object(
    'type','rpc',
    'fn','run_village_relink_sweep',
    'jobname','village_relink',
    'command','SELECT public.run_village_relink_sweep(800, 300);'
  ),
  '20 3 * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schedule    = EXCLUDED.schedule,
      action      = EXCLUDED.action,
      enabled     = EXCLUDED.enabled;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('village_relink');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(a.action->>'jobname', a.schedule, a.action->>'command')
FROM public.admin_automations a
WHERE a.slug = 'village_relink';

-- Run the pair once now rather than leaving the corpus a day out of step:
-- 20260928100100 has already deindexed every empty village, and in a rolled-back
-- dry run this sweep links enough venues to lift 9 of them straight back out of
-- the ghost tier. Without this they stay deindexed until 03:50 tomorrow.
SELECT public.run_village_relink_sweep(800, 300, true);
SELECT public.run_village_trust_recompute(true);
