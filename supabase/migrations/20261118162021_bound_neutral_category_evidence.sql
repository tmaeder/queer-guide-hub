-- Generate only the category evidence needed by the neutral-category policy.
-- Calling the full detector here repeats unrelated venue/source/artwork probes.
do $patch$
declare definition text:=pg_get_functiondef('public.repair_admin_review_mechanical(integer,boolean)'::regprocedure);
 detector text:=pg_get_functiondef('public.event_quality_findings(uuid)'::regprocedure);
 old_select text:='for r in select i.id,i.event_id from public.event_quality_issues i join public.events e on e.id=i.event_id';
 new_select text:='for r in select i.id,i.event_id,e.title,e.description from public.event_quality_issues i join public.events e on e.id=i.event_id';
 old_probe text:='select evidence into v_evidence from public.event_quality_findings(r.event_id) where issue_code=''CATEGORY_UNRESOLVED'';';
 new_probe text:='v_evidence:=jsonb_build_object(''event_type'',''other'',''classifier_version'',1,''inference'',public.infer_event_type(r.title,r.description));';
 old_lock text:='order by i.id limit greatest(0,least(200,p_batch)) for update of i skip locked loop';
 new_lock text:=$lock$and i.reviewed_by is null and i.reviewed_at is null and i.resolution is null
 and e.duplicate_of_id is null
 and not(coalesce(i.evidence,'{}') ?| array['manual_hold','manual_review_required','governance_resolution'])
 order by i.id limit greatest(0,least(200,p_batch)) for update of i,e skip locked loop$lock$;
begin
 if position($detector$jsonb_build_object(
      'event_type',event_type,'classifier_version',1,
      'inference',public.infer_event_type(title,description))
      from e where event_type='other'$detector$in detector)=0
 then raise exception 'Category detector evidence changed';end if;
 if position(new_select in definition)>0 and position(new_probe in definition)>0 and position(new_lock in definition)>0 then return;end if;
 if position(old_select in definition)=0 or position(old_probe in definition)=0 or position(old_lock in definition)=0 then raise exception 'Neutral category policy changed';end if;
 definition:=replace(replace(replace(definition,old_select,new_select),old_probe,new_probe),old_lock,new_lock);
 execute definition;
end $patch$;
