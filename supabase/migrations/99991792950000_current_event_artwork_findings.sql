-- Image-auditor evidence describes the primary artwork observed at probe time.
-- Retain its history, but never keep an unreviewed finding active after that
-- primary URL has changed. Missing/current-image defects still require repair.
create function api_private.resolve_obsolete_event_image_issues(p_batch integer,p_scope text,p_dry_run boolean)
returns integer language plpgsql security definer set search_path=public,pg_temp as $fn$
declare r record;resolved integer:=0;changed integer;
begin
 perform public.assert_admin_or_internal();
 if p_scope not in('all','current','historical')or p_scope is null then raise exception 'Invalid event quality scope';end if;
 for r in
 with locked_events as materialized(
  select e.id,e.images[1]primary_image from public.events e
  where e.duplicate_of_id is null
   and(p_scope='all'or p_scope='current'and coalesce(e.end_date,e.start_date)>=now()
    or p_scope='historical'and coalesce(e.end_date,e.start_date)<now())
   and exists(select 1 from public.event_quality_issues i
    join public.event_image_quality_observations observed on observed.event_id=i.event_id and observed.image_url=i.evidence->>'url'
    where i.event_id=e.id and i.detector='event-image-quality'and i.dimension='media'and i.status='open'
     and i.reviewed_by is null and i.reviewed_at is null and not(i.evidence?'governance_resolution')
     and i.issue_code in('IMAGE_CONTENT_REUSED','IMAGE_LOW_RESOLUTION','IMAGE_UNREACHABLE','IMAGE_DIMENSIONS_UNKNOWN','IMAGE_MIME_INVALID','IMAGE_TOO_SMALL','IMAGE_HASH_UNAVAILABLE')
     and jsonb_typeof(i.evidence->'url')='string'and nullif(btrim(i.evidence->>'url'),'')is not null
     and coalesce(i.evidence->>'image_role','event_artwork')in('event_artwork','cover','hero')
     and(i.evidence->>'url')is distinct from e.images[1])
  order by e.id limit greatest(0,least(coalesce(p_batch,0),5000))for update of e skip locked
 )
 select i.id from locked_events e join public.event_quality_issues i on i.event_id=e.id
 join public.event_image_quality_observations observed on observed.event_id=i.event_id and observed.image_url=i.evidence->>'url'
 where i.detector='event-image-quality'and i.dimension='media'and i.status='open'
  and i.reviewed_by is null and i.reviewed_at is null and not(i.evidence?'governance_resolution')
  and i.issue_code in('IMAGE_CONTENT_REUSED','IMAGE_LOW_RESOLUTION','IMAGE_UNREACHABLE','IMAGE_DIMENSIONS_UNKNOWN','IMAGE_MIME_INVALID','IMAGE_TOO_SMALL','IMAGE_HASH_UNAVAILABLE')
  and jsonb_typeof(i.evidence->'url')='string'and nullif(btrim(i.evidence->>'url'),'')is not null
  and coalesce(i.evidence->>'image_role','event_artwork')in('event_artwork','cover','hero')
  and(i.evidence->>'url')is distinct from e.primary_image
 order by i.id limit greatest(0,least(coalesce(p_batch,0),5000))for update of i skip locked
 loop
  if p_dry_run is distinct from false then continue;end if;
  update public.event_quality_issues set status='resolved',resolved_at=now(),resolution='superseded_primary_artwork'
   where id=r.id and status='open'and reviewed_by is null and reviewed_at is null;
  get diagnostics changed=row_count;resolved:=resolved+changed;
 end loop;
 return resolved;
end $fn$;
revoke all on function api_private.resolve_obsolete_event_image_issues(integer,text,boolean)from public,anon,authenticated;

-- Keep existing cadence, dry-run, scope, batch and lease behavior. The native
-- scanner owns finding transitions and notices the external resolved_at stamp.
do $hook$
declare target regprocedure;src text;declaration text:='v_just_resolved int:=0;';
 loop_anchor text:=E'  for r in\n    select e.* from public.events e left join public.event_quality_current qc on qc.event_id=e.id';
 return_anchor text:='''issues_seen'',v_opened,''issues_resolved'',v_resolved)';
begin
 target:=coalesce(to_regprocedure('api_private.run_event_quality_scan(integer,text,boolean)'),to_regprocedure('public.run_event_quality_scan(integer,text,boolean)'));
 if target is null then raise exception 'Native event quality scanner missing';end if;
 src:=pg_get_functiondef(target);
 if(length(src)-length(replace(src,declaration,'')))/length(declaration)<>1
  or(length(src)-length(replace(src,loop_anchor,'')))/length(loop_anchor)<>1
  or(length(src)-length(replace(src,return_anchor,'')))/length(return_anchor)<>1 then raise exception 'Event quality scanner anchor changed';end if;
 src:=replace(src,declaration,declaration||' v_obsolete_images int:=0;');
 src:=replace(src,loop_anchor,E'  v_obsolete_images:=api_private.resolve_obsolete_event_image_issues(p_batch,p_scope,p_dry_run);\n  v_resolved:=v_resolved+v_obsolete_images;\n'||loop_anchor);
 src:=replace(src,return_anchor,'''issues_seen'',v_opened,''issues_resolved'',v_resolved,''obsolete_image_issues_resolved'',v_obsolete_images)');
 execute src;
end $hook$;
