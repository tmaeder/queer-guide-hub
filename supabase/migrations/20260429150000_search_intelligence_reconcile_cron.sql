-- Daily search-intelligence reconcile cron
--
-- Closes the last Phase 1 follow-up: a scheduled job that compares desired
-- settings (search_settings_versions, channel='active') to applied settings
-- (live Meilisearch) and writes drift summaries to search_audit_log.
--
-- Calls the edge function at /functions/v1/search-intelligence/cron/reconcile,
-- which is gated by an X-Webhook-Secret header (matching the meilisearch-sync
-- pattern). The secret comes from a session-level GUC so it isn't hardcoded
-- in this migration.
--
-- Schedule: daily at 04:30 UTC (after the 04:00 UTC marketplace cron, before
-- the 05:00 ingestion crons land).

-- ── Schedule ─────────────────────────────────────────────────────────────────
-- Idempotent: unschedule any existing job with the same name before scheduling.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'search-intelligence-reconcile') then
    perform cron.unschedule('search-intelligence-reconcile');
  end if;
end $$;

select cron.schedule(
  'search-intelligence-reconcile',
  '30 4 * * *',
  $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/search-intelligence/cron/reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', current_setting('app.search_intelligence_webhook_secret', true)
    ),
    body := jsonb_build_object('trigger', 'cron', 'at', now())
  ) as request_id;
  $cron$
);

comment on schema cron is
  'pg_cron: includes search-intelligence-reconcile (daily 04:30 UTC). Set app.search_intelligence_webhook_secret via ALTER DATABASE postgres SET app.search_intelligence_webhook_secret = ''<secret>''. Edge function reads the matching SEARCH_INTELLIGENCE_WEBHOOK_SECRET env var (or falls back to WEBHOOK_SECRET).';
