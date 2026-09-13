-- analytics_hygiene_stats(): the sentinel this layer never had.
--
-- Everything fixed in this series ran wrong for months and nothing reported it.
-- The single most useful number is the one that sat at 98.9% and told nobody:
-- `country` is set ONLY on the consent-gated path (functions/api/track.ts adds
-- request.cf.country), so a high null-country rate means a writer has found its
-- way around the consent gate again. That is the check.
--
-- A STANDALONE function rather than another key on pipeline_hygiene_stats():
-- that body is restated in full by every migration that touches it, which makes
-- it a merge-collision surface, and this has a different owner anyway.
--
-- Every count is scoped to a recent window so the numbers describe the CURRENT
-- state, not the historical corpus the fixes were applied to. `probe_ok` exists
-- so an absent or broken sentinel is distinguishable from a clean corpus: the
-- reader in check-pipeline-health.mjs treats a missing key as "this check
-- measured NOTHING", never as a pass.

create or replace function public.analytics_hygiene_stats()
returns jsonb
language sql
stable
security definer
set search_path to 'umami', 'public'
as $function$
  with
  recent as (
    select e.event_id, e.session_id, e.url_path, e.created_at
      from umami.website_event e
     where e.created_at > now() - interval '24 hours'
  ),
  sessions_24h as (
    select s.session_id, s.country, s.hostname
      from umami.session s
     where s.created_at > now() - interval '24 hours'
  ),
  -- The consent signal. Country only ever arrives via the CF proxy, which only
  -- ever runs because public/umami.js was injected after explicit consent.
  country as (
    select count(*) total, count(*) filter (where country is null) nulls
      from sessions_24h
  ),
  -- One page view recorded more than once in the same second for the same
  -- session and path. Two pipelines, or a second history patch.
  dupes as (
    select count(*) n from (
      select 1 from recent
       group by session_id, url_path, date_trunc('second', created_at)
      having count(*) > 1
    ) d
  ),
  -- A single session emitting 50+ page views in a day is a client-side loop or
  -- an automated client, not a reader.
  bursts as (
    select count(*) n from (
      select session_id from recent group by session_id having count(*) >= 50
    ) b
  ),
  -- Hostnames the ingest allowlist should already be refusing. A non-zero here
  -- means the allowlist regressed or something writes past track_umami_event.
  foreign_hosts as (
    select count(*) n from sessions_24h
     where lower(hostname) not in ('queer.guide','www.queer.guide')
  ),
  -- Retention proving it RAN, not merely that it is registered.
  retention as (
    select
      count(*) filter (where created_at < now() - interval '100 days') stale_events
      from umami.website_event
  ),
  scheduled as (
    select count(*) n from cron.job
     where jobname in ('umami_retention','user_events_retention')
  ),
  -- Silence is not health: a telemetry table with no rows in 24h is either a
  -- dead writer or a rejected row, and both look like "nobody visited".
  writers as (
    select
      (select count(*) from public.user_events where created_at > now() - interval '24 hours') user_events,
      (select count(*) from public.search_queries where created_at > now() - interval '24 hours') search_queries,
      (select count(*) from umami.website_event where created_at > now() - interval '24 hours') page_views
  )
  select jsonb_build_object(
    'probe_ok', true,
    'window_hours', 24,
    'sessions_24h', (select total from country),
    'sessions_null_country_24h', (select nulls from country),
    'sessions_null_country_pct_24h',
      case when (select total from country) = 0 then null
           else round(100.0 * (select nulls from country) / (select total from country), 1) end,
    'duplicate_pageview_groups_24h', (select n from dupes),
    'burst_sessions_24h', (select n from bursts),
    'foreign_hostname_sessions_24h', (select n from foreign_hosts),
    'website_event_rows', (select count(*) from umami.website_event),
    'website_event_bytes', pg_total_relation_size('umami.website_event'),
    'events_older_than_100d', (select stale_events from retention),
    'retention_jobs_scheduled', (select n from scheduled),
    'page_views_24h', (select page_views from writers),
    'user_events_24h', (select user_events from writers),
    'search_queries_24h', (select search_queries from writers),
    'generated_at', now()
  );
$function$;

comment on function public.analytics_hygiene_stats() is
  'Sentinel for the analytics layer. sessions_null_country_pct_24h is the consent signal: country is set only on the consent-gated /api/track path, so a rising null rate means a writer bypassed the gate (it sat at 98.9% for months and nothing reported it). Read by scripts/check-pipeline-health.mjs.';

revoke all on function public.analytics_hygiene_stats() from public, anon, authenticated;
grant execute on function public.analytics_hygiene_stats() to service_role;

do $verify$
declare v jsonb;
begin
  v := public.analytics_hygiene_stats();
  if coalesce((v->>'probe_ok')::boolean, false) is not true then
    raise exception 'analytics_hygiene_stats did not report probe_ok';
  end if;
  -- Every key the health script reads must exist, or it will silently skip the
  -- check it was added for. An absent key and a zero must not look alike.
  if not (v ?& array[
    'sessions_null_country_pct_24h','duplicate_pageview_groups_24h',
    'burst_sessions_24h','foreign_hostname_sessions_24h',
    'website_event_rows','retention_jobs_scheduled',
    'page_views_24h','user_events_24h','search_queries_24h'
  ]) then
    raise exception 'analytics_hygiene_stats is missing a key the health check reads: %', v;
  end if;
  raise notice 'analytics_hygiene_stats: %', v;
end
$verify$;
