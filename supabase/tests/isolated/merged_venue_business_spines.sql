create table fixture_ids(n integer primary key,o uuid,k uuid,d uuid,v uuid,a uuid);
insert into fixture_ids select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid() from generate_series(1,33)n;
insert into fixture_ids select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid() from generate_series(101,112)n;
insert into organizations(id,name,primary_venue_id,city_id,country_id,field_provenance)
 select o,'Imported business '||n,d,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
 jsonb_build_object('identity',jsonb_build_object('source','unified_location','venue_id',d)) from fixture_ids;
insert into organizations(id,name,primary_venue_id,city_id,country_id)
 select k,'Canonical business '||n,v,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002' from fixture_ids where n<100;
insert into venues(id,organization_id,name,duplicate_of_id,city_id,country_id)
 select d,o,'Imported venue '||n,v,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002' from fixture_ids;
insert into venues(id,organization_id,name,city_id,country_id)
 select v,case when n<100 then k else o end,'Canonical venue '||n,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002' from fixture_ids;
insert into venue_merge_audit(id,keep_id,drop_id) select a,v,d from fixture_ids;
insert into entity_quality_findings(entity_id) select o from fixture_ids;

update organizations set claimed_by=gen_random_uuid() where id in(select o from fixture_ids where n in(2,102));
update organizations set last_verified_at=now() where id in(select o from fixture_ids where n in(3,103));
update organizations set field_provenance=jsonb_set(field_provenance,'{identity,source}','"human"') where id in(select o from fixture_ids where n=4);
update organizations set city_id=gen_random_uuid() where id in(select o from fixture_ids where n in(5,105));
update organizations set country_id=gen_random_uuid() where id in(select o from fixture_ids where n=6);
delete from venue_merge_audit where id in(select a from fixture_ids where n in(7,107));
update venue_merge_audit set undone_at=now() where id in(select a from fixture_ids where n in(8,108));
update venues set duplicate_of_id=gen_random_uuid() where id in(select v from fixture_ids where n=9);
update venues set closed_at=now() where id in(select v from fixture_ids where n in(10,110));
update organizations set duplicate_of_id=gen_random_uuid() where id in(select k from fixture_ids where n=11);
update organizations set status='archived' where id in(select k from fixture_ids where n=12);
update organizations set roles=array['hotel'] where id in(select o from fixture_ids where n=13);
insert into venues(id,organization_id,name) select gen_random_uuid(),o,'Independent active place' from fixture_ids where n in(14,109);
update organizations set field_provenance=jsonb_set(field_provenance,'{identity,venue_id}',to_jsonb(gen_random_uuid())) where id in(select o from fixture_ids where n=15);
update organizations set field_provenance=field_provenance||'{"website":{"human_reviewed":true}}' where id in(select o from fixture_ids where n=16);
update organizations set website='https://donor.example/' where id in(select o from fixture_ids where n=17);
update entity_quality_findings set waived_at=now() where entity_id in(select o from fixture_ids where n=18);
insert into hotels select o from fixture_ids where n=19;
insert into marketplace_brands select o from fixture_ids where n=20;
insert into marketplace_merchants select o from fixture_ids where n=21;
insert into affiliate_partners select o from fixture_ids where n=22;
insert into news_sources select o from fixture_ids where n=23;
insert into organizations(id,name,duplicate_of_id) select gen_random_uuid(),'Existing duplicate child',o from fixture_ids where n=24;
insert into org_slug_redirects select o from fixture_ids where n=25;
insert into org_link_suggestions select o from fixture_ids where n=26;
insert into venues(id,organization_id,name,duplicate_of_id) select gen_random_uuid(),o,'Different canonical owner',gen_random_uuid() from fixture_ids where n=27;
update organizations set status='draft' where id in(select o from fixture_ids where n in(28,29));
update organizations set description='mutate-in-merge' where id in(select k from fixture_ids where n=29);
update organizations set field_provenance=jsonb_set(field_provenance,'{identity,human_reviewed}','true') where id in(select o from fixture_ids where n in(30,104));
update organizations set claim_status='pending' where id in(select o from fixture_ids where n=31);
update venues set country_id=gen_random_uuid() where id in(select v from fixture_ids where n=32);
update organizations set field_provenance=field_provenance||'{"location_inheritance":{"human_reviewed":true}}' where id in(select o from fixture_ids where n=33);
update organizations set field_provenance=field_provenance||'{"primary_venue_id":{"human_reviewed":true}}' where id in(select o from fixture_ids where n=106);
update organizations set safety_gated=true where id in(select o from fixture_ids where n=111);
update organizations set status='archived' where id in(select o from fixture_ids where n=112);

-- Candidate comparison may only see an actual keyed merge pair, even with
-- thousands of unrelated active profiles available to a nested-loop plan.
insert into organizations(id,name,status,roles,primary_venue_id,field_provenance)
 select gen_random_uuid(),'Unrelated profile '||n,'active',array['venue'],gen_random_uuid(),
 '{"identity":{"source":"unified_location"}}'::jsonb from generate_series(1,2001)n;
create sequence gap_comparison_calls;
create or replace function merge_gap_patch(text,survivor jsonb,donor jsonb) returns jsonb language plpgsql as $comparison$
begin
 if not exists(select 1 from fixture_ids where o=(donor->>'id')::uuid and k=(survivor->>'id')::uuid)then
  raise exception 'Compared unrelated business identities';end if;
 perform nextval('gap_comparison_calls');
 return case when donor->>'website' is not null and survivor->>'website' is null then jsonb_build_object('website',donor->'website')else '{}'::jsonb end;
end $comparison$;
do $bounded$
declare r jsonb;
begin
 r:=reconcile_merged_venue_business_spines(1,true);
 assert(r->>'candidates')::int=1,'Incompatible candidates must not consume the qualifying batch';
 assert(select last_value from gap_comparison_calls)=2,'Compared more than the two actual keyed candidates';
end $bounded$;

do $test$
declare r jsonb;before text;rejected boolean;helper text;
begin
 assert not has_function_privilege('anon','reconcile_merged_venue_business_spines(integer,boolean)','execute');
 assert not has_function_privilege('authenticated','repoint_merged_primary_venues(integer,boolean)','execute');
 assert has_function_privilege('service_role','reconcile_merged_venue_business_spines(integer,boolean)','execute');
 select md5(jsonb_agg(to_jsonb(o) order by id)::text) into before from organizations o;
 r:=reconcile_merged_venue_business_spines(100);assert (r->>'candidates')::int=1 and (r->>'merged')::int=0,'Ownership, lifecycle, linkage or audit guard failed';
 r:=repoint_merged_primary_venues(100);assert (r->>'candidates')::int=1 and (r->>'changed')::int=0,'Primary identity or safety guard failed';
 assert before=(select md5(jsonb_agg(to_jsonb(o) order by id)::text) from organizations o),'Default dry run wrote data';
 r:=reconcile_merged_venue_business_spines(0,false);assert (r->>'candidates')::int=0;
 r:=repoint_merged_primary_venues(0,false);assert (r->>'changed')::int=0;
 assert not exists(select 1 from entity_merge_audit) and not exists(select 1 from business_brand_quality_events),'Zero batch wrote data';
 -- Interactive refresh retains its old behavior without automatic actor reuse.
 perform set_config('test.actor',gen_random_uuid()::text,true);
 r:=refresh_business_brand_quality();assert r->>'existing_producer'='true';
 foreach helper in array array['reconcile_merged_venue_business_spines','repoint_merged_primary_venues'] loop
  rejected:=false;
  begin execute format('select %I(1,false)',helper);
  exception when raise_exception then
   assert sqlerrm in('Automatic spine repairs require an internal actor','Automatic primary repairs require an internal actor');rejected:=true;
  end;
  assert rejected,'Human actor reached automatic helper';
 end loop;
 assert not exists(select 1 from entity_merge_audit) and not exists(select 1 from business_brand_quality_events);
 perform set_config('test.actor','',true);
 -- A future native merge-core regression must roll the entire repair back.
 update organizations set status='draft' where id=(select o from fixture_ids where n=1);
 update organizations set status='active' where id=(select o from fixture_ids where n=29);
 rejected:=false;
 begin perform reconcile_merged_venue_business_spines(100,false);
 exception when raise_exception then assert sqlerrm='Canonical organization unexpectedly changed';rejected:=true;end;
 assert rejected and not exists(select 1 from entity_merge_audit),'Canonical mutation was not rolled back';
 assert (select description from organizations where id=(select k from fixture_ids where n=29))='mutate-in-merge';
 update organizations set status='active' where id=(select o from fixture_ids where n=1);
 update organizations set status='draft' where id=(select o from fixture_ids where n=29);
 r:=reconcile_merged_venue_business_spines(100,false);assert (r->>'merged')::int=1;
 assert (select duplicate_of_id from organizations where id=(select o from fixture_ids where n=1))=(select k from fixture_ids where n=1);
 assert (select organization_id from venues where id=(select d from fixture_ids where n=1))=(select k from fixture_ids where n=1);
 assert (select state from entity_quality_findings where entity_id=(select o from fixture_ids where n=1))='not_applicable';
 assert (select count(*) from entity_merge_audit where actor is null and details#>>'{automatic_spine_repair,policy}'='audited_venue_merge_orphan:v1')=1;
 r:=reconcile_merged_venue_business_spines(100,false);assert (r->>'merged')::int=0,'Merge did not converge';
 r:=repoint_merged_primary_venues(100,false);assert (r->>'changed')::int=1;
 assert (select primary_venue_id from organizations where id=(select o from fixture_ids where n=101))=(select v from fixture_ids where n=101);
 assert (select count(*) from business_brand_quality_events where reason_code='primary_venue_merge_followup')=1;
 r:=repoint_merged_primary_venues(100,false);assert (r->>'changed')::int=0,'Pointer repair did not converge';
end $test$;
