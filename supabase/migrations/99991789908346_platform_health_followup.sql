-- Follow-up repairs discovered only after the 2026-09-20 platform-health
-- migration made the full production sentinel reachable again.

-- Restore the quality verdict that the last quality-enhance audit actually
-- issued. Scope this to rows that explicitly claim that gate version; podcast
-- deterministic verdicts are a separate, declared writer.
with last_gate as (
  select distinct on (a.staging_id)
         a.staging_id,
         a.after_data->>'quality_status' as gate_verdict
  from public.enrichment_audit a
  where a.stage = 'quality-enhance'
    and a.after_data ? 'quality_status'
  order by a.staging_id, a.created_at desc
)
update public.ingestion_staging s
set enriched_data = jsonb_set(
      s.enriched_data,
      '{quality_status}',
      to_jsonb(g.gate_verdict),
      false
    ),
    updated_at = now()
from last_gate g
where g.staging_id = s.id
  and s.target_table = 'news_articles'
  and s.enriched_data->>'quality_pipeline_version' = 'news-quality.2026.04.27.0'
  and g.gate_verdict is not null
  and s.enriched_data->>'quality_status' is distinct from g.gate_verdict;

-- The latest event_schedule_signals redefinition accidentally dropped the
-- provenance filter from both generated-row invariants. Confirmed dates remain
-- valid evidence even after a schedule is cleared and must not be called
-- generated orphans. Patch the installed definition without restating later
-- additions to the sentinel.
do $event_signal$
declare
  v_oid oid;
  v_before text;
  v_after text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'event_schedule_signals'
    and pg_get_function_identity_arguments(p.oid) = '';

  if v_oid is null then
    raise exception 'event_schedule_signals() not found';
  end if;

  v_before := pg_get_functiondef(v_oid);
  v_after := replace(
    replace(
      v_before,
      'where d.source_hash is distinct from public.event_schedule_hash(e.schedule)',
      'where d.provenance = ''generated'' and d.source_hash is distinct from public.event_schedule_hash(e.schedule)'
    ),
    'select count(*) from public.event_dates d
        where not exists (select 1 from public.events e',
    'select count(*) from public.event_dates d
        where d.provenance = ''generated''
          and not exists (select 1 from public.events e'
  );

  if v_after = v_before then
    raise exception 'event_schedule_signals provenance predicates were not found';
  end if;
  execute v_after;
end
$event_signal$;

-- A zero-sized rebuild still performs the function's orphan cleanup. It
-- deletes only generated rows; confirmed dates are deliberately preserved.
select public.run_event_dates_rebuild(0);

-- Count page views, not custom events, and keep query-distinct pages separate.
-- The previous sentinel selected every event_type and grouped without
-- url_query, so two named events (or two legitimate query pages) in one second
-- could falsely report a second page-view emitter.
create or replace function public.analytics_hygiene_stats()
returns jsonb
language sql
stable
security definer
set search_path to 'umami', 'public'
as $function$
  with
  recent as (
    select e.event_id, e.session_id, e.url_path, e.url_query, e.created_at
      from umami.website_event e
     where e.created_at > now() - interval '24 hours'
       and e.event_type = 1
  ),
  sessions_24h as (
    select s.session_id, s.country, s.hostname
      from umami.session s
     where s.created_at > now() - interval '24 hours'
  ),
  country as (
    select count(*) total, count(*) filter (where country is null) nulls
      from sessions_24h
  ),
  dupes as (
    select count(*) n from (
      select 1 from recent
       group by session_id, url_path, url_query, date_trunc('second', created_at)
      having count(*) > 1
    ) d
  ),
  bursts as (
    select count(*) n from (
      select session_id from recent group by session_id having count(*) >= 50
    ) b
  ),
  foreign_hosts as (
    select count(*) n from sessions_24h
     where lower(hostname) not in ('queer.guide','www.queer.guide')
  ),
  retention as (
    select count(*) filter (where created_at < now() - interval '100 days') stale_events
      from umami.website_event
  ),
  scheduled as (
    select count(*) n from cron.job
     where jobname in ('umami_retention','user_events_retention')
  ),
  writers as (
    select
      (select count(*) from public.user_events where created_at > now() - interval '24 hours') user_events,
      (select count(*) from public.search_queries where created_at > now() - interval '24 hours') search_queries,
      (select count(*) from umami.website_event
        where created_at > now() - interval '24 hours' and event_type = 1) page_views
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
  'Sentinel for the analytics layer. Counts only page-view events and preserves query-distinct pages when detecting duplicate emission.';

revoke all on function public.analytics_hygiene_stats() from public, anon, authenticated;
grant execute on function public.analytics_hygiene_stats() to service_role;

-- Belt-and-suspenders server-side idempotency: even if two browser emitters are
-- accidentally shipped again, identical page views for one session cannot be
-- inserted inside a two-second window. Named custom events remain untouched.
do $track_dedupe$
declare
  v_oid oid;
  v_before text;
  v_after text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'track_umami_event'
    and pg_get_function_identity_arguments(p.oid) = 'payload jsonb';

  if v_oid is null then
    raise exception 'track_umami_event(jsonb) not found';
  end if;

  v_before := pg_get_functiondef(v_oid);
  v_after := replace(
    v_before,
    '  INSERT INTO umami.website_event (',
    '  IF v_event_type = 1 AND EXISTS (
    SELECT 1 FROM umami.website_event e
    WHERE e.session_id = v_session_id
      AND e.event_type = 1
      AND e.url_path = v_url_path
      AND e.url_query IS NOT DISTINCT FROM v_url_query
      AND e.created_at > now() - interval ''2 seconds''
  ) THEN
    RETURN jsonb_build_object(''success'', true, ''deduplicated'', true);
  END IF;

  INSERT INTO umami.website_event ('
  );

  if v_after = v_before then
    raise exception 'track_umami_event insert point was not found';
  end if;
  execute v_after;
end
$track_dedupe$;

comment on function public.track_umami_event(jsonb) is
  'Consent-gated Umami ingest. Identical page views for one session are idempotent within two seconds; named custom events are not deduplicated.';

-- Remove only the historical rows that violate the same exact identity rule,
-- retaining the first event in each same-session/path/query/second group.
with ranked as (
  select e.event_id,
         row_number() over (
           partition by e.session_id, e.url_path, e.url_query,
                        date_trunc('second', e.created_at)
           order by e.created_at, e.event_id
         ) as n
  from umami.website_event e
  where e.event_type = 1
    and e.created_at > now() - interval '24 hours'
)
delete from umami.website_event e
using ranked r
where e.event_id = r.event_id and r.n > 1;

-- The new podcast indexes make the sentinel bounded, but the combined probe
-- can still exceed the authenticator role's 8-second default on a cold cache.
-- Keep a finite ceiling while allowing the complete, indexed measurement.
alter function public.news_podcast_signals() set statement_timeout = '20s';

do $verify$
declare
  v_quality jsonb;
  v_events jsonb;
  v_analytics jsonb;
begin
  v_quality := public.news_quality_verdict_signals();
  if coalesce((v_quality->>'verdict_overwritten')::integer, 0) <> 0 then
    raise exception 'quality verdict repair left overwritten rows: %', v_quality;
  end if;

  v_events := public.event_schedule_signals();
  if coalesce((v_events->>'stale_rows')::integer, 0) <> 0
     or coalesce((v_events->>'orphan_generated_rows')::integer, 0) <> 0 then
    raise exception 'event date repair left stale/generated orphan rows: %', v_events;
  end if;

  v_analytics := public.analytics_hygiene_stats();
  if coalesce((v_analytics->>'duplicate_pageview_groups_24h')::integer, 0) <> 0 then
    raise exception 'analytics still reports duplicate page views: %', v_analytics;
  end if;
end
$verify$;
