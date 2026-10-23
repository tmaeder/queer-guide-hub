
create table fixture_ids(n int primary key,o uuid,v uuid,s uuid);
insert into fixture_ids select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid() from generate_series(1,45) n;
insert into countries values('00000000-0000-0000-0000-000000000001','FR');
insert into organizations(id,name,primary_venue_id,city_id,country_id)
select o,'Source venue '||n,v,'00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001' from fixture_ids;
insert into venues(id,organization_id,name,city_id,country_id)
select primary_venue_id,id,name,city_id,country_id from organizations;
insert into entity_quality_findings(entity_type,entity_id,dimension) select 'organization',o,'contact' from fixture_ids;
insert into entity_quality_findings(entity_type,entity_id,dimension,state) select 'organization',o,'editorial','fail' from fixture_ids;
insert into venue_sources(id,venue_id,source_slug,source_url,payload)
select f.s,f.v,'agendaq','https://www.agendaq.fr/fr/guide/venue-'||f.n,
 jsonb_build_object('raw',jsonb_build_object('name',o.name,'slug','venue-'||f.n,'data',
 case when n between 16 and 30 then jsonb_build_object('phone','+33123456789')
 when n>30 then jsonb_build_object('socials',jsonb_build_array(jsonb_build_object('socialPlatform','instagram','socialId','https://www.instagram.com/venue_'||n)))
 else '{}'::jsonb end), 'normalized',case when n<=15 then jsonb_build_object('contacts',jsonb_build_object('website','https://venue-'||n||'.example')) else '{}'::jsonb end)
from fixture_ids f join organizations o on o.id=f.o;
update organizations set name='Human corrected identity' where id in(select o from fixture_ids where (n-1)%15=1);
update organizations set field_provenance=jsonb_build_object(case when n<=15 then 'website' when n<=30 then 'phone' else 'social' end,
 jsonb_build_object('human_reviewed',true)) from fixture_ids where id=o and (n-1)%15=2;
update entity_quality_findings set waived_at=now() where dimension='contact' and entity_id in(select o from fixture_ids where (n-1)%15=3);
update organizations set duplicate_of_id=gen_random_uuid() where id in(select o from fixture_ids where (n-1)%15=4);
insert into venue_sources(id,venue_id,source_slug,source_url,payload)
select gen_random_uuid(),v,'agendaq','https://www.agendaq.fr/fr/guide/venue-'||n,
 jsonb_build_object('raw',jsonb_build_object('name','Source venue '||n,'slug','venue-'||n,'data',
 case when n=21 then jsonb_build_object('phone','+33987654321') when n=36 then jsonb_build_object('socials',
 jsonb_build_array(jsonb_build_object('socialPlatform','instagram','socialId','https://www.instagram.com/different_profile'))) else '{}'::jsonb end),
 'normalized',case when n=6 then '{"contacts":{"website":"https://conflict.example"}}'::jsonb else '{}'::jsonb end)
from fixture_ids where (n-1)%15=5;
update venue_sources set source_slug='unknown' where id in(select s from fixture_ids where (n-1)%15=6);
update organizations set roles=array['hotel'] where id in(select o from fixture_ids where (n-1)%15=7);
insert into venues(id,organization_id,name) select gen_random_uuid(),o,'Second location' from fixture_ids where (n-1)%15=8;
update organizations set country_id=gen_random_uuid() where id in(select o from fixture_ids where (n-1)%15=9);
update organizations set email='existing@example.com' where id in(select o from fixture_ids where (n-1)%15=10);
update venue_sources set payload=jsonb_set(payload,'{normalized,contacts,website}','"https://www.facebook.com/directory"') where id=(select s from fixture_ids where n=12);
update venue_sources set payload=jsonb_set(payload,'{raw,data,phone}','"bad number"') where id=(select s from fixture_ids where n=27);
update venue_sources set payload=jsonb_set(payload,'{raw,data,socials}','[{"socialPlatform":"instagram","socialId":"https://evil.example/not-instagram"}]') where id=(select s from fixture_ids where n=42);
update organizations set status='archived' where id in(select o from fixture_ids where (n-1)%15=12);
update venues set closed_at=now() where id in(select v from fixture_ids where (n-1)%15=13);
update entity_quality_findings set state='pass' where dimension='contact' and entity_id in(select o from fixture_ids where (n-1)%15=14);

do $test$
declare r jsonb;b text;a text;bf text;af text;
begin
 assert not has_function_privilege('anon','reconcile_business_source_socials(integer,boolean)','execute');
 assert not has_function_privilege('authenticated','reconcile_business_source_websites(integer,boolean)','execute');
 assert has_function_privilege('service_role','reconcile_business_source_phones(integer,boolean)','execute');
 select md5(jsonb_agg(jsonb_build_object('org',to_jsonb(o)-'website'-'phone'-'social'-'updated_at'-'field_provenance'-'quality_dimensions',
 'human_provenance',o.field_provenance,'quality',o.quality_dimensions-'contact') order by id)::text) into b from organizations o;
 select md5(jsonb_agg(to_jsonb(f) order by id)::text) into bf from entity_quality_findings f where dimension<>'contact';
 update organizations set website_domain='different.example' where id=(select o from fixture_ids where n=1);
 r:=reconcile_business_source_websites(100,true);assert (r->>'candidates')::int=0,'Curated conflicting domain was ignored';
 update organizations set website_domain='venue-1.example' where id=(select o from fixture_ids where n=1);
 r:=reconcile_business_source_websites(100,true);assert (r->>'candidates')::int=1,'Matching domain blocked';
 update organizations set website_domain=null,field_provenance='{"website_domain":{"human_reviewed":true}}' where id=(select o from fixture_ids where n=1);
 r:=reconcile_business_source_websites(100,true);assert (r->>'candidates')::int=0,'Owned domain metadata was ignored';
 update organizations set field_provenance='{}' where id=(select o from fixture_ids where n=1);
 r:=reconcile_business_source_websites(100,true);assert (r->>'candidates')::int=1,r::text;
 r:=reconcile_business_source_phones(100,true);assert (r->>'candidates')::int=1,r::text;
 r:=reconcile_business_source_socials(100,true);assert (r->>'candidates')::int=1,r::text;
 assert (select count(*) from business_brand_quality_events)=0;
 r:=reconcile_business_source_websites(0,false);assert (r->>'changed')::int=0;
 r:=reconcile_business_source_phones(0,false);assert (r->>'changed')::int=0;
 r:=reconcile_business_source_socials(0,false);assert (r->>'changed')::int=0;
 r:=refresh_business_brand_quality();assert (r->>'existing_producer')::boolean;
 assert (select count(*) from business_brand_quality_events)=3;
 assert (select count(*) from organizations where website is not null)=1;
 assert (select count(*) from organizations where phone is not null)=1;
 assert (select count(*) from organizations where social<>'{}')=1;
 assert not exists(select 1 from business_brand_quality_events b join fixture_ids f on f.o=b.entity_id where n not in(1,16,31));
 assert (select count(*) from entity_quality_findings where dimension='contact' and state='pass')=6;
 assert not exists(select 1 from organizations where last_verified_at is not null or safety_score<>42);
 select md5(jsonb_agg(jsonb_build_object('org',to_jsonb(o)-'website'-'phone'-'social'-'updated_at'-'field_provenance'-'quality_dimensions',
 'human_provenance',case when id in(select o from fixture_ids where n in(1,16,31)) then '{}'::jsonb else field_provenance end,
 'quality',o.quality_dimensions-'contact') order by id)::text) into a from organizations o;
 select md5(jsonb_agg(to_jsonb(f) order by id)::text) into af from entity_quality_findings f where dimension<>'contact';
 assert a=b,'Protected org fields changed';assert af=bf,'Unrelated findings changed';
 r:=reconcile_business_source_websites(100,false);assert (r->>'changed')::int=0;
 r:=reconcile_business_source_phones(100,false);assert (r->>'changed')::int=0;
 r:=reconcile_business_source_socials(100,false);assert (r->>'changed')::int=0;
end $test$;
-- A malformed provider field must not crash the bounded producer.
update venue_sources set payload=jsonb_set(payload,'{raw,data,socials}','{}') where id=(select s from fixture_ids where n=42);
select reconcile_business_source_socials(100,true);
