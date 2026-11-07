-- Exact location labels and public meeting places use different resolutions.
insert into fixture_ids select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()
from generate_series(200,206) n;
insert into events(id,title,venue_name,address,start_date,city_id,country_id,latitude,longitude,data_source,external_id)
select e,case when n=201 then 'Marche des Fiertés' else 'Show '||n end,'Organizer '||n,
 case when n=201 then 'Place de la République, Paris, 75008' else 'Arts Hall '||n end,
 '2027-01-02T00:00:00Z','00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000001',48,2,'agendaq','show-'||n
from fixture_ids where n>=200;
insert into event_sources
select f.es,e.id,'agendaq',e.external_id,'https://www.agendaq.fr/fr/agenda/'||e.external_id,repeat('a',64),
 jsonb_build_object('normalized',jsonb_build_object('start_date',e.start_date,
  'location',jsonb_build_object('address',e.address)),'raw',jsonb_build_object(
  'slug',e.external_id,'name',e.title,'businesses',jsonb_build_array(jsonb_build_object('name',e.venue_name)),
  'locations',jsonb_build_array(jsonb_build_object('id',f.n,'cc','FR','lat',48,'lon',2,'label',e.address,
   'addr',jsonb_build_object('city','Paris','street',case when f.n=201 then 'Place de la République' else 'Rue Royale' end,'pc','75008')))))
from fixture_ids f join events e on e.id=f.e where f.n>=200;
insert into event_quality_issues(event_id,issue_code,status) select e,'NAMED_VENUE_UNLINKED','open' from fixture_ids where n>=200;
insert into event_quality_current(event_id,issue_codes,open_issue_codes)
select e,array['NAMED_VENUE_UNLINKED','IMAGE_MISSING'],array['NAMED_VENUE_UNLINKED','IMAGE_MISSING']
from fixture_ids where n>=200;
insert into review_queue(entity_type,entity_id,review_type,status,details)
select 'event',e,'venue_link_candidate','pending',case when n=203 then '{"manual_hold":true}'::jsonb
 else '{"candidates":[{"name":"Organizer"}]}'::jsonb end from fixture_ids where n>=200;
update event_sources set payload=jsonb_set(payload,'{raw,locations}',(payload#>'{raw,locations}')||(payload#>'{raw,locations}'))
where id=(select es from fixture_ids where n=202);
update event_sources set source_url='https://example.test/other' where id=(select es from fixture_ids where n=204);
insert into content_revisions select 'events',e,'human',array['venue_name'] from fixture_ids where n=205;
update events set is_public=false where id=(select e from fixture_ids where n=206);

do $test$
declare result jsonb;
begin
  assert not has_function_privilege('authenticated','api_private.reconcile_agendaq_location_labels(integer,boolean)','execute');
  assert has_function_privilege('service_role','api_private.reconcile_agendaq_location_labels(integer,boolean)','execute');
  result:=api_private.reconcile_agendaq_location_labels(100,true);
  assert (result->>'eligible')::int=2 and (result->>'corrected')::int=0,result::text;
  result:=run_event_venue_link();
  assert (result#>>'{source_location_labels,corrected}')::int=2,result::text;
  assert (result#>>'{source_location_labels,street_cases}')::int=1,result::text;
  assert (select venue_name from events where id=(select e from fixture_ids where n=200))='Arts Hall 200';
  assert (select venue_name from events where id=(select e from fixture_ids where n=201)) is null;
  assert not exists(select 1 from events e join fixture_ids f on f.e=e.id
    where f.n between 202 and 206 and e.venue_name is distinct from 'Organizer '||f.n);
  assert (select status from review_queue where entity_id=(select e from fixture_ids where n=200))='pending';
  assert (select details->'candidates' from review_queue where entity_id=(select e from fixture_ids where n=200))='[]';
  assert (select status from review_queue where entity_id=(select e from fixture_ids where n=201))='resolved';
  assert (select open_issue_codes from event_quality_current where event_id=(select e from fixture_ids where n=201))=array['IMAGE_MISSING'];
  result:=api_private.reconcile_agendaq_location_labels(100,false);
  assert (result->>'corrected')::int=0,result::text;

  -- A later source revision must pass the original source checks again.
  insert into venues(id,name,city_id,country_id,latitude,longitude,address,postal_code)
  select f.v,e.venue_name,e.city_id,e.country_id,48,2,'10 Rue Royale','75008'
  from fixture_ids f join events e on e.id=f.e where f.n=200;
  insert into venue_sources
  select f.vs,f.v,'agendaq','arts-hall','https://www.agendaq.fr/fr/guide/arts-hall',repeat('b',64),
   jsonb_build_object('raw',jsonb_build_object('slug','arts-hall','name','Arts Hall 200',
    'locations',s.payload#>'{raw,locations}'))
  from fixture_ids f join event_sources s on s.id=f.es where f.n=200;
  update event_sources set payload_hash=repeat('c',64) where id=(select es from fixture_ids where n=200);
  result:=reconcile_agendaq_event_venues(100,false);
  assert (result->>'linked_events')::int=0,result::text;
  update event_sources set payload_hash=repeat('a',64) where id=(select es from fixture_ids where n=200);
  result:=reconcile_agendaq_event_venues(100,false);
  assert (result->>'linked_events')::int=1,result::text;
  assert (select venue_id from events where id=(select e from fixture_ids where n=200))=
    (select v from fixture_ids where n=200);
end $test$;
