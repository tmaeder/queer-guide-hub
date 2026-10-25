-- Default dry run. Close only untouched legacy date warnings whose existing
-- occurrence is positively confirmed by a fresh official calendar capture.
-- The event row, schedule, publication state and every other finding stay intact.
begin;
set local statement_timeout='60s';set local lock_timeout='2s';
set local app.actor='system:official-event-calendar:v1';
do $repair$
declare dry_run boolean:=true;batch_size integer:=20;r record;after_row jsonb;
 eligible integer:=0;resolved integer:=0;capture_ids jsonb:='{}';capture_id bigint;
begin
 perform public.assert_admin_or_internal();
 if auth.uid()is not null then raise exception 'Internal calendar verification actor required';end if;
 if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution'))then raise exception 'Review sweep is running';end if;
 if exists(select 1 from public.admin_automations where slug='review_automatic_resolution'and not enabled)
 then raise exception 'Automatic resolution is paused';end if;
 for r in
 with input as(
  select *from jsonb_to_recordset(coalesce(nullif(current_setting('matching.event_calendar_proofs',true),''),'[]')::jsonb)
   as x(finding_id uuid,event_id uuid,external_id text,data_source text,title text,start_date timestamptz,
    expected_finding_hash text,expected_event_hash text,verified_entry jsonb,contract text,human_reviewed boolean)
 ),single as(select finding_id from input group by finding_id having count(*)=1),captures as(
  select *from jsonb_to_recordset(coalesce(nullif(current_setting('matching.event_calendar_captures',true),''),'[]')::jsonb)
   as c(source text,url text,observed_at timestamptz,sha256 text,body text)
 ),single_capture as(select sha256 from captures group by sha256 having count(*)=1)
 select x.*,to_jsonb(q)old_review,to_jsonb(e)old_event,to_jsonb(c)capture
 from input x join single using(finding_id)
 join public.review_queue q on q.id=x.finding_id and q.entity_id=x.event_id and q.entity_type in('event','events')
 join public.events e on e.id=x.event_id
 join public.countries co on co.id=e.country_id
 left join public.event_sources s on s.event_id=e.id and s.source_slug=e.data_source and s.source_entity_id=e.external_id
 join captures c on c.sha256=x.verified_entry->>'capture_sha256' and c.source=e.data_source
 join single_capture sc on sc.sha256=c.sha256
 where q.review_type='date_mismatch'and q.status='pending'and q.resolved_at is null and q.resolved_by is null
 and q.details->>'source'='event-agentic-enrich'
 and not(coalesce(q.details,'{}')?'auto_resolution')
 and coalesce(lower(q.details->>'hard_blocker'),'false')<>'true'
 and coalesce(lower(q.details->>'requires_confirm'),'false')<>'true'
 and coalesce(lower(q.details->>'force_review'),'false')<>'true'
 and coalesce(lower(q.details->>'human_reviewed'),'false')<>'true'
 and e.duplicate_of_id is null and e.data_source=x.data_source and e.external_id=x.external_id
 and e.title=x.title and e.start_date=x.start_date
 and md5(to_jsonb(q)::text)=x.expected_finding_hash and md5(to_jsonb(e)::text)=x.expected_event_hash
 and x.contract='official_event_calendar.v1'and x.human_reviewed=false
 and case when pg_input_is_valid(q.details->>'start_date','timestamp with time zone')
  then(q.details->>'start_date')::timestamptz=e.start_date else false end
 and x.verified_entry->>'source_key'=e.external_id
 and case when pg_input_is_valid(x.verified_entry->>'start_date','timestamp with time zone')
  then(x.verified_entry->>'start_date')::timestamptz=e.start_date else false end
 and regexp_replace(lower(x.verified_entry->>'title'),'[^[:alnum:]]','','g')in(
  regexp_replace(lower(e.title),'[^[:alnum:]]','','g'),
  regexp_replace(lower(coalesce(s.payload#>>'{normalized,title}',s.payload#>>'{normalized,name}')),'[^[:alnum:]]','','g'))
 and c.observed_at between now()-interval '1 hour'and now()+interval '5 minutes'
 and octet_length(c.body)between 1 and 3000000 and c.sha256=encode(extensions.digest(c.body,'sha256'),'hex')
 and case e.data_source
  when 'bka-theater'then co.code='DE'and c.url='https://www.bka-theater.de/spielplan/'and x.verified_entry->>'url'like 'https://www.bka-theater.de/%'
   and q.details->>'page'in(x.verified_entry->>'url','https://www.bka-theater.de/content_start.php?id='||split_part(e.external_id,':',1)||'&tid='||(x.verified_entry->>'performance_id'))
  when 'lab-oratory'then co.code='DE'and c.url='https://www.lab-oratory.de/'and x.verified_entry->>'url'like 'https://www.lab-oratory.de/%'
   and rtrim(q.details->>'page','/')in('https://www.lab-oratory.de',rtrim(x.verified_entry->>'url','/'))
  when 'haz-ch'then co.code='CH'and c.url~'^https://haz[.]ch/wp-json/tribe/events/v1/events[?]per_page=50&page=[1-9][0-9]?$'
   and x.verified_entry->>'url'like 'https://haz.ch/event/%'
   and rtrim(q.details->>'page','/')=rtrim(x.verified_entry->>'url','/')else false end
 and not exists(select 1 from public.content_revisions v where v.source_table='events'and v.source_id=e.id
  and v.actor_kind='human'and v.changed_fields&&array['start_date','end_date','external_id','data_source','website','url'])
 order by q.id limit greatest(0,least(batch_size,50))for update of q,e skip locked
 loop
  eligible:=eligible+1;if dry_run then continue;end if;
  capture_id:=(capture_ids->>(r.capture->>'sha256'))::bigint;
  if capture_id is null then
   insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
    values('review_source_capture',gen_random_uuid(),'official_event_calendar_capture',null,r.capture)
    returning id into capture_id;
   capture_ids:=capture_ids||jsonb_build_object(r.capture->>'sha256',capture_id);
  end if;
  update public.review_queue q set status='resolved',resolved_at=now(),
   details=q.details||jsonb_build_object('auto_resolution','Existing event date confirmed by its official occurrence calendar',
    'official_calendar_verification',jsonb_build_object('contract',r.contract,'source_url',r.capture->>'url',
     'observed_at',r.capture->>'observed_at','capture_sha256',r.capture->>'sha256','capture_repair_id',capture_id,
     'occurrence',r.verified_entry,'human_reviewed',false,'event_changed',false))
   where q.id=r.finding_id returning to_jsonb(q)into after_row;
  if after_row-array['status','resolved_at','details']is distinct from r.old_review-array['status','resolved_at','details']
   or(after_row->'details')-array['auto_resolution','official_calendar_verification']is distinct from r.old_review->'details'
   or(select to_jsonb(e)from public.events e where e.id=r.event_id)is distinct from r.old_event
  then raise exception 'Calendar verification changed protected state %',r.finding_id;end if;
  insert into public.admin_review_repairs(entity_type,entity_id,reason,previous_value,next_value)
   values('review_queue',r.finding_id,'official_event_calendar_date_confirmed',r.old_review,after_row);
  resolved:=resolved+1;
 end loop;
 perform set_config('matching.event_calendar_result',jsonb_build_object('dry_run',dry_run,'eligible',eligible,'resolved',resolved)::text,false);
end $repair$;
select current_setting('matching.event_calendar_result')::jsonb result;
commit;
