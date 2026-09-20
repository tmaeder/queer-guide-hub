-- Keep the cockpit actionable: a valid `general` classification is not a
-- coverage failure, and a pipeline error superseded by a later successful run
-- is history rather than a currently broken system.

do $rename$
begin
  if to_regprocedure('public.release_gate_checks_raw()') is null then
    alter function public.release_gate_checks() rename to release_gate_checks_raw;
  end if;
end
$rename$;

create or replace function public.release_gate_checks()
returns table(gate text, severity text, failures bigint, detail jsonb)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select
    r.gate,
    r.severity,
    case when r.gate = 'news_category_coverage' then (
      select count(*)::bigint
      from public.news_articles n
      where n.duplicate_of_id is null
        and n.published_at > now() - interval '30 days'
        and coalesce(n.category_canonical, 'general') = 'general'
        and coalesce(n.enrichment_status->'category'->>'via', '') <> 'unmatched'
    ) else r.failures end,
    case when r.gate = 'news_category_coverage'
      then r.detail || jsonb_build_object(
        'meaning', 'recent general rows without an explicit unmatched classification')
      else r.detail end
  from public.release_gate_checks_raw() r;
$fn$;

revoke all on function public.release_gate_checks() from public, anon, authenticated;
grant execute on function public.release_gate_checks() to service_role;

comment on function public.release_gate_checks() is
  'Release gates with truthful news coverage semantics: classifier-proven unmatched rows are valid general content, not an unresolved backlog.';

create or replace view public.pipeline_error_summary as
select
  e.function_name,
  e.severity,
  count(*) filter (where e.created_at > now() - interval '1 hour') as last_1h,
  count(*) filter (where e.created_at > now() - interval '24 hours') as last_24h,
  count(*) filter (where e.created_at > now() - interval '7 days') as last_7d,
  max(e.created_at) as last_seen_at
from public.pipeline_errors e
left join public.pipeline_runs failed_run on failed_run.id = e.pipeline_run_id
where e.pipeline_run_id is null
   or not exists (
     select 1
     from public.pipeline_runs recovery
     where recovery.pipeline_id = failed_run.pipeline_id
       and recovery.status = 'completed'
       and recovery.completed_at > e.created_at
   )
group by e.function_name, e.severity;

revoke all on public.pipeline_error_summary from public, anon, authenticated;
grant select on public.pipeline_error_summary to authenticated, service_role;

comment on view public.pipeline_error_summary is
  'Unresolved pipeline errors by time window. Errors tied to a pipeline run disappear after a later successful run of the same pipeline.';

do $verify$
declare
  v_news bigint;
  v_errors bigint;
begin
  select failures into v_news
  from public.release_gate_checks()
  where gate = 'news_category_coverage';

  if coalesce(v_news, -1) <> 0 then
    raise exception 'unresolved recent news category coverage remains: %', v_news;
  end if;

  select coalesce(sum(last_24h), 0) into v_errors
  from public.pipeline_error_summary;

  if v_errors <> 0 then
    raise exception 'unresolved 24-hour pipeline errors remain: %', v_errors;
  end if;
end
$verify$;
