-- Full-schema, rollback-only source -> canonical schedule -> date-index check.
begin;
do $$
declare eid uuid; sid uuid; result jsonb; initial_schedule jsonb; raw_calendar jsonb; token uuid:=gen_random_uuid(); sources jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('event_source_schedule_recovery'));
 insert into public.events(title,slug,description,start_date,end_date,event_type,website,status,data_source)
 values('Source calendar recovery E2E fixture','source-calendar-recovery-e2e-fixture',
   'A source calendar integration fixture used only inside a rollback transaction.',
   current_date,current_date+interval '10 days','social',
   'https://www.agendaq.fr/fr/agenda/source-calendar-recovery-e2e-fixture','active','agendaq') returning id into eid;
 raw_calendar:=jsonb_build_object('dates',jsonb_build_array(jsonb_build_array('cal',jsonb_build_object(
   'start',current_date+1,'end',current_date+1,'tz','Europe/Paris','startH','18:00','endH','22:00','recurring',''))));
 insert into public.event_sources(event_id,source_slug,source_entity_id,source_url,payload,payload_hash,is_primary)
 values(eid,'agendaq','source-calendar-recovery-e2e-fixture',
   'https://www.agendaq.fr/fr/agenda/source-calendar-recovery-e2e-fixture',
   jsonb_build_object('raw',raw_calendar),md5(raw_calendar::text),true) returning id into sid;
 -- A newer "primary" source from a different venue with the same generic title
 -- must never supply this event's calendar.
 insert into public.event_sources(event_id,source_slug,source_entity_id,source_url,payload,payload_hash,is_primary,last_seen_at)
 values(eid,'agendaq','source-calendar-recovery-wrong-venue',
   'https://www.agendaq.fr/fr/agenda/source-calendar-recovery-wrong-venue',
   jsonb_build_object('raw',jsonb_set(raw_calendar,'{dates,0,1,startH}','"03:00"')),'wrong-venue-fixture',true,now()+interval '1 day');
 result:=public.run_event_source_schedule_recovery(1,true,array[eid]);
 assert (result->>'updated')::int=1,'source schedule dry run failed';
 assert (select schedule is null from public.events where id=eid),'dry run changed the event';
 result:=public.run_event_source_schedule_recovery(1,false,array[eid]);
 assert (result->>'updated')::int=1,'source schedule was not restored';
 assert (select schedule->>'source'='agendaq-raw' from public.events where id=eid),'source provenance missing';
 assert (select count(*)=1 from public.event_dates where event_id=eid),'schedule trigger did not create exactly one occurrence';
 assert (select (open_at at time zone 'Europe/Paris')::time='18:00'::time from public.event_dates where event_id=eid),
 'source timezone or opening time changed';
 assert (select field_provenance#>>'{source_schedule_recovery,source_record_id}'=sid::text from public.events where id=eid),
 'source record attribution missing';
 result:=public.run_event_source_schedule_recovery(1,false,array[eid]);
 assert (result->>'examined')::int=0,'unchanged source evidence was processed again';
 select schedule||'{"confidence":"authored","source":"editor"}'::jsonb into initial_schedule from public.events where id=eid;
 update public.events set schedule=initial_schedule where id=eid;
 update public.event_sources set payload_hash='changed-fixture-hash',payload=jsonb_set(payload,'{raw,dates,0,1,startH}','"19:00"') where id=sid;
 result:=public.run_event_source_schedule_recovery(1,false,array[eid]);
 assert (result->>'examined')::int=0,'curated schedule was selected for replacement';
 assert (select schedule=initial_schedule from public.events where id=eid),'curated schedule was overwritten';
 select c.sources into sources from public.claim_event_gaps('content',token,1,array[eid],true) c;
 assert jsonb_array_length(sources)=1,'content or artwork claim leaked a different venue source';
 perform public.claim_event_gaps('content',token,1,array[eid],false);
 result:=public.finish_event_gap(eid,'content',token,
   jsonb_build_object('description',repeat('Unrelated venue text ',10)),
   '{"source_url":"https://www.agendaq.fr/fr/agenda/source-calendar-recovery-wrong-venue","confidence":1}',
   'updated','{}');
 assert result->>'outcome'='review','foreign-source completion was not routed to review';
 assert (select description not like 'Unrelated%' from public.events where id=eid),'foreign source overwrote canonical content';
 assert not has_function_privilege('anon','public.run_event_source_schedule_recovery(integer,boolean,uuid[])','execute'),
 'anonymous callers can run source recovery';
end $$;
rollback;
