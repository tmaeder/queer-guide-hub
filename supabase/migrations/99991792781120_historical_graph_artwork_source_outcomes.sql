-- Registered archived Gaycities event records can supply a Facebook API
-- reference instead of a reusable artwork file. Record that narrow importer
-- limitation explicitly; do not call a failed image a successful audit.
create or replace function api_private.historical_graph_artwork_scope(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $scope$
declare e public.events;s public.event_sources;ld jsonb;image jsonb;fact jsonb;item jsonb;values_array jsonb;
 api_reference text;candidate text;source_count integer:=0;declared_exclusion boolean:=false;
 records jsonb:='[]';semantics jsonb:='[]';proof jsonb;context jsonb;
begin
 select * into e from public.events where id=p_event_id;
 if not found or e.duplicate_of_id is not null or e.status is distinct from 'completed'
  or coalesce(e.end_date,e.start_date)is null or coalesce(e.end_date,e.start_date)>=now()-interval '1 day'
  or e.start_date is null or coalesce(e.external_id,'')!~'^[1-9][0-9]*$'
  or coalesce(cardinality(e.images),0)>1 then return null;end if;
 if (e.field_provenance->'images'is not null and jsonb_typeof(e.field_provenance->'images')not in('object','null'))
  or coalesce(e.field_provenance#>>'{images,human_reviewed}','false')='true'
  or coalesce(e.field_provenance#>>'{images,actor_kind}','')='human'
  or coalesce(e.field_provenance#>>'{images,source}','')in('human','manual','user_submission','admin_upload')
  or exists(select 1 from public.content_revisions revision where revision.source_table='events' and revision.source_id=e.id
   and revision.actor_kind='human' and revision.changed_fields&&array['images'])
  or exists(select 1 from public.event_quality_issues issue where issue.event_id=e.id and issue.dimension='media'and(
   issue.reviewed_by is not null
   or(issue.status='accepted'and coalesce(issue.resolution,'')not like 'auto-source-artwork-unavailable:v1 %')
   or(issue.status='open'and(issue.severity='critical'or issue.reviewed_at is not null
    or(nullif(issue.resolution,'')is not null and issue.resolution not like 'auto-source-artwork-unavailable:invalidated:v1 %')))))
   then return null;end if;
 for s in select * from public.event_sources where event_id=e.id order by id loop
  source_count:=source_count+1;
  if source_count>10 or s.source_slug is distinct from 'gaycities' or s.source_entity_id is distinct from e.external_id
   or coalesce(length(s.payload_hash),0)<16 or s.source_url is null
   or s.source_url!~'^https://[a-z0-9-]+[.]gaycities[.]com/events/[1-9][0-9]*-[^[:space:]?#]+$'
   or split_part(regexp_replace(s.source_url,'^https://[^/]+/events/',''),'-',1)<>s.source_entity_id
   or s.payload#>>'{raw,url}' is distinct from s.source_url
   or s.payload#>'{raw,fromWayback}' is distinct from 'true'::jsonb
   or s.payload#>'{normalized,metadata,from_wayback}' is distinct from 'true'::jsonb
   then return null;end if;
  ld:=s.payload#>'{raw,jsonLd}';
  if jsonb_typeof(ld)is distinct from 'object' or ld->'_legacyTemplate'is distinct from 'true'::jsonb
   or left(ld->>'startDate',10)is distinct from left(e.start_date::text,10)
   or nullif(btrim(ld->>'name'),'')is null
   or btrim(regexp_replace(lower(extensions.unaccent(ld->>'name')),'[^[:alnum:]]+',' ','g'))
    is distinct from btrim(regexp_replace(lower(extensions.unaccent(e.title)),'[^[:alnum:]]+',' ','g'))
   then return null;end if;
  image:=ld->'image';
  if jsonb_typeof(image)is distinct from 'array' then return null;end if;
  if jsonb_array_length(image)<>1 or jsonb_typeof(image->0)is distinct from 'string' then return null;end if;
  candidate:=regexp_replace(image->>0,'^http:','https:');
  if candidate!~'^https://graph[.]facebook[.]com/[1-9][0-9]*/picture([?&]type=(large|normal|square))?$'
   or (api_reference is not null and candidate<>api_reference)then return null;end if;
  api_reference:=candidate;
  -- Any other supplied image must be recovered, rather than called unavailable.
  for fact in select value from jsonb_array_elements(jsonb_build_array(
   ld->'thumbnailUrl',ld->'thumbnail',ld->'primaryImageOfPage',
   s.payload#>'{raw,images}',s.payload#>'{raw,image_url}',s.payload#>'{raw,photos}',s.payload#>'{raw,cover_image_url}',
   s.payload#>'{normalized,images}',s.payload#>'{normalized,image_url}',s.payload#>'{normalized,imageUrl}',
   s.payload#>'{normalized,metadata,image_url}',s.payload#>'{enriched,images}',s.payload#>'{enriched,image_url}',
   s.payload#>'{enriched,imageUrl}',s.payload#>'{enriched,photos}'))loop
   if fact is null or fact in('null'::jsonb,'""'::jsonb,'[]'::jsonb,'{}'::jsonb)then continue;end if;
   if jsonb_typeof(fact)='string'then values_array:=jsonb_build_array(fact);
   elsif jsonb_typeof(fact)='array'then values_array:=fact;else return null;end if;
   for item in select value from jsonb_array_elements(values_array)loop
    if jsonb_typeof(item)is distinct from 'string'
     or regexp_replace(item#>>'{}','^http:','https:')<>api_reference then return null;end if;
   end loop;
  end loop;
  declared_exclusion:=declared_exclusion or (
   s.payload#>>'{normalized,metadata,artwork_exclusion,contract}'='gaycities-wayback-graph-artwork:v1'
   and s.payload#>>'{normalized,metadata,artwork_exclusion,outcome}'='source_unavailable'
   and s.payload#>>'{normalized,metadata,artwork_exclusion,reason}'='api_reference_excluded'
   and s.payload#>>'{normalized,metadata,artwork_exclusion,api_reference}'=api_reference
   and s.payload#>'{normalized,metadata,artwork_exclusion,human_reviewed}'='false'::jsonb);
  records:=records||jsonb_build_array(jsonb_build_object('id',s.id,'source_slug',s.source_slug,
   'source_entity_id',s.source_entity_id,'source_url',s.source_url,'payload_hash',s.payload_hash));
  semantics:=semantics||jsonb_build_array(jsonb_build_object('id',s.id,'source_entity_id',s.source_entity_id,
   'source_url',s.source_url,'api_reference',api_reference,'source_name',ld->>'name','source_date',left(ld->>'startDate',10)));
 end loop;
 if source_count=0 or api_reference is null then return null;end if;
 if coalesce(cardinality(e.images),0)=1 and regexp_replace(e.images[1],'^http:','https:')<>api_reference then return null;end if;
 select jsonb_build_object('image_url',observation.image_url,'http_status',observation.http_status,
  'mime_type',observation.mime_type,'reason',observation.failure_reason,'observed_at',observation.checked_at)
 into proof from public.event_image_quality_observations observation
 where observation.event_id=e.id and regexp_replace(observation.image_url,'^http:','https:')=api_reference
  and observation.probe_status='fail' and observation.http_status in(200,400)
  and observation.mime_type like 'application/json%'
 order by observation.checked_at desc limit 1;
 if proof is null and not(coalesce(cardinality(e.images),0)=0 and coalesce(declared_exclusion,false))then return null;end if;
 context:=jsonb_build_object('event_id',e.id,'title',e.title,'external_id',e.external_id,
  'start_date',e.start_date,'end_date',e.end_date,'status',e.status,'images',coalesce(to_jsonb(e.images),'[]'),
  'source_semantics',semantics,'contract','gaycities-wayback-graph-artwork:v1');
 return jsonb_build_object('contract','gaycities-wayback-graph-artwork:v1','outcome','source_unavailable',
  'reason','The registered archived event importer supplies an API reference, not reusable artwork; no alternative artwork is supplied by its registered records.',
  'api_reference',api_reference,'source_records',records,'non_image_response',proof,
  'importer_exclusion',coalesce(declared_exclusion,false),'human_reviewed',false,
  'context_hash',encode(extensions.digest(context::text,'sha256'),'hex'));
end $scope$;
revoke all on function api_private.historical_graph_artwork_scope(uuid)from public,anon,authenticated;
grant execute on function api_private.historical_graph_artwork_scope(uuid)to service_role;

create function public.reconcile_historical_graph_artwork(p_batch integer default 500,p_dry_run boolean default true,p_event_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $repair$
declare candidate record;e public.events;old_e jsonb;after_e jsonb;scope jsonb;issue record;note text;
 examined integer:=0;removed integer:=0;recorded integer:=0;issues_count integer;ids uuid[]:='{}';
 source_count integer;locked_sources integer;current_locked boolean;
begin
 perform public.assert_admin_or_internal();
 if auth.uid()is not null then raise exception 'Internal source outcomes only';end if;
 if coalesce(cardinality(p_event_ids),0)>1000 then raise exception 'At most one thousand event identities';end if;
 if not pg_try_advisory_xact_lock(hashtext('historical_graph_artwork'))then
  return jsonb_build_object('skipped',true,'reason','already_running');end if;
 perform set_config('app.actor','system:historical-graph-artwork:v1',true);
 for candidate in
  select evt.id from public.events evt where evt.duplicate_of_id is null and evt.status='completed'
  and coalesce(evt.end_date,evt.start_date)<now()-interval '1 day'
  and (p_event_ids is null or evt.id=any(p_event_ids))
  and (coalesce(cardinality(evt.images),0)=0 or evt.images[1]like 'https://graph.facebook.com/%' or evt.images[1]like 'http://graph.facebook.com/%')
  and exists(select 1 from public.event_sources src where src.event_id=evt.id and src.source_slug='gaycities'
   and src.payload#>'{raw,fromWayback}'='true'::jsonb and src.payload#>'{raw,jsonLd,_legacyTemplate}'='true'::jsonb)
  and (p_event_ids is not null or coalesce(cardinality(evt.images),0)>0 or exists(
   select 1 from public.event_quality_issues i where i.event_id=evt.id and i.status='open' and i.reviewed_by is null
    and i.issue_code in('IMAGE_UNREACHABLE','IMAGE_MIME_INVALID','IMAGE_MISSING')))
  -- Protected low-ID records must not starve later repairs on each tick.
  and api_private.historical_graph_artwork_scope(evt.id)is not null
  order by evt.id limit greatest(0,least(coalesce(p_batch,500),1000))
 loop
  if not coalesce(p_dry_run,true)then
   select * into e from public.events where id=candidate.id for update skip locked;
   if not found then continue;end if;
   -- Take source locks before issue writes. The scan calls this preparation
   -- before acquiring its current/issue locks, and repeats it after findings.
   select count(*)into source_count from public.event_sources where event_id=e.id;
   perform 1 from public.event_sources where event_id=e.id order by id for share skip locked;
   get diagnostics locked_sources=row_count;
   if locked_sources<>source_count then continue;end if;
   -- Preserve the scanner's current -> issues lock order. If another scanner
   -- holds a snapshot, leave this event to that scanner rather than waiting.
   perform 1 from public.event_quality_current where event_id=e.id for update skip locked;
   current_locked:=found;
   if not current_locked and exists(select 1 from public.event_quality_current where event_id=e.id)then continue;end if;
  else select * into e from public.events where id=candidate.id;end if;
  scope:=api_private.historical_graph_artwork_scope(e.id);if scope is null then continue;end if;
  examined:=examined+1;
  select count(*)into issues_count from public.event_quality_issues i where i.event_id=e.id and i.status='open'
   and i.reviewed_by is null and (i.issue_code='IMAGE_MISSING' or (
    i.issue_code in('IMAGE_UNREACHABLE','IMAGE_MIME_INVALID')
    and regexp_replace(i.evidence->>'url','^http:','https:')=scope->>'api_reference'
    and i.evidence->>'http_status'in('200','400') and i.evidence->>'mime_type'like 'application/json%'));
  if coalesce(p_dry_run,true)then
   removed:=removed+case when coalesce(cardinality(e.images),0)>0 then 1 else 0 end;
   recorded:=recorded+issues_count;ids:=array_append(ids,e.id);continue;
  end if;
  if coalesce(cardinality(e.images),0)>0 then
   old_e:=to_jsonb(e);
   update public.events set images='{}',updated_at=now(),field_provenance=coalesce(field_provenance,'{}')||jsonb_build_object('images',
    jsonb_build_object('source','historical-source-artwork','outcome','source_unavailable','contract',scope,
     'previous_value',old_e->'images','previous_provenance',old_e->'field_provenance'->'images','human_reviewed',false))where id=e.id;
   select to_jsonb(evt)into after_e from public.events evt where evt.id=e.id;
   if after_e-array['images','field_provenance','updated_at']is distinct from old_e-array['images','field_provenance','updated_at']
    or(after_e->'field_provenance')-'images'is distinct from(old_e->'field_provenance')-'images'
    then raise exception 'Unexpected historical image correction %',e.id;end if;
   insert into public.event_quality_signals(event_id,signal_type,value,source,details)
    values(e.id,'enrichment',1,'historical-source-artwork',jsonb_build_object('outcome','source_unavailable',
     'contract',scope,'previous_images',old_e->'images','public_artwork_verified',false,'human_reviewed',false));
   removed:=removed+1;scope:=api_private.historical_graph_artwork_scope(e.id);
   if scope is null then raise exception 'Source contract changed during correction %',e.id;end if;
  end if;
  note:='auto-source-artwork-unavailable:v1 '||scope::text;
  for issue in select i.*from public.event_quality_issues i where i.event_id=e.id and i.status='open' and i.reviewed_by is null
   and(i.issue_code='IMAGE_MISSING' or(i.issue_code in('IMAGE_UNREACHABLE','IMAGE_MIME_INVALID')
    and regexp_replace(i.evidence->>'url','^http:','https:')=scope->>'api_reference'
    and i.evidence->>'http_status'in('200','400')and i.evidence->>'mime_type'like 'application/json%'))
   order by i.id for update skip locked
  loop
   perform public.decide_event_quality_issue(issue.id,'accepted',note);recorded:=recorded+1;
  end loop;
  if current_locked then
   update public.event_quality_current qc set open_issue_codes=(select coalesce(array_agg(i.issue_code order by i.issue_code),'{}')
    from public.event_quality_issues i where i.event_id=e.id and i.status='open')where qc.event_id=e.id;
  end if;
  if issues_count>0 or coalesce(cardinality(e.images),0)>0 then ids:=array_append(ids,e.id);end if;
 end loop;
 return jsonb_build_object('dry_run',coalesce(p_dry_run,true),'events_examined',examined,
  'invalid_references_removed',removed,'source_outcomes_recorded',recorded,'event_ids',to_jsonb(ids));
end $repair$;
revoke all on function public.reconcile_historical_graph_artwork(integer,boolean,uuid[])from public,anon,authenticated;
grant execute on function public.reconcile_historical_graph_artwork(integer,boolean,uuid[])to service_role;

create function api_private.invalidate_historical_graph_artwork()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $invalidate$
declare affected uuid[];affected_id uuid;scope jsonb;issue record;previous jsonb;missing boolean;
 invalidated integer;prefix text:='auto-source-artwork-unavailable:v1 ';
begin
 if tg_table_name='event_sources'then
  affected:=array[case when tg_op<>'DELETE'then new.event_id end,case when tg_op<>'INSERT'then old.event_id end];
 else affected:=array[new.id];end if;
 for affected_id in select distinct id from unnest(affected)id where id is not null loop
  scope:=api_private.historical_graph_artwork_scope(affected_id);invalidated:=0;
  -- Current snapshots are locked before issues, matching the scanner. Never
  -- turn a provider/source update into an issues -> current lock inversion.
  if not exists(select 1 from public.event_quality_issues pending where pending.event_id=affected_id
   and pending.status='accepted' and pending.reviewed_by is null and left(pending.resolution,length(prefix))=prefix
   and case when pg_input_is_valid(substring(pending.resolution from length(prefix)+1),'jsonb')then
    scope is null or scope->>'context_hash'is distinct from
     (substring(pending.resolution from length(prefix)+1)::jsonb->>'context_hash')else false end)then continue;end if;
  delete from public.event_quality_current qc where qc.event_id=affected_id;
  for issue in select i.*from public.event_quality_issues i where i.event_id=affected_id and i.status='accepted'
   and i.reviewed_by is null and i.issue_code in('IMAGE_MISSING','IMAGE_UNREACHABLE','IMAGE_MIME_INVALID')
   and left(i.resolution,length(prefix))=prefix order by i.id for update
  loop
   if not pg_input_is_valid(substring(issue.resolution from length(prefix)+1),'jsonb')then continue;end if;
   previous:=substring(issue.resolution from length(prefix)+1)::jsonb;
   if scope is not null and scope->>'context_hash'=previous->>'context_hash'then continue;end if;
   select coalesce(cardinality(evt.images),0)=0 into missing from public.events evt where evt.id=affected_id;
   if issue.issue_code='IMAGE_MISSING' and coalesce(missing,false)then
    update public.event_quality_issues set status='open',resolved_at=null,reviewed_at=null,
     resolution='auto-source-artwork-unavailable:invalidated:v1 '||jsonb_build_object(
      'reason','Registered source artwork, occurrence, or ownership context changed; native reassessment required',
      'previous_resolution',left(issue.resolution,50000))::text where id=issue.id;
   else
    update public.event_quality_issues set status='resolved',resolved_at=now(),reviewed_at=now(),
     resolution='auto-source-artwork-unavailable:superseded:v1 '||jsonb_build_object(
      'reason','The old API reference no longer describes the current artwork context; native assessment owns new findings',
      'previous_resolution',left(issue.resolution,50000))::text where id=issue.id;
   end if;
   invalidated:=invalidated+1;
  end loop;
  if invalidated>0 then
   insert into public.event_quality_signals(event_id,signal_type,value,source,details)
    values(affected_id,'enrichment',0,'historical-source-artwork',jsonb_build_object(
     'outcome','source_context_changed','source_outcomes_invalidated',invalidated,'human_reviewed',false));
  end if;
 end loop;
 return coalesce(new,old);
end $invalidate$;
revoke all on function api_private.invalidate_historical_graph_artwork()from public,anon,authenticated;

create trigger invalidate_historical_graph_artwork_source
after insert or update or delete on public.event_sources
for each row execute function api_private.invalidate_historical_graph_artwork();
create trigger invalidate_historical_graph_artwork_event
after update of title,external_id,start_date,end_date,status,images,field_provenance on public.events
for each row when(old.title is distinct from new.title or old.external_id is distinct from new.external_id
 or old.start_date is distinct from new.start_date or old.end_date is distinct from new.end_date
 or old.status is distinct from new.status or old.images is distinct from new.images
 or old.field_provenance->'images'is distinct from new.field_provenance->'images')
execute function api_private.invalidate_historical_graph_artwork();

-- Prepare source/event locks before assessment, then classify any new missing
-- artwork finding before the native open-code snapshot is calculated. Physical
-- quality scores and issue evidence remain owned by the existing scanner.
do $scan_hook$
declare target regprocedure;src text;before_anchor text:='q:=public.compute_event_quality(r.id);';
 after_anchor text:='select coalesce(array_agg(issue_code order by issue_code),''{}'') into v_open';
begin
 target:=coalesce(to_regprocedure('api_private.run_event_quality_scan(integer,text,boolean)'),
  to_regprocedure('public.run_event_quality_scan(integer,text,boolean)'));
 src:=pg_get_functiondef(target);
 if(length(src)-length(replace(src,before_anchor,'')))/length(before_anchor)<>1
  or(length(src)-length(replace(src,after_anchor,'')))/length(after_anchor)<>1 then
  raise exception 'Event quality scan source-outcome hook changed';end if;
 src:=replace(src,before_anchor,$before$if auth.uid()is null then
      perform public.reconcile_historical_graph_artwork(1,p_dry_run,array[r.id]);
    end if;
    $before$||before_anchor);
 src:=replace(src,after_anchor,$after$if auth.uid()is null then
      perform public.reconcile_historical_graph_artwork(1,false,array[r.id]);
    end if;
    $after$||after_anchor);
 execute src;
end $scan_hook$;

-- Retain the normal repair job's cadence, pause controls and dry-run semantics.
do $repair_hook$
declare target regprocedure;src text;declaration text:='v_update jsonb;';
 loop_anchor text:='for r in select distinct e.* from public.events e';
 return_anchor text:='''source_copy_absence'',v_source_copy_absence);';
begin
 target:=coalesce(to_regprocedure('api_private.run_event_quality_repairs(integer,boolean)'),
  to_regprocedure('public.run_event_quality_repairs(integer,boolean)'));
 src:=pg_get_functiondef(target);
 if(length(src)-length(replace(src,declaration,'')))/length(declaration)<>1
  or(length(src)-length(replace(src,loop_anchor,'')))/length(loop_anchor)<>1
  or(length(src)-length(replace(src,return_anchor,'')))/length(return_anchor)<>1 then
  raise exception 'Event quality repair source-outcome hook changed';end if;
 src:=replace(src,declaration,declaration||' v_source_artwork jsonb;');
 src:=replace(src,loop_anchor,$hook$if auth.uid()is null then
    v_source_artwork:=public.reconcile_historical_graph_artwork(p_batch,p_dry_run);
   else v_source_artwork:=jsonb_build_object('skipped',true,'reason','internal_source_outcomes_only');end if;
   $hook$||loop_anchor);
 src:=replace(src,return_anchor,'''source_copy_absence'',v_source_copy_absence,''source_artwork'',v_source_artwork);');
 execute src;
end $repair_hook$;

