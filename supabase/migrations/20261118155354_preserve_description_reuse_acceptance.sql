-- User-approved count-only description reuse acceptance preservation.
-- Preserve the exact deployed function, including authorization and artwork guards.
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('api_private.run_event_quality_scan(integer,text,boolean)'::regprocedure)) <> 'f34effd87cd07b97c9a720490dbe9159' THEN
    RAISE EXCEPTION 'Event quality scanner changed since the reviewed production snapshot';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION api_private.run_event_quality_scan(p_batch integer DEFAULT 500, p_scope text DEFAULT 'all'::text, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r record; f record; q jsonb; v_assessed int:=0; v_opened int:=0; v_resolved int:=0;
  v_just_resolved int:=0; v_obsolete_images int:=0; v_artwork_preparation jsonb;
  v_codes text[]; v_open text[]; v_hash text; v_now timestamptz:=now();
begin
  perform public.assert_admin_or_internal();
  if not pg_try_advisory_xact_lock(hashtext('event_quality_scan')) then
    return jsonb_build_object('scope',p_scope,'dry_run',p_dry_run,'skipped','already_running');
  end if;
  if p_scope not in ('all','current','historical') then raise exception 'invalid event quality scope: %',p_scope; end if;
  v_obsolete_images:=api_private.resolve_obsolete_event_image_issues(p_batch,p_scope,p_dry_run);
  v_resolved:=v_resolved+v_obsolete_images;
  for r in
    with ns as (
      select qi.event_id,
        max(greatest(qi.last_seen_at,coalesce(qi.resolved_at,'epoch'::timestamptz),
          coalesce(qi.reviewed_at,'epoch'::timestamptz))) as touched_at
      from public.event_quality_issues qi
      where qi.detector<>'event-quality-scan'
      group by qi.event_id),
    dqx as (
      select x.event_id, max(dq.created_at) as created_at
      from public.dedup_review_queue dq
      cross join lateral (values (dq.keep_id),(dq.drop_id)) x(event_id)
      where dq.entity_type='event' and dq.status='open'
      group by x.event_id)
    select e.* from public.events e left join public.event_quality_current qc on qc.event_id=e.id
      left join ns on ns.event_id=e.id left join dqx on dqx.event_id=e.id
    where e.duplicate_of_id is null
      and (p_scope='all' or (p_scope='current' and coalesce(e.end_date,e.start_date)>=now())
        or (p_scope='historical' and coalesce(e.end_date,e.start_date)<now()))
      and (qc.event_id is null or qc.input_updated_at<e.updated_at
        or ns.touched_at>qc.assessed_at
        or dqx.created_at>qc.assessed_at
        or (exists(select 1 from public.event_quality_issues qi where qi.event_id=e.id
              and qi.status='open' and qi.issue_code='DEDUP_CANDIDATE')
          and not exists(select 1 from public.dedup_review_queue dq where dq.entity_type='event'
              and dq.status='open' and e.id in (dq.keep_id,dq.drop_id)))
        or (coalesce(e.end_date,e.start_date)>=now() and qc.assessed_at<now()-interval '24 hours')
        or (coalesce(e.end_date,e.start_date)<now() and qc.assessed_at<now()-interval '30 days')
        or qc.assessed_at<greatest(
          coalesce((select max(refreshed_at) from public.event_quality_description_clusters),'epoch'::timestamptz),
          coalesce((select max(refreshed_at) from public.event_quality_image_clusters),'epoch'::timestamptz)))
    order by (qc.event_id is null) desc,e.updated_at desc,e.id limit greatest(0,least(p_batch,5000))
  loop
    if auth.uid()is null and api_private.historical_graph_artwork_scope(r.id)is not null then
      v_artwork_preparation:=public.reconcile_historical_graph_artwork(1,p_dry_run,array[r.id]);
      if coalesce((v_artwork_preparation->>'skipped')::boolean,false)
        or coalesce((v_artwork_preparation->>'events_examined')::integer,0)=0 then continue;end if;
    end if;
    q:=public.compute_event_quality(r.id); v_assessed:=v_assessed+1;
    if p_dry_run then continue; end if;
    v_codes:=array(select jsonb_array_elements_text(q->'issue_codes'));
    insert into public.event_quality_current(event_id,rubric_version,event_scope,
      completeness_score,validity_score,linkage_score,provenance_score,media_score,
      freshness_score,overall_score,quality_tier,issue_codes,open_issue_codes,
      blocker_codes,assessed_at,input_updated_at,details)
    values(r.id,(q->>'rubric_version')::int,q->>'event_scope',
      (q->>'completeness_score')::int,(q->>'validity_score')::int,
      (q->>'linkage_score')::int,(q->>'provenance_score')::int,
      (q->>'media_score')::int,(q->>'freshness_score')::int,(q->>'overall_score')::int,
      q->>'quality_tier',v_codes,'{}',array(select jsonb_array_elements_text(q->'blocker_codes')),
      v_now,r.updated_at,jsonb_build_object('legacy_quality_score',r.quality_score))
    on conflict(event_id) do update set rubric_version=excluded.rubric_version,
      event_scope=excluded.event_scope,completeness_score=excluded.completeness_score,
      validity_score=excluded.validity_score,linkage_score=excluded.linkage_score,
      provenance_score=excluded.provenance_score,media_score=excluded.media_score,
      freshness_score=excluded.freshness_score,overall_score=excluded.overall_score,
      quality_tier=excluded.quality_tier,issue_codes=excluded.issue_codes,
      blocker_codes=excluded.blocker_codes,assessed_at=excluded.assessed_at,
      input_updated_at=excluded.input_updated_at,details=excluded.details;

    for f in select * from public.event_quality_findings(r.id) loop
      v_hash:=md5(f.evidence::text);
      if not exists(select 1 from public.event_quality_issues i where i.event_id=r.id
        and i.issue_code=f.issue_code and i.status='accepted' and (
          i.evidence_hash=v_hash
          or (
            -- A count-only change does not invalidate a review of the same text.
            f.issue_code='DESCRIPTION_REUSED'
            and i.detector='event-quality-scan'
            and i.dimension=f.dimension and i.severity=f.severity
            and jsonb_typeof(f.evidence->'fingerprint')='string'
            and jsonb_typeof(i.evidence->'fingerprint')='string'
            and (f.evidence->>'fingerprint') ~ '^[0-9a-f]{32}$'
            and i.evidence->>'fingerprint'=f.evidence->>'fingerprint'
            and (i.evidence-'cluster_size')=(f.evidence-'cluster_size')
          )
        )) then
        insert into public.event_quality_issues(event_id,dimension,issue_code,severity,evidence,evidence_hash,detected_at,last_seen_at)
        values(r.id,f.dimension,f.issue_code,f.severity,f.evidence,v_hash,
          case when f.issue_code='DEDUP_CANDIDATE' and f.evidence?'oldest_created_at'
            then least(v_now,(f.evidence->>'oldest_created_at')::timestamptz) else v_now end,v_now)
        on conflict(event_id,issue_code) where status='open' do update
          set dimension=excluded.dimension,severity=excluded.severity,evidence=excluded.evidence,
              evidence_hash=excluded.evidence_hash,last_seen_at=excluded.last_seen_at;
        if found then v_opened:=v_opened+1; end if;
      end if;
    end loop;
    update public.event_quality_issues set status='resolved',resolved_at=v_now,
      resolution='cleared_by_scan',reviewed_at=v_now
    where event_id=r.id and status='open' and detector='event-quality-scan'
      and not(issue_code=any(v_codes));
    get diagnostics v_just_resolved = row_count;
    v_resolved:=v_resolved+v_just_resolved;
    if auth.uid()is null then
      perform public.reconcile_historical_graph_artwork(1,false,array[r.id]);
    end if;
    select coalesce(array_agg(issue_code order by issue_code),'{}') into v_open
      from public.event_quality_issues where event_id=r.id and status='open';
    update public.event_quality_current set open_issue_codes=v_open,
      issue_codes=(select coalesce(array_agg(distinct c order by c),'{}')
        from unnest(v_codes||v_open) c)
    where event_id=r.id;
  end loop;
  return jsonb_build_object('scope',p_scope,'dry_run',p_dry_run,'assessed',v_assessed,
    'issues_seen',v_opened,'issues_resolved',v_resolved,'obsolete_image_issues_resolved',v_obsolete_images);
end;
$function$;
