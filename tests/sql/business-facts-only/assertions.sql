-- Isolated fixtures; run against a test schema/transaction with this migration.
begin;
insert into public.organizations(id,name,primary_venue_id,roles,field_provenance,city_id,country_id)
select md5('facts-fixture-org-'||i)::uuid,'Facts test '||i,md5('facts-fixture-venue-'||i)::uuid,
 array['venue'],jsonb_build_object('identity',jsonb_build_object('source','unified_location')),
 md5('facts-fixture-city')::uuid,md5('facts-fixture-country')::uuid from generate_series(1,7)i;
insert into public.venues(id,name,organization_id,category,city_id,country_id)
select primary_venue_id,name,id,'cruising',city_id,country_id from public.organizations where name like 'Facts test %';
insert into public.venue_sources(venue_id,source_slug,source_entity_id,payload)
select primary_venue_id,'gays-cruising',id::text,'{"normalized":{"category":"cruising"}}' from public.organizations where name like 'Facts test %';
insert into public.venue_sources(venue_id,source_slug) values(md5('facts-fixture-venue-2')::uuid,'another-source');
insert into public.venues(id,name,organization_id,category) values(md5('facts-fixture-extra-venue')::uuid,'Another branch',md5('facts-fixture-org-3')::uuid,'cruising');
update public.organizations set roles=array['venue','brand'] where id=md5('facts-fixture-org-4')::uuid;
update public.organizations set city_id=gen_random_uuid() where id=md5('facts-fixture-org-5')::uuid;
update public.venue_sources set payload='{"raw":{"description":"An actual supplied source description"}}' where venue_id=md5('facts-fixture-venue-6')::uuid;
update public.organizations set description=repeat('Actual supplied prose. ',8) where id=md5('facts-fixture-org-7')::uuid;
insert into public.entity_quality_findings(entity_type,entity_id,dimension,state,reason_code)
select 'organization',id,d,'fail','missing' from public.organizations cross join unnest(array['editorial','contact','media']) d where name like 'Facts test %';
do $$
declare result jsonb; i integer;
begin
 if public.organization_facts_only_source(md5('facts-fixture-org-1')::uuid) is null then raise exception 'Sole facts-only source was missed'; end if;
 for i in 2..6 loop
  if public.organization_facts_only_source(md5('facts-fixture-org-'||i)::uuid) is not null then raise exception 'Out-of-scope identity % was accepted',i; end if;
 end loop;
 result:=public.refresh_business_brand_quality();
 if not exists(select 1 from jsonb_array_elements(result) r where r->>'entity_id'=md5('facts-fixture-org-1')::uuid::text and r->>'state'='source_unavailable') then raise exception 'Refresh does not honor source contract'; end if;
 if not exists(select 1 from jsonb_array_elements(result) r where r->>'entity_id'=md5('facts-fixture-org-7')::uuid::text and r->>'dimension'='editorial' and r->>'state'='pass') then raise exception 'Supplied value was downgraded'; end if;
 result:=public.reconcile_facts_only_business_findings(100,true);
 if (result->>'source_limits_recorded')::int<>5 then raise exception 'Dry-run should preserve supplied facts in two scoped identities: %',result; end if;
 if exists(select 1 from public.entity_quality_findings where state='source_unavailable') then raise exception 'Dry run mutated findings'; end if;
 if exists(select 1 from public.business_brand_quality_events) then raise exception 'Dry run wrote audit'; end if;
 result:=public.reconcile_facts_only_business_findings(100,false);
 if (result->>'source_limits_recorded')::int<>5 then raise exception 'Live reconciliation did not preserve the supplied prose: %',result; end if;
 if (select count(*) from public.entity_quality_findings where state='source_unavailable')<>5 then raise exception 'Wrong disposition count'; end if;
 if (select count(*) from public.business_brand_quality_events)<>5 then raise exception 'Outcome audit incomplete'; end if;
 if exists(select 1 from public.organizations where not safety_gated or status<>'active') or exists(select 1 from public.venues where not safety_gated) then raise exception 'Safety/publication state changed'; end if;
 result:=public.reconcile_facts_only_business_findings(100,false);
 if (result->>'source_limits_recorded')::int<>0 then raise exception 'Reconciliation not idempotent: %',result; end if;
 insert into public.venue_sources(venue_id,source_slug) values(md5('facts-fixture-venue-1')::uuid,'new-source');
 if public.organization_facts_only_source(md5('facts-fixture-org-1')::uuid) is not null then raise exception 'New evidence did not invalidate source scope'; end if;
 if (select quality_checked_at from public.organizations where id=md5('facts-fixture-org-1')::uuid) is not null then raise exception 'New source did not schedule recheck'; end if;
 result:=public.refresh_business_brand_quality();
 if exists(select 1 from jsonb_array_elements(result) r where r->>'entity_id'=md5('facts-fixture-org-1')::uuid::text and r->>'state'='source_unavailable') then raise exception 'New source was ignored during refresh'; end if;
 if has_function_privilege('anon','public.reconcile_facts_only_business_findings(integer,boolean)','execute') or has_function_privilege('authenticated','public.reconcile_facts_only_business_findings(integer,boolean)','execute') then raise exception 'Internal reconciliation exposed'; end if;
end $$;
rollback;
