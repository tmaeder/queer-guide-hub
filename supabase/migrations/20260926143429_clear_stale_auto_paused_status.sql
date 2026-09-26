-- Re-enabled jobs can retain the historical auto_paused marker even after
-- their failure counter has been cleared. That makes the admin Attention view
-- report false incidents. Enabled + zero failures is the authoritative state.
update public.admin_automations
set last_run_status = null,
    updated_at = now()
where enabled
  and consecutive_failures = 0
  and last_run_status = 'auto_paused';
