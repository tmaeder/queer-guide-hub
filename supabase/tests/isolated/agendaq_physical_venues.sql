-- All fixtures are local. Never attach this test to an existing database.
create table fixture_ids(n int primary key,e uuid,v uuid,es uuid,vs uuid);
insert into fixture_ids select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()
from generate_series(1,31) n;
insert into countries values('00000000-0000-0000-0000-000000000001','FR');
insert into cities values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001');
insert into events(id,title,venue_name,start_date,city_id,country_id,latitude,longitude)
select e,'Event '||n,'Organizer '||n,'2027-01-01',
 '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',48,2 from fixture_ids;
insert into venues(id,name,city_id,country_id,latitude,longitude)
select v,'Venue '||n,'00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',48,2 from fixture_ids;
insert into event_sources select es,e,'agendaq','event-'||n,'https://www.agendaq.fr/fr/agenda/event-'||n,'event-hash-'||n,
 jsonb_build_object('raw',jsonb_build_object('slug','event-'||n,'name','Event '||n,
 'locations',jsonb_build_array(jsonb_build_object('id',n,'cc','FR')))) from fixture_ids;
insert into venue_sources select vs,v,'agendaq','venue-'||n,'https://www.agendaq.fr/fr/guide/venue-'||n,'venue-hash-'||n,
 jsonb_build_object('raw',jsonb_build_object('slug','venue-'||n,'name','Venue '||n,
 'locations',jsonb_build_array(jsonb_build_object('id',n,'cc','FR')))) from fixture_ids;
insert into event_quality_issues(event_id,issue_code,status) select e,'NAMED_VENUE_UNLINKED','open' from fixture_ids;
insert into event_quality_current select e,array['NAMED_VENUE_UNLINKED','IMAGE_MISSING'] from fixture_ids;
insert into event_quality_issues(event_id,issue_code,status) select e,'IMAGE_MISSING','accepted' from fixture_ids;

update events set field_provenance='{"venue_id":{"human_reviewed":true}}' where id=(select e from fixture_ids where n=2);
update events set field_provenance='{"venue_name":{"source":"manual"}}' where id=(select e from fixture_ids where n=3);
update events set country_id=gen_random_uuid() where id=(select e from fixture_ids where n=4);
update events set city_id=gen_random_uuid() where id=(select e from fixture_ids where n=5);
update venues set closed_at=now() where id=(select v from fixture_ids where n=6);
update venues set duplicate_of_id=gen_random_uuid() where id=(select v from fixture_ids where n=7);
update event_sources set payload=jsonb_set(payload,'{raw,locations,0,id}','9000') where id=(select es from fixture_ids where n=8);
update event_sources set payload=jsonb_set(payload,'{raw,locations,0,approx}','true') where id=(select es from fixture_ids where n=9);
update venue_sources set payload=jsonb_set(payload,'{raw,locations,0,approx}','true') where id=(select vs from fixture_ids where n=10);
update event_sources set source_url='https://example.com/other' where id=(select es from fixture_ids where n=11);
update event_sources set payload=jsonb_set(payload,'{raw,slug}','"wrong"') where id=(select es from fixture_ids where n=12);
update venue_sources set payload=jsonb_set(payload,'{raw,slug}','"wrong"') where id=(select vs from fixture_ids where n=13);
update event_sources set payload=jsonb_set(payload,'{raw,name}','"wrong"') where id=(select es from fixture_ids where n=14);
update venue_sources set payload=jsonb_set(payload,'{raw,name}','"wrong"') where id=(select vs from fixture_ids where n=15);
update venues set category='organization' where id=(select v from fixture_ids where n=16);
update venues set latitude=49 where id=(select v from fixture_ids where n=17);
insert into review_queue(entity_type,entity_id,review_type,status,details,resolved_by)
select 'event',e,'venue_link_candidate','pending',case n
 when 18 then '{"hard_blocker":true}' when 19 then '{"requires_confirm":"true"}'
 when 20 then '{"force_review":"TRUE"}' else '{}' end::jsonb,
 case when n=21 then gen_random_uuid() end from fixture_ids where n between 18 and 21;
-- A second canonical destination at the same source location is ambiguous.
insert into venues select gen_random_uuid(),name,category,null,null,city_id,country_id,latitude,longitude
from venues where id=(select v from fixture_ids where n=22);
insert into venue_sources select gen_random_uuid(),v.id,'agendaq','second','https://www.agendaq.fr/fr/guide/second','second-hash',
 jsonb_build_object('raw',jsonb_build_object('slug','second','name',v.name,'locations',jsonb_build_array(jsonb_build_object('id',22,'cc','FR'))))
from venues v where v.name='Venue 22' and v.id<>(select v from fixture_ids where n=22);
-- Existing and competing same-title/time/venue slots are never merged implicitly.
insert into events(id,title,venue_id,start_date) select gen_random_uuid(),title,(select v from fixture_ids where n=24),start_date
from events where id=(select e from fixture_ids where n=24);
update events set title='Competing event' where id in(select e from fixture_ids where n in(25,26));
update event_sources set payload=jsonb_set(jsonb_set(payload,'{raw,name}','"Competing event"'),'{raw,locations,0,id}','25')
where id in(select es from fixture_ids where n in(25,26));
delete from event_quality_issues where event_id=(select e from fixture_ids where n=27) and issue_code='NAMED_VENUE_UNLINKED';
insert into review_queue(entity_type,entity_id,review_type,status,details)
select 'event',e,'venue_link_candidate','pending','{}' from fixture_ids where n=27;
update events set duplicate_of_id=gen_random_uuid() where id=(select e from fixture_ids where n=28);
update events set status='cancelled' where id=(select e from fixture_ids where n=29);
update events set field_provenance='{"description":{"source":"human"}}' where id=(select e from fixture_ids where n=30);
update event_sources set payload=jsonb_set(payload,'{raw,locations,0,id}','0') where id=(select es from fixture_ids where n=31);
update venue_sources set payload=jsonb_set(payload,'{raw,locations,0,id}','0') where id=(select vs from fixture_ids where n=31);

do $test$
declare r jsonb;
begin
 assert not has_function_privilege('anon','reconcile_agendaq_event_venues(integer,boolean)','execute');
 assert not has_function_privilege('authenticated','reconcile_agendaq_event_venues(integer,boolean)','execute');
 assert has_function_privilege('service_role','reconcile_agendaq_event_venues(integer,boolean)','execute');
 r:=reconcile_agendaq_event_venues(500,true);
 assert (r->>'candidates')::int=4,r::text;
 assert not exists(select 1 from events e join fixture_ids f on f.e=e.id where e.venue_id is not null),'Dry run wrote links';
 r:=reconcile_agendaq_event_venues(0,false); assert (r->>'linked_events')::int=0;
 r:=reconcile_agendaq_event_venues(1,false); assert (r->>'linked_events')::int=1;
 r:=reconcile_agendaq_event_venues(500,false); assert (r->>'linked_events')::int=3,r::text;
 assert (select count(*) from events e join fixture_ids f on f.e=e.id where e.venue_id is not null)=4;
 assert not exists(select 1 from events e join fixture_ids f on f.e=e.id where f.n not in(1,23,27,30) and e.venue_id is not null);
 assert (select field_provenance->'description' from events where id=(select e from fixture_ids where n=30))='{"source":"human"}';
 assert not exists(select 1 from event_quality_issues where issue_code='IMAGE_MISSING' and status<>'accepted');
 assert not exists(select 1 from event_quality_current c join fixture_ids f on f.e=c.event_id where not('IMAGE_MISSING'=any(c.open_issue_codes)));
 assert not exists(select 1 from events e join fixture_ids f on f.e=e.id where e.venue_id is not null and
  (e.venue_name<>'Venue '||f.n or e.field_provenance#>>'{venue_id,human_reviewed}'<>'false'));
 r:=reconcile_agendaq_event_venues(500,false); assert (r->>'linked_events')::int=0,'Not idempotent';
 r:=run_event_venue_link(); assert (r->>'linked')::int=1 and r ? 'source_location_matches',r::text;
 update admin_automations set enabled=false where slug='event_venue_link';
 r:=run_event_venue_link(); assert r->>'skipped'='true','Paused automation ran';
end $test$;
