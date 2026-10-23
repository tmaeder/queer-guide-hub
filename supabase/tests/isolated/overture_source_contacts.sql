-- New source contracts cannot turn an arbitrary imported URL into a pass.
insert into fixture_ids select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid() from generate_series(46,56) n;
insert into organizations(id,name,primary_venue_id,city_id,country_id)
 select o,'Source venue '||n,v,'00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001'
 from fixture_ids where n>=46;
insert into venues(id,organization_id,name,city_id,country_id)
 select primary_venue_id,id,name,city_id,country_id from organizations where id in(select o from fixture_ids where n>=46);
insert into entity_quality_findings(entity_type,entity_id,dimension)
 select 'organization',o,'contact' from fixture_ids where n>=46;
insert into venue_sources(id,venue_id,source_slug,source_entity_id,source_url,payload)
 select f.s,f.v,'overture',f.o::text,'https://stac.overturemaps.org/2026-10-21.0/places/place/collection.json',
 jsonb_build_object('contract','overture_contact_capture:v1','raw',raw.place,
 'normalized',jsonb_build_object('contacts',jsonb_build_object('website','https://venue-'||f.n||'.example')),
 'capture',jsonb_build_object('window_complete',true,'release','2026-10-21.0',
 'source_url','https://stac.overturemaps.org/2026-10-21.0/places/place/collection.json','payload_text',jsonb_build_array(raw.place)::text,
 'payload_sha256',encode(extensions.digest(jsonb_build_array(raw.place)::text,'sha256'),'hex'),
 'website_probe',jsonb_build_object('usable',true,'status',200,'prefix_sha256',repeat('a',64),
 'identity',jsonb_build_object('name_match',true,'street_match',true))))
 from fixture_ids f cross join lateral(select jsonb_build_object('id',f.o,'operating_status','open','confidence',.99,
 'websites',jsonb_build_array('https://venue-'||f.n||'.example'),'sources',jsonb_build_array(jsonb_build_object('license','CDLA-Permissive-2.0')))place)raw
 where f.n>=46;
update venue_sources set payload=payload-'contract' where id=(select s from fixture_ids where n=47);
update venue_sources set payload=jsonb_set(payload,'{capture,payload_sha256}',to_jsonb(repeat('b',64))) where id=(select s from fixture_ids where n=48);
update venue_sources set payload=jsonb_set(payload,'{raw,operating_status}','"closed"') where id=(select s from fixture_ids where n=49);
update venue_sources set payload=jsonb_set(payload,'{raw,confidence}','0.5') where id=(select s from fixture_ids where n=50);
update venue_sources set payload=jsonb_set(payload,'{raw,sources}','[{"license":"unknown"}]') where id=(select s from fixture_ids where n=51);
update venue_sources set payload=jsonb_set(payload,'{raw,websites}','["https://one.example","https://two.example"]') where id=(select s from fixture_ids where n=52);
update venue_sources set payload=jsonb_set(payload,'{capture,window_complete}','false') where id=(select s from fixture_ids where n=53);
update venue_sources set payload=jsonb_set(payload,'{capture,website_probe,identity,name_match}','false') where id=(select s from fixture_ids where n=54);
update venue_sources set payload=jsonb_set(payload,'{capture,website_probe,identity,street_match}','false') where id=(select s from fixture_ids where n=55);
update venue_sources set payload=payload#-'{capture,website_probe,identity}' where id=(select s from fixture_ids where n=56);
do $test$
declare r jsonb;
begin
 r:=reconcile_business_source_websites(100,true);assert(r->>'candidates')::integer=1,r::text;
 assert(select count(*)from organizations where id in(select o from fixture_ids where n>=46)and website is not null)=0;
 r:=reconcile_business_source_websites(100,false);assert(r->>'changed')::integer=1,r::text;
 assert(select website='https://venue-46.example'from organizations where id=(select o from fixture_ids where n=46));
 assert(select count(*)from organizations where id in(select o from fixture_ids where n>=47)and website is not null)=0;
 assert(select count(*)from business_brand_quality_events)=4;
 assert(select count(*)from organizations where last_verified_at is not null or safety_score<>42)=0;
 r:=reconcile_business_source_websites(100,false);assert(r->>'changed')::integer=0,r::text;
 assert not has_function_privilege('authenticated','reconcile_business_source_websites(integer,boolean)','execute');
end $test$;
