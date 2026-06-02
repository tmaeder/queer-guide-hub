-- Meilisearch decommission: unschedule the dead settings-drift reconcile cron.
--
-- The `search-intelligence-reconcile` job (daily 30 4 * * *) POSTed to the
-- search-intelligence edge function's /cron/reconcile route, which compared
-- Meilisearch's applied index settings against search_settings_versions and
-- recorded drift. With Meilisearch decommissioned (search now serves from the
-- Postgres search_documents engine), that route has been removed from the edge
-- function, so the job would otherwise start returning 404 daily.
--
-- Idempotent: only unschedules if the job exists.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'search-intelligence-reconcile') then
    perform cron.unschedule('search-intelligence-reconcile');
  end if;
end
$$;
