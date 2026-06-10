-- ============================================================================
-- Fix dead translate-i18n pipeline (product-wide)
-- ----------------------------------------------------------------------------
-- The translate-i18n-batch edge function was deployed with verify_jwt=true, so
-- the platform rejected every cron POST before the function's own auth ran; and
-- the cron jobs authenticated with `X-Webhook-Secret` read from a Vault secret
-- (`translate_i18n_webhook_secret`) that was never created. Net result: ZERO
-- translations across all entities (cities/events/tags name_i18n/description_i18n
-- all empty) despite ~26 registered translate-i18n-* cron jobs.
--
-- The function now (1) is deployed with verify_jwt=false and (2) accepts the
-- shared INTERNAL_INVOKE_SECRET via X-Internal-Secret (hasInternalSecret) — the
-- same proven pattern other internal edge crons use. This migration repoints
-- every translate-i18n-* cron to send X-Internal-Secret from the existing
-- `internal_invoke_secret` Vault entry, so the nightly runs actually execute.
-- Idempotent + guarded: only reschedules jobs whose command actually changes.
-- ============================================================================

DO $$
DECLARE
  r        record;
  new_cmd  text;
BEGIN
  FOR r IN
    SELECT jobname, schedule, command
    FROM cron.job
    WHERE command LIKE '%translate-i18n-batch%'
      AND command LIKE '%X-Webhook-Secret%'
  LOOP
    new_cmd := replace(r.command, 'X-Webhook-Secret', 'X-Internal-Secret');
    -- swap the Vault secret name in the header subselect to the working one
    new_cmd := regexp_replace(new_cmd, 'name=''[a-z0-9_]+''\)', 'name=''internal_invoke_secret'')');
    IF new_cmd IS DISTINCT FROM r.command THEN
      PERFORM cron.unschedule(r.jobname);
      PERFORM cron.schedule(r.jobname, r.schedule, new_cmd);
    END IF;
  END LOOP;
END $$;
