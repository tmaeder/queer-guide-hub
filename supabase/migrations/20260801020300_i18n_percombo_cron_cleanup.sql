-- ============================================================================
-- Content-processing simplification P0.3b — retire the per-combo i18n crons
-- ----------------------------------------------------------------------------
-- The i18n_translation_dispatch cron (companion migration) now drives all
-- (table, field, locale) combos from i18n_translation_targets. This removes:
--   * the ~150 i18n_<table>_<field>_<lang> pg_cron jobs (created live via
--     Management API — no repo migration ever defined them)
--   * the i18n_cron_auth_fix nightly job + run_i18n_cron_auth_fix() fn, whose
--     only purpose was patching auth headers on those 150 jobs.
-- Applied AFTER verifying the dispatcher fires and cycles combos
-- (i18n_translation_targets.last_run_at advancing, translate-i18n-batch 2xx).
-- ============================================================================

DO $$
DECLARE
  v_job text;
BEGIN
  FOR v_job IN
    SELECT jobname FROM cron.job
    WHERE jobname LIKE 'i18n\_%' ESCAPE '\'
      AND jobname NOT IN ('i18n_translation_dispatch')
  LOOP
    PERFORM cron.unschedule(v_job);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.run_i18n_cron_auth_fix();
