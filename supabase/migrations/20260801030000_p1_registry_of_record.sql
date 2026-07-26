-- ============================================================================
-- Content-processing simplification P1 — admin_automations as registry of record
-- ----------------------------------------------------------------------------
-- Before this migration ~118 of the ~198 active pg_cron jobs had no
-- admin_automations row: they were invisible to /admin/automation, exempt from
-- the pause-all kill switch, and ungoverned. After it:
--   1. Every active cron job is auto-registered (managed_by='system',
--      action = {type:'cron', jobname, command}) — idempotent, keyed on the
--      original jobname stored in action->>'jobname'.
--   2. sync_automations_to_cron(p_apply) reconciles registry → pg_cron:
--        * registry row disabled but cron scheduled  → unschedule (KILL SWITCH)
--        * schedule drift (registry vs cron)         → cron.alter_job
--        * enabled row with stored command, no cron  → re-schedule
--        * active cron with no registry row          → REPORT ONLY (never kills
--          unknown jobs; new jobs must register — the hygiene check alerts)
--      Dry-run by default; nightly cron applies.
--   3. pipeline_hygiene_stats() gains unregistered_cron_count so the
--      pipeline-health CI fails on rogue crons.
-- Known immediate effect: cron job event_venue_link is unscheduled on first
-- apply — its registry row was already disabled (recorded admin intent) but the
-- cron kept firing. Re-enable via /admin/automation if wanted.
-- ============================================================================

-- 1. Auto-register every active cron job that has no registry row yet.
INSERT INTO public.admin_automations
  (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
SELECT
  -- slug: jobname normalized to the registry's snake_case convention
  lower(regexp_replace(j.jobname, '[^a-zA-Z0-9]+', '_', 'g')),
  j.jobname,
  'Auto-registered from pg_cron (P1 registry-of-record, 2026-07-26). Command: '
    || left(regexp_replace(j.command, '\s+', ' ', 'g'), 300),
  'system',
  true,
  '{"type": "schedule"}'::jsonb,
  '[]'::jsonb,
  jsonb_build_object('type', 'cron', 'jobname', j.jobname, 'command', j.command),
  j.schedule
FROM cron.job j
WHERE j.active
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_automations a
    WHERE a.action->>'jobname' = j.jobname
       OR a.slug = lower(regexp_replace(j.jobname, '[^a-zA-Z0-9]+', '_', 'g'))
  )
ON CONFLICT (slug) DO NOTHING;

-- Backfill jobname onto pre-existing registry rows whose slug matches a cron
-- job (direct or snake_case-normalized), so the reconciler can match them all.
UPDATE public.admin_automations a
SET action = a.action || jsonb_build_object('jobname', j.jobname)
FROM cron.job j
WHERE a.action->>'jobname' IS NULL
  AND (j.jobname = a.slug
       OR lower(regexp_replace(j.jobname, '[^a-zA-Z0-9]+', '_', 'g')) = a.slug);

-- 2. Reconciler.
CREATE OR REPLACE FUNCTION public.sync_automations_to_cron(p_apply boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unregistered jsonb;
  v_killed       jsonb := '[]'::jsonb;
  v_fixed        jsonb := '[]'::jsonb;
  v_recreated    jsonb := '[]'::jsonb;
  r record;
BEGIN
  -- a) Rogue crons: active, no registry row. Report only — never auto-kill.
  SELECT COALESCE(jsonb_agg(j.jobname), '[]'::jsonb) INTO v_unregistered
  FROM cron.job j
  WHERE j.active
    AND NOT EXISTS (
      SELECT 1 FROM admin_automations a
      WHERE a.action->>'jobname' = j.jobname
         OR a.slug = lower(regexp_replace(j.jobname, '[^a-zA-Z0-9]+', '_', 'g'))
    );

  -- b) Kill switch: registry disabled, cron still scheduled.
  FOR r IN
    SELECT j.jobname
    FROM admin_automations a
    JOIN cron.job j ON j.jobname = COALESCE(a.action->>'jobname', a.slug)
    WHERE a.enabled = false
  LOOP
    IF p_apply THEN PERFORM cron.unschedule(r.jobname); END IF;
    v_killed := v_killed || to_jsonb(r.jobname);
  END LOOP;

  -- c) Schedule drift: registry schedule wins.
  FOR r IN
    SELECT j.jobid, j.jobname, a.schedule AS want, j.schedule AS have
    FROM admin_automations a
    JOIN cron.job j ON j.jobname = COALESCE(a.action->>'jobname', a.slug)
    WHERE a.enabled
      AND a.schedule IS NOT NULL
      AND a.schedule <> j.schedule
  LOOP
    IF p_apply THEN PERFORM cron.alter_job(r.jobid, schedule => r.want); END IF;
    v_fixed := v_fixed || jsonb_build_object('jobname', r.jobname, 'from', r.have, 'to', r.want);
  END LOOP;

  -- d) Missing crons: enabled registry row with a stored command, no cron job.
  FOR r IN
    SELECT COALESCE(a.action->>'jobname', a.slug) AS jobname,
           a.schedule, a.action->>'command' AS command
    FROM admin_automations a
    WHERE a.enabled
      AND a.schedule IS NOT NULL
      AND a.action->>'command' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM cron.job j WHERE j.jobname = COALESCE(a.action->>'jobname', a.slug)
      )
  LOOP
    IF p_apply THEN PERFORM cron.schedule(r.jobname, r.schedule, r.command); END IF;
    v_recreated := v_recreated || to_jsonb(r.jobname);
  END LOOP;

  RETURN jsonb_build_object(
    'applied', p_apply,
    'unregistered', v_unregistered,
    'disabled_killed', v_killed,
    'schedule_fixed', v_fixed,
    'recreated', v_recreated
  );
END $$;

REVOKE ALL ON FUNCTION public.sync_automations_to_cron(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_automations_to_cron(boolean) TO service_role;

COMMENT ON FUNCTION public.sync_automations_to_cron(boolean) IS
  'Reconciles admin_automations (registry of record) into pg_cron: kills crons whose registry row is disabled, fixes schedule drift, re-creates missing jobs from stored commands. Unregistered crons are reported, never killed. p_apply=false = dry run.';

-- Nightly apply + registry row for the reconciler itself.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'automation_cron_sync') THEN
    PERFORM cron.unschedule('automation_cron_sync');
  END IF;
  PERFORM cron.schedule(
    'automation_cron_sync',
    '10 5 * * *',
    'SELECT public.sync_automations_to_cron(true);'
  );
END $$;

INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES (
  'automation_cron_sync',
  'Automation → cron reconciler',
  'Nightly: enforces admin_automations as registry of record over pg_cron. Disabling a registry row now actually stops its cron; schedule edits propagate; unregistered crons are surfaced by pipeline_hygiene_stats (CI-failing).',
  'system', true,
  '{"type": "schedule"}'::jsonb, '[]'::jsonb,
  jsonb_build_object('type','cron','jobname','automation_cron_sync','command','SELECT public.sync_automations_to_cron(true);'),
  '10 5 * * *'
)
ON CONFLICT (slug) DO UPDATE
  SET description = EXCLUDED.description, action = EXCLUDED.action,
      schedule = EXCLUDED.schedule, updated_at = now();

-- 3. Hygiene stats: add unregistered-cron drift.
CREATE OR REPLACE FUNCTION public.pipeline_hygiene_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'cron_total', (SELECT count(*) FROM cron.job WHERE active),
    'legacy_cron_jobs', COALESCE((
      SELECT jsonb_agg(jobname) FROM cron.job
      WHERE jobname IN (
        'pipeline-venue-validate', 'pipeline-venue-dedup', 'pipeline-venue-commit',
        'pipeline-event-validate', 'pipeline-event-dedup', 'pipeline-event-commit'
      )
      OR jobname LIKE 'translate-i18n-%'
      OR jobname LIKE 'tag\_i18n\_%' ESCAPE '\'
    ), '[]'::jsonb),
    'i18n_percombo_cron_count', (
      SELECT count(*) FROM cron.job
      WHERE jobname LIKE 'i18n\_%' ESCAPE '\'
        AND jobname NOT IN ('i18n_translation_dispatch')
    ),
    'staging_pending_review', (
      SELECT count(*) FROM public.ingestion_staging
      WHERE review_status = 'pending_review' AND disposition = 'pending'
    ),
    'unregistered_cron_jobs', COALESCE((
      SELECT jsonb_agg(j.jobname) FROM cron.job j
      WHERE j.active
        AND NOT EXISTS (
          SELECT 1 FROM public.admin_automations a
          WHERE a.action->>'jobname' = j.jobname
             OR a.slug = lower(regexp_replace(j.jobname, '[^a-zA-Z0-9]+', '_', 'g'))
        )
    ), '[]'::jsonb)
  );
$$;
