-- Retract city labels used as venues when the publisher provides the location on request.
begin;
set local statement_timeout='90s';
set local lock_timeout='3s';
set local app.actor='system:milchjugend-withheld-venue:v1';
do $repair$
declare dry_run boolean:=true; r record; before_issue jsonb; after_issue jsonb;
 after_event jsonb; after_review jsonb; ids uuid[]:='{}'; n integer:=0; findings integer:=0;
begin
 perform public.assert_admin_or_internal();
 if auth.uid() is not null then raise exception 'Internal actor required'; end if;
 if exists(select 1 from public.admin_automations where slug in('review_automatic_resolution','event_venue_link') and not enabled)
  then raise exception 'Review repair paused'; end if;
 if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution')) then raise exception 'Review cleanup busy'; end if;
 for r in
  select e.id,q.id review_id,s.id source_id,s.payload_hash,s.source_url,
    s.payload#>>'{raw,venue,city}' source_city,to_jsonb(e) old_event,to_jsonb(q) old_review
  from public.events e
  join public.cities c on c.id=e.city_id and c.country_id=e.country_id and c.duplicate_of_id is null
  join public.countries co on co.id=e.country_id
  join public.event_sources s on s.event_id=e.id and s.source_slug='milchjugend' and s.source_entity_id=e.external_id
  left join public.review_queue q on q.entity_id=e.id and q.entity_type='event' and q.review_type='venue_link_candidate' and q.status='pending'
  where exists(select 1 from public.admin_review_case_worklist w
    where w.family='venue' and w.item->>'subtitle' in('venue link candidate','NAMED_VENUE_UNLINKED')
      and w.item->>'entity_id'=e.id::text)
   and (q.id is null or (q.resolved_by is null and q.resolved_at is null
    and q.details=jsonb_build_object('source','venue_quality_v2','resolution','no_precision_match',
        'ambiguous',true,'candidates','[]'::jsonb,'event_venue_name',e.venue_name)))
   and e.data_source='milchjugend' and e.duplicate_of_id is null and e.venue_id is null
   and e.is_public and not e.safety_gated and e.status in('active','completed')
   and e.venue_name=c.name and e.venue_name=s.payload#>>'{raw,venue,city}'
   and e.venue_name=s.payload#>>'{raw,venue,name}' and e.venue_name=s.payload#>>'{normalized,venue_name}'
   and nullif(btrim(s.payload#>>'{raw,venue,street}'),'') is null
   and co.code=s.payload#>>'{raw,venue,country}'
   and s.payload#>>'{raw,description}' ~* 'Ort auf Anfrage per Mail'
   and s.payload#>>'{raw,title}'=e.title and s.payload#>>'{raw,key}'=e.external_id
   and s.payload#>>'{normalized,sourceId}'=e.external_id and s.payload#>>'{raw,url}'=s.source_url
   and s.source_url ~ '^https://milchjugend[.]ch/event/[^/]+/[0-9]{4}-[0-9]{2}-[0-9]{2}/$'
   and s.payload_hash~'^[a-f0-9]{64}$'
   and case when pg_input_is_valid(s.payload#>>'{raw,start}','timestamptz') then (s.payload#>>'{raw,start}')::timestamptz=e.start_date else false end
   and not coalesce(e.field_provenance,'{}') ?| array['venue_id','venue_name']
   and not exists(select 1 from public.content_revisions h where h.source_table='events' and h.source_id=e.id and h.actor_kind='human'
     and h.changed_fields&&array['venue_id','venue_name','city_id','country_id','field_provenance'])
   and not exists(select 1 from public.venues v where v.city_id=e.city_id and v.duplicate_of_id is null and v.closed_at is null
     and public.city_canonical_key(v.name)=public.city_canonical_key(e.venue_name))
   and not exists(select 1 from public.event_sources peer where peer.event_id=e.id and peer.source_slug='milchjugend' and peer.id<>s.id)
   and not exists(select 1 from public.review_queue peer where peer.entity_type='event' and peer.entity_id=e.id
     and peer.review_type='venue_link_candidate' and peer.id is distinct from q.id and (peer.status='pending' or peer.resolved_by is not null))
  order by e.id limit 100 for update of e skip locked for share of s,c skip locked
 loop
  begin
   perform 1 from public.review_queue q where q.entity_id=r.id and q.entity_type='event' and q.review_type='venue_link_candidate' for update nowait;
   perform 1 from public.event_quality_issues i where i.event_id=r.id and i.issue_code='NAMED_VENUE_UNLINKED' for update nowait;
  exception when lock_not_available then continue; end;
  if exists(select 1 from public.event_quality_issues i where i.event_id=r.id and i.issue_code='NAMED_VENUE_UNLINKED'
    and(i.reviewed_by is not null
    or ((i.reviewed_at is not null or i.resolution is not null) and not coalesce(
      i.status='accepted' and i.resolution='Accepted after exact-match review: no single unambiguous live canonical venue exists in the same city; retain the source venue name without guessing a link.',false))
    or lower(i.evidence->>'manual_hold')='true' or lower(i.evidence->>'manual_review_required')='true'))
   then continue; end if;
  if exists(select 1 from public.review_queue q where q.entity_id=r.id and q.entity_type='event'
    and q.review_type='venue_link_candidate' and (q.resolved_by is not null or
    (q.status='pending' and (q.id is distinct from r.review_id or to_jsonb(q) is distinct from r.old_review))))
   then continue; end if;
  n:=n+1; ids:=array_append(ids,r.id);
  if dry_run then continue; end if;
  update public.events e set venue_name=null,updated_at=now(),
   field_provenance=coalesce(e.field_provenance,'{}')||jsonb_build_object('venue_name',jsonb_build_object(
     'source','milchjugend_withheld_venue:v1','source_id',r.source_id,'source_url',r.source_url,'payload_hash',r.payload_hash,
     'source_city',r.source_city,'previous_value',e.venue_name,'value',null,'human_reviewed',false,'at',now()))
   where e.id=r.id returning to_jsonb(e) into after_event;
  if after_event-array['venue_name','field_provenance','updated_at'] is distinct from r.old_event-array['venue_name','field_provenance','updated_at']
   or (after_event->'field_provenance')-'venue_name' is distinct from coalesce(r.old_event->'field_provenance','{}')-'venue_name'
   then raise exception 'Protected event state changed %',r.id; end if;
  if exists(select 1 from public.event_quality_findings(r.id) f where f.issue_code='NAMED_VENUE_UNLINKED')
   then raise exception 'Native venue finding remains %',r.id; end if;
  if r.review_id is not null then
  update public.review_queue q set status='resolved',resolved_at=now(),details=q.details||jsonb_build_object(
    'resolution','publisher_withholds_venue','resolved_automatically',true,'source_city',r.source_city,'source_url',r.source_url)
   where q.id=r.review_id and to_jsonb(q)=r.old_review returning to_jsonb(q) into after_review;
  if not found then raise exception 'Review changed %',r.review_id; end if;
  insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value) values
   ('review_queue',r.review_id,'milchjugend_withheld_venue_review:v1',r.old_review,after_review);
  end if;
  insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value) values
   ('event',r.id,'milchjugend_withheld_venue:v1',r.old_event,after_event);
  for before_issue in select to_jsonb(i) from public.event_quality_issues i where i.event_id=r.id
    and i.issue_code='NAMED_VENUE_UNLINKED' and i.status='open' and i.detector='event-quality-scan'
  loop
   update public.event_quality_issues i set status='resolved',resolved_at=now(),resolution='Automatic: publisher provides the venue on request; the captured label repeats the city.'
    where i.id=(before_issue->>'id')::uuid returning to_jsonb(i) into after_issue;
   insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
    values('event_quality_issue',(before_issue->>'id')::uuid,'milchjugend_withheld_venue_finding:v1',before_issue,after_issue);
   findings:=findings+1;
  end loop;
  update public.event_quality_current set issue_codes=array_remove(issue_codes,'NAMED_VENUE_UNLINKED'),
   open_issue_codes=array_remove(open_issue_codes,'NAMED_VENUE_UNLINKED') where event_id=r.id;
 end loop;
 perform set_config('matching.milchjugend_withheld_venue_result',jsonb_build_object('dry_run',dry_run,'count',n,'findings',findings,'event_ids',ids)::text,true);
end
$repair$;
select current_setting('matching.milchjugend_withheld_venue_result')::jsonb result;
commit;
