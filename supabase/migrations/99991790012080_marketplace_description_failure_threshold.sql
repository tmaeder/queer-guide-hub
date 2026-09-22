-- The description enhancer inherited a platform-level threshold of six. The
-- marketplace remediation policy is stricter: three consecutive genuine
-- failures pause the worker. Preserve already-counted failures and apply the
-- threshold immediately instead of requiring a fourth failing dispatch.

UPDATE public.admin_automations
SET auto_pause_threshold = 3,
    enabled = CASE WHEN consecutive_failures >= 3 THEN false ELSE enabled END,
    last_run_status = CASE
      WHEN consecutive_failures >= 3 THEN 'auto_paused'
      ELSE last_run_status
    END,
    updated_at = now()
WHERE slug = 'marketplace_description_enhance';

SELECT public.sync_automations_to_cron(true);
