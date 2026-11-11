-- Keep the admin quality snapshot below the PostgREST statement timeout.
-- The prior version materialized q.* and i.*, including large JSON evidence
-- payloads that the summary never reads, and repeatedly spilled them to disk.

begin;

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

  with canonical_quality as materialized (
    select q.quality_tier,q.event_scope,q.completeness_score,q.validity_score,
      q.linkage_score,q.provenance_score,q.media_score,q.freshness_score,
      q.overall_score
    from public.event_quality_current q
    join public.events e on e.id=q.event_id
    where e.duplicate_of_id is null
  ), canonical_issues as materialized (
    select i.event_id,i.status,i.severity,i.detected_at,i.issue_code
    from public.event_quality_issues i
    join public.events e on e.id=i.event_id
    where e.duplicate_of_id is null
  ), source_events as materialized (
    select coalesce(e.data_source,'(unknown)') source,count(*) total
    from public.events e
    where e.duplicate_of_id is null
    group by coalesce(e.data_source,'(unknown)')
  ), source_issues as materialized (
    select coalesce(e.data_source,'(unknown)') source,
      count(*) open_issues,count(distinct i.event_id) affected_events
    from canonical_issues i
    join public.events e on e.id=i.event_id
    where i.status='open'
    group by coalesce(e.data_source,'(unknown)')
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
      'source',s.source,'total',s.total,
      'open_issues',coalesce(i.open_issues,0),
      'affected_events',coalesce(i.affected_events,0),
      'defect_rate',round(100.0*coalesce(i.affected_events,0)/nullif(s.total,0),1))
      order by coalesce(i.open_issues,0) desc,s.total desc),'[]')
      from source_events s left join source_issues i using(source)
      where s.total>=5)
  ) into v;
  return v;
end;
$$;

revoke all on function public.event_quality_snapshot() from public,anon,authenticated;
grant execute on function public.event_quality_snapshot() to authenticated,service_role;

commit;
