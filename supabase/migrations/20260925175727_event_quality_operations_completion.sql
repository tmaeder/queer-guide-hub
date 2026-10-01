-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260925175727 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- Make the event-quality dashboard canonical, searchable, and lifecycle-safe.

begin;

-- A quality snapshot belongs to a canonical event. When deduplication turns an
-- event into an alias, retire its findings and snapshot in the same transaction
-- so every downstream aggregate keeps one shared denominator.
create or replace function public.reconcile_duplicate_event_quality()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
begin
  if new.duplicate_of_id is not null
     and old.duplicate_of_id is distinct from new.duplicate_of_id then
    update public.event_quality_issues
    set status='resolved',
        resolution='event_became_duplicate',
        resolved_at=now(),
        reviewed_at=now()
    where event_id=new.id and status='open';

    delete from public.event_quality_current where event_id=new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.reconcile_duplicate_event_quality() from public,anon,authenticated;
grant execute on function public.reconcile_duplicate_event_quality() to service_role;

drop trigger if exists trg_events_reconcile_duplicate_quality on public.events;
create trigger trg_events_reconcile_duplicate_quality
after update of duplicate_of_id on public.events
for each row execute function public.reconcile_duplicate_event_quality();

-- Reconcile rows that pre-date the trigger.
update public.event_quality_issues i
set status='resolved',
    resolution='event_became_duplicate',
    resolved_at=now(),
    reviewed_at=now()
from public.events e
where e.id=i.event_id and e.duplicate_of_id is not null and i.status='open';

delete from public.event_quality_current q
using public.events e
where e.id=q.event_id and e.duplicate_of_id is not null;

create or replace function public.event_quality_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare v jsonb;
begin
  if not public.has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]) then
    return null;
  end if;

  with canonical_quality as (
    select q.*
    from public.event_quality_current q
    join public.events e on e.id=q.event_id
    where e.duplicate_of_id is null
  ), canonical_issues as (
    select i.*
    from public.event_quality_issues i
    join public.events e on e.id=i.event_id
    where e.duplicate_of_id is null
  )
  select jsonb_build_object(
    'rollout',(select to_jsonb(r) from public.event_quality_rollout r where singleton),
    'totals',jsonb_build_object(
      'canonical',(select count(*) from public.events where duplicate_of_id is null),
      'assessed',(select count(*) from canonical_quality),
      'current',(select count(*) from canonical_quality where event_scope='current'),
      'historical',(select count(*) from canonical_quality where event_scope='historical'),
      'open_issues',(select count(*) from canonical_issues where status='open'),
      'accepted_dispositions',(select count(*) from canonical_issues where status='accepted'),
      'oldest_high',(select min(detected_at) from canonical_issues
        where status='open' and severity in ('critical','high'))),
    'tiers',(select coalesce(jsonb_object_agg(quality_tier,n),'{}') from
      (select quality_tier,count(*) n from canonical_quality group by quality_tier) x),
    'scopes',(select coalesce(jsonb_object_agg(event_scope,
      jsonb_build_object('total',n,'average',avg_score)),'{}') from
      (select event_scope,count(*) n,round(avg(overall_score),1) avg_score
       from canonical_quality group by event_scope) x),
    'dimensions',(select jsonb_build_object(
      'completeness',round(avg(completeness_score),1),
      'validity',round(avg(validity_score),1),
      'linkage',round(avg(linkage_score),1),
      'provenance',round(avg(provenance_score),1),
      'media',round(avg(media_score),1),
      'freshness',round(avg(freshness_score),1),
      'overall',round(avg(overall_score),1)) from canonical_quality),
    'issues',(select coalesce(jsonb_agg(jsonb_build_object(
      'code',issue_code,'severity',severity,'count',n)
      order by case severity when 'critical' then 1 when 'high' then 2
        when 'medium' then 3 else 4 end,n desc),'[]')
      from (select issue_code,severity,count(*) n from canonical_issues
        where status='open' group by issue_code,severity) x),
    'sources',(select coalesce(jsonb_agg(jsonb_build_object(
      'source',source,'total',total,'open_issues',open_issues,
      'affected_events',affected_events,
      'defect_rate',round(100.0*affected_events/nullif(total,0),1))
      order by open_issues desc,total desc),'[]')
      from (select coalesce(e.data_source,'(unknown)') source,
        count(distinct e.id) total,
        count(distinct i.id) filter(where i.status='open') open_issues,
        count(distinct e.id) filter(where i.status='open') affected_events
        from public.events e
        left join public.event_quality_issues i on i.event_id=e.id
        where e.duplicate_of_id is null
        group by coalesce(e.data_source,'(unknown)')
        having count(distinct e.id)>=5) s)
  ) into v;
  return v;
end;
$$;

revoke all on function public.event_quality_snapshot() from public,anon,authenticated;
grant execute on function public.event_quality_snapshot() to authenticated,service_role;

create or replace function public.event_quality_issue_page(
  p_severity text default null,
  p_query text default null,
  p_offset integer default 0,
  p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_severity text:=nullif(lower(btrim(coalesce(p_severity,''))), '');
  v_query text:=nullif(btrim(coalesce(p_query,'')), '');
  v_pattern text;
  v_offset integer:=greatest(0,coalesce(p_offset,0));
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),100));
  v_result jsonb;
begin
  if not public.has_any_role_jwt(array['admin'::app_role,'moderator'::app_role]) then
    return null;
  end if;
  if v_severity is not null and v_severity not in ('critical','high','medium','low') then
    raise exception 'invalid event quality severity: %',v_severity;
  end if;
  if v_query is not null then
    v_pattern:='%'||replace(replace(replace(v_query,'\','\\'),'%','\%'),'_','\_')||'%';
  end if;

  with canonical_open as (
    select i.id,i.event_id,i.dimension,i.issue_code,i.severity,i.evidence,
      i.detected_at,i.last_seen_at,e.title,e.slug,e.data_source
    from public.event_quality_issues i
    join public.events e on e.id=i.event_id and e.duplicate_of_id is null
    where i.status='open'
  ), filtered as (
    select * from canonical_open
    where (v_severity is null or severity=v_severity)
      and (v_pattern is null
        or issue_code ilike v_pattern escape '\'
        or coalesce(data_source,'') ilike v_pattern escape '\'
        or title ilike v_pattern escape '\')
  ), page as (
    select * from filtered
    order by case severity when 'critical' then 1 when 'high' then 2
      when 'medium' then 3 else 4 end,
      detected_at asc,id asc
    offset v_offset limit v_limit
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(to_jsonb(p) order by
      case p.severity when 'critical' then 1 when 'high' then 2
        when 'medium' then 3 else 4 end,p.detected_at,p.id) from page p),'[]'),
    'filtered_total',(select count(*) from filtered),
    'canonical_total',(select count(*) from canonical_open),
    'offset',v_offset,
    'limit',v_limit
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.event_quality_issue_page(text,text,integer,integer)
  from public,anon,authenticated;
grant execute on function public.event_quality_issue_page(text,text,integer,integer)
  to authenticated,service_role;

commit;
;
