create table fixture(n int primary key,o uuid,v uuid,old_row jsonb);
insert into fixture select n,gen_random_uuid(),gen_random_uuid(),null from generate_series(1,26)n;
insert into organizations(id,name,status,roles,field_provenance,city_id,country_id)
 select o,'Archived location '||n,'archived',array['venue'],'{"identity":{"source":"unified_location"}}',
 '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'from fixture;
insert into venues(id,organization_id,name,city_id,country_id)
 select pick.v,profile.id,profile.name,profile.city_id,profile.country_id from fixture pick join organizations profile on profile.id=pick.o;
update organizations profile set primary_venue_id=pick.v from fixture pick where profile.id=pick.o;
insert into entity_quality_findings(entity_type,entity_id,dimension,state,reason_code)
 select 'organization',o,d,'fail','original_'||d from fixture cross join unnest(array['editorial','contact','media','freshness','identity','linkage'])d;
update organizations set status='active'where id=(select o from fixture where n=2);
update venues set review_status='approved'where id=(select v from fixture where n=3);
update organizations set claim_status='claimed'where id=(select o from fixture where n=4);
update organizations set field_provenance='{"identity":{"source":"human"}}'where id=(select o from fixture where n=5);
update organizations set name='Different business'where id=(select o from fixture where n=6);
update organizations set city_id=gen_random_uuid()where id=(select o from fixture where n=7);
insert into venues(id,organization_id,review_status)select gen_random_uuid(),o,'approved'from fixture where n=8;
insert into events select gen_random_uuid(),v,'archived'from fixture where n=9;
insert into hotels(organization_id)select o from fixture where n=10;
insert into marketplace_merchants(organization_id)select o from fixture where n=11;
insert into marketplace_brands(organization_id)select o from fixture where n=12;
insert into affiliate_partners(organization_id)select o from fixture where n=13;
insert into news_sources(organization_id)select o from fixture where n=14;
update entity_quality_findings set waived_at=now()where entity_id=(select o from fixture where n=15)and dimension='media';
update entity_quality_findings set evidence=evidence||'{"governance_resolution":{"human":true}}'where entity_id=(select o from fixture where n=16)and dimension='media';
update organizations set duplicate_of_id=gen_random_uuid()where id=(select o from fixture where n=17);
update venues set duplicate_of_id=gen_random_uuid()where id=(select v from fixture where n=18);
update organizations set roles=array['venue','brand']where id=(select o from fixture where n=19);
insert into venues(id,organization_id,review_status)select gen_random_uuid(),o,'archived'from fixture where n=20;
update organizations set primary_venue_id=null where id=(select o from fixture where n=21);
update organizations set country_id=gen_random_uuid()where id=(select o from fixture where n=22);
insert into review_queue(entity_type,entity_id)select 'venue',v from fixture where n=23;
insert into review_queue(entity_type,entity_id)select 'organization',o from fixture where n=24;
update venues set needs_attention=true where id=(select v from fixture where n=25);
insert into ingestion_staging select v,'foursquare','{"metadata":{"requires_editorial_review":true}}'from fixture where n=26;
update fixture pick set old_row=to_jsonb(profile)from organizations profile where profile.id=pick.o;

do $test$
declare pick record;r jsonb;before_data text;after_data text;count_audit int;
begin
 assert not has_function_privilege('anon','reconcile_archived_business_completeness(integer,boolean,uuid[])','execute');
 assert not has_function_privilege('authenticated','reconcile_archived_business_completeness(integer,boolean,uuid[])','execute');
 for pick in select *from fixture loop
  assert(archived_business_completeness_scope(pick.o)is not null)=(pick.n in(1,20)),'Unexpected eligibility '||pick.n;
 end loop;
 select md5(jsonb_agg(to_jsonb(f)order by id)::text)into before_data from entity_quality_findings f;
 r:=reconcile_archived_business_completeness(100,true);assert(r->>'organizations_examined')::int=2,r::text;
 assert(r->>'findings_reconciled')::int=8,r::text;
 select md5(jsonb_agg(to_jsonb(f)order by id)::text)into after_data from entity_quality_findings f;
 assert before_data=after_data,'Dry run changed findings';assert not exists(select 1 from business_brand_quality_events);
 r:=reconcile_archived_business_completeness(100,false);assert(r->>'findings_reconciled')::int=8,r::text;
 assert(select count(*)=8 from business_brand_quality_events where reason_code='archived_primary_venue');
 assert(select count(*)=8 from entity_quality_findings where state='not_applicable');
 assert not exists(select 1 from entity_quality_findings where dimension in('identity','linkage')and state<>'fail');
 assert not exists(select 1 from organizations profile join fixture f on f.o=profile.id
  where to_jsonb(profile)-array['quality_dimensions','updated_at']is distinct from f.old_row-array['quality_dimensions','updated_at']);
 r:=reconcile_archived_business_completeness(100,false);assert(r->>'findings_reconciled')::int=0,r::text;
 -- First refresh sees no pending repair, so this exercises the actual native
 -- organization projection, including the producer's real conflict update.
 perform refresh_business_brand_quality();perform refresh_business_brand_quality();
 assert(select count(*)=8 from entity_quality_findings where reason_code='archived_primary_venue'and state='not_applicable');
 assert(select state='fail'from entity_quality_findings where entity_id=(select o from fixture where n=2)and dimension='contact');
 -- Restore a primary venue: the parent must be dirtied and real gaps reopened.
 update organizations set quality_checked_at=now()where id=(select o from fixture where n=1);
 update venues set review_status='approved'where id=(select v from fixture where n=1);
 assert(select quality_checked_at is null from organizations where id=(select o from fixture where n=1));
 assert archived_business_completeness_scope((select o from fixture where n=1))is null;
 perform refresh_business_brand_quality();
 assert(select state='fail'and reason_code='contact_missing'from entity_quality_findings where entity_id=(select o from fixture where n=1)and dimension='contact');
 assert(select state='pending'and reason_code='never_verified'from entity_quality_findings where entity_id=(select o from fixture where n=1)and dimension='freshness');
 -- New linked content independently invalidates the archived-only scope.
 update organizations set quality_checked_at=now()where id=(select o from fixture where n=20);
 insert into hotels(organization_id)select o from fixture where n=20;
 assert(select quality_checked_at is null from organizations where id=(select o from fixture where n=20));
 perform refresh_business_brand_quality();
 assert not exists(select 1 from entity_quality_findings where reason_code='archived_primary_venue');
 assert not exists(select 1 from organizations where safety_score<>42 or last_verified_at is not null);
end $test$;
