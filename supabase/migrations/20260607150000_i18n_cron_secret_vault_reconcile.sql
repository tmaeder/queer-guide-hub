-- ============================================================================
-- i18n cron auth — reconcile every translate-i18n-batch job onto one Vault secret
-- ----------------------------------------------------------------------------
-- The translate-i18n pipeline produced ZERO output for weeks: cities/events/tags
-- *_i18n columns all empty, 0 translation rows in ai_suggestions, despite ~26
-- pg_cron jobs firing daily/weekly. Two compounding root causes:
--
--   1) translate-i18n-batch was deployed verify_jwt=true, but every cron POSTs
--      only an X-Webhook-Secret header (no JWT) — so the gateway rejected each
--      call with UNAUTHORIZED_NO_AUTH_HEADER before the function ran. Fixed by
--      pinning verify_jwt=false in supabase/config.toml + redeploy.
--
--   2) The 14 translate-i18n-* jobs (migration 20260429240000) hardcoded a
--      webhook-secret LITERAL that was never set as the function env secret,
--      while the 11 tag_i18n_* jobs (20260607145000) read it from Vault
--      (name='translate_i18n_webhook_secret'). The function env can hold only
--      one value, so the two groups could never both match.
--
-- This migration unifies group (2) onto the same Vault secret as group (1),
-- which also removes the plaintext secret from cron.job.command. Idempotent:
-- only rewrites jobs still carrying the old literal.
--
-- OPERATOR (one-time, not in version control — secrets):
--   1) select vault.create_secret('<secret>', 'translate_i18n_webhook_secret', 'i18n cron auth');
--   2) supabase secrets set TRANSLATE_I18N_WEBHOOK_SECRET=<secret>   (same value)
-- Until both exist with the SAME value, every POST 401s and rotates harmlessly.
-- ============================================================================

DO $$
DECLARE
  r record;
  v_vault_sql text := '(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=''translate_i18n_webhook_secret'')';
  new_cmd text;
BEGIN
  FOR r IN
    SELECT jobname, schedule, command FROM cron.job
    WHERE command LIKE '%ccdee2dfb0619e328a969acd2491abebe976ca843a4cc7f0ce49cdb92351b81f%'
  LOOP
    new_cmd := replace(
      r.command,
      '''ccdee2dfb0619e328a969acd2491abebe976ca843a4cc7f0ce49cdb92351b81f''',
      v_vault_sql
    );
    PERFORM cron.schedule(r.jobname, r.schedule, new_cmd);
  END LOOP;
END $$;
