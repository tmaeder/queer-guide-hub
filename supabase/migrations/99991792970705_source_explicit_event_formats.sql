-- Recognize an explicit event format in an unchanged captured publisher title.
-- Never infer a sensitive category or a format from audience/description words.
create function api_private.source_explicit_event_format(p_title text)
returns text language sql immutable set search_path='' as $fn$
 with formats as (
  select 'drag' format where p_title ~* '\mdrag[ -]+(show|brunch|bingo|queen show)\M'
  union all select 'social' where p_title ~* '\m(board[ -]+game[ -]+night|support[ -]+group|discussion[ -]+group|book[ -]+club)\M'
  union all select 'sports' where p_title ~* '\m(pickleball|climb[ -]+night|climbing[ -]+night|run[ -]+walk[ -]+club|run[ -]+monday[ -]+run|run[ -]+thursday[ -]+morning[ -]+run|trans and nonbinary swim)\M'
  union all select 'workshop' where p_title ~* '\m(painting[ -]+class|meditation[ -]+class)\M'
  union all select 'art' where p_title ~* '\mart[ -]+showcase\M'
 ) select min(format) from formats having count(*)=1;
$fn$;
revoke all on function api_private.source_explicit_event_format(text) from public,anon,authenticated;
grant execute on function api_private.source_explicit_event_format(text) to service_role;

create function api_private.reconcile_source_event_formats(p_batch integer default 50,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r record;after_event jsonb;after_issue jsonb;n integer:=0;ids jsonb:='[]';
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Internal actor required';end if;
 if exists(select 1 from public.admin_automations where slug='review_automatic_resolution' and not enabled)
 then return jsonb_build_object('skipped','paused');end if;
 if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution'))
 then return jsonb_build_object('skipped','already_running');end if;
 for r in
 select e.id event_id,i.id issue_id,s.id source_id,to_jsonb(e) old_event,to_jsonb(i) old_issue,
  s.source_slug,s.source_entity_id,s.source_url,s.payload_hash,
  api_private.source_explicit_event_format(e.title) format
 from public.events e join public.event_quality_issues i on i.event_id=e.id
 join public.event_sources s on s.event_id=e.id and s.source_slug=e.data_source and s.source_entity_id=e.external_id
 where e.duplicate_of_id is null and e.event_type='other'
 and not e.field_provenance ? 'event_type'
 and api_private.source_explicit_event_format(e.title) is not null
 and i.status='open' and i.issue_code='CATEGORY_UNRESOLVED' and i.detector='event-quality-scan'
 and i.reviewed_by is null and i.reviewed_at is null and i.resolution is null
 and lower(coalesce(i.evidence->>'manual_hold','false'))<>'true'
 and lower(coalesce(i.evidence->>'manual_review_required','false'))<>'true'
 and not exists(select 1 from public.content_revisions h where h.source_table='events' and h.source_id=e.id
  and h.actor_kind='human' and h.changed_fields&&array['event_type','title','field_provenance'])
 and s.source_slug in('qcal','ticketmaster') and s.payload_hash~'^[a-f0-9]{64}$'
 and not exists(select 1 from public.event_sources other_source where other_source.event_id=e.id
  and other_source.source_slug=s.source_slug and other_source.source_entity_id=s.source_entity_id and other_source.id<>s.id)
 and s.payload#>>'{normalized,sourceId}'=e.external_id
 and coalesce(s.payload#>>'{normalized,title}',s.payload#>>'{normalized,name}')=e.title
 and case when pg_input_is_valid(coalesce(s.payload#>>'{normalized,start_date}',s.payload#>>'{normalized,dates,start}'),'timestamptz')
  then coalesce(s.payload#>>'{normalized,start_date}',s.payload#>>'{normalized,dates,start}')::timestamptz=e.start_date else false end
 and (
  s.source_slug='qcal' and s.source_url='https://qcal.app/event/'||s.source_entity_id
   and s.payload#>>'{normalized,metadata,source}'='qcal'
   and s.payload#>>'{raw,title}'=e.title and s.payload#>>'{raw,slug}'=s.source_entity_id
   and s.payload#>>'{raw,url}'=s.source_url
  or s.source_slug='ticketmaster' and s.payload#>>'{normalized,sourceName}'='ticketmaster'
   and s.payload#>>'{normalized,metadata,ticketmaster_id}'=s.source_entity_id
 )
 order by i.id limit greatest(0,least(coalesce(p_batch,0),100)) for update of e,i,s skip locked
 loop
  n:=n+1;ids:=ids||jsonb_build_array(r.event_id);
  if p_dry_run is distinct from false then continue;end if;
  update public.events e set event_type=r.format,updated_at=now(),
   field_provenance=coalesce(e.field_provenance,'{}')||jsonb_build_object('event_type',jsonb_build_object(
    'source','derived:source_explicit_event_format:v1','source_id',r.source_id,'source_slug',r.source_slug,
    'source_entity_id',r.source_entity_id,'url',r.source_url,'payload_hash',r.payload_hash,
    'publisher_title',r.old_event->>'title','previous_value','other','value',r.format,'at',now(),'human_reviewed',false))
   where e.id=r.event_id returning to_jsonb(e) into after_event;
  if (after_event-'event_type'-'field_provenance'-'updated_at') is distinct from
   (r.old_event-'event_type'-'field_provenance'-'updated_at') or
   (after_event->'field_provenance')-'event_type' is distinct from (r.old_event->'field_provenance')-'event_type'
  then raise exception 'Unexpected event content mutation %',r.event_id;end if;
  if exists(select 1 from public.event_quality_findings(r.event_id) f where f.issue_code='CATEGORY_UNRESOLVED')
  then raise exception 'Native category finding remains %',r.event_id;end if;
  update public.event_quality_issues i set status='resolved',resolved_at=now(),
   resolution='auto-source-format:v1 '||jsonb_build_object('reason','Explicit format in captured publisher title',
    'event_type',r.format,'source_id',r.source_id,'payload_hash',r.payload_hash,'human_reviewed',false)::text
   where i.id=r.issue_id returning to_jsonb(i) into after_issue;
  update public.event_quality_current set open_issue_codes=array_remove(open_issue_codes,'CATEGORY_UNRESOLVED'),
   issue_codes=array_remove(issue_codes,'CATEGORY_UNRESOLVED') where event_id=r.event_id;
  insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value) values
   ('event',r.event_id,'source_explicit_event_format:v1',r.old_event,after_event),
   ('event_quality_issue',r.issue_id,'source_explicit_event_format_finding:v1',r.old_issue,after_issue);
 end loop;
 return jsonb_build_object('dry_run',p_dry_run,'corrected_events',n,'event_ids',ids);
end $fn$;
revoke all on function api_private.reconcile_source_event_formats(integer,boolean) from public,anon,authenticated;
grant execute on function api_private.reconcile_source_event_formats(integer,boolean) to service_role;

-- Reuse the existing bounded cleanup, pause state, advisory lock and run journal.
do $hook$
declare definition text;anchor text:=$anchor$jsonb_build_object('dry_run',p_dry_run,$anchor$;
begin
 definition:=pg_get_functiondef('api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure);
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
 then raise exception 'Automatic resolution return contract changed';end if;
 execute replace(definition,anchor,'jsonb_build_object(''source_event_formats'',api_private.reconcile_source_event_formats(v_limit,p_dry_run)) || jsonb_build_object(''dry_run'',p_dry_run,');
end $hook$;
