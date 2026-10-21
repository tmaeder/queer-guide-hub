begin;
insert into public.organizations(id,name,primary_venue_id,roles,field_provenance,city_id,country_id)
select md5('specific-org-'||i)::uuid,'Specific test '||i,md5('specific-venue-'||i)::uuid,
 array['venue'],'{"identity":{"source":"unified_location"}}',md5('specific-city')::uuid,md5('specific-country')::uuid
 from generate_series(1,11)i;
insert into public.venues(id,name,organization_id,category,city_id,country_id)
select primary_venue_id,name,id,case when name='Specific test 11' then 'cruising' else 'bar' end,city_id,country_id
from public.organizations;
insert into public.venue_sources(venue_id,source_slug,source_entity_id,source_url,payload)
select primary_venue_id,case name when 'Specific test 2' then 'planet-randy' when 'Specific test 11' then 'gays-cruising' else 'gayout' end,
 id::text,case when name='Specific test 2' then 'https://planet-randy.com/blog/en/eintrag/example/' else 'https://www.gayout.com/europe/example/city/bars/example-123' end,
 jsonb_build_object('normalized',jsonb_build_object('name',name,'metadata',jsonb_build_object('data_source',case when name='Specific test 2' then 'planet-randy' else 'gayout' end)))
from public.organizations;
update public.venue_sources set payload='{"raw":{"source_name":"gayout"}}' where venue_id=md5('specific-venue-3')::uuid;
update public.venue_sources set payload=payload||'{"raw":{"description":"Supplied source text must not be discarded"}}' where venue_id=md5('specific-venue-4')::uuid;
update public.venue_sources set payload=payload||'{"enriched":{"images":["https://example.com/image.jpg"]}}' where venue_id=md5('specific-venue-5')::uuid;
update public.venue_sources set payload=jsonb_set(payload,'{normalized,contacts}','{"website":"https://example.com"}') where venue_id=md5('specific-venue-6')::uuid;
update public.venue_sources set payload=jsonb_set(payload,'{normalized,name}','"Another venue"') where venue_id=md5('specific-venue-7')::uuid;
update public.venue_sources set source_url='https://gayout.com.example.org/wrong' where venue_id=md5('specific-venue-8')::uuid;
insert into public.venue_sources(venue_id,source_slug) values(md5('specific-venue-9')::uuid,'second-source');
update public.organizations set description=repeat('Actual venue text. ',6),images=array['https://example.com/owned.jpg'] where id=md5('specific-org-10')::uuid;
update public.venue_sources set payload=jsonb_set(payload,'{normalized,contacts}','{"website":"https://example.com"}') where venue_id=md5('specific-venue-11')::uuid;
insert into public.entity_quality_findings(entity_type,entity_id,dimension,state,reason_code)
select 'organization',id,d,'fail','missing' from public.organizations cross join unnest(array['editorial','contact','media']) d;
do $$
declare result jsonb; i integer; contract jsonb;
begin
 foreach i in array array[1,2,6,10] loop
  contract:=public.organization_facts_only_source(md5('specific-org-'||i)::uuid);
  if contract->'unavailable_dimensions' is distinct from '["editorial","media"]'::jsonb then raise exception 'Wrong source-specific dimensions for %: %',i,contract; end if;
 end loop;
 foreach i in array array[3,4,5,7,8,9,11] loop
  if public.organization_facts_only_source(md5('specific-org-'||i)::uuid) is not null then raise exception 'Unsupported source/identity % was accepted',i; end if;
 end loop;
 result:=public.refresh_business_brand_quality();
 if (select count(*) from jsonb_array_elements(result) r where r->>'entity_id'=md5('specific-org-1')::uuid::text and r->>'state'='source_unavailable')<>2 then raise exception 'Producer does not apply exactly two source limits'; end if;
 if not exists(select 1 from jsonb_array_elements(result) r where r->>'entity_id'=md5('specific-org-6')::uuid::text and r->>'dimension'='contact' and r->>'state'='fail') then raise exception 'Supplied source contact was incorrectly exhausted'; end if;
 if not exists(select 1 from jsonb_array_elements(result) r where r->>'entity_id'=md5('specific-org-10')::uuid::text and r->>'dimension'='editorial' and r->>'state'='pass') then raise exception 'Existing prose was downgraded'; end if;
 result:=public.reconcile_facts_only_business_findings(100,true);
 if result->>'source_limits_recorded'<>'6' or result->>'organizations_examined'<>'3' then raise exception 'Unexpected scope/dry count %',result; end if;
 if exists(select 1 from public.business_brand_quality_events) then raise exception 'Dry run wrote audit'; end if;
 result:=public.reconcile_facts_only_business_findings(100,false);
 if result->>'source_limits_recorded'<>'6' then raise exception 'Unexpected real outcome %',result; end if;
 if exists(select 1 from public.entity_quality_findings where dimension='contact' and state<>'fail') then raise exception 'Contact gap was hidden'; end if;
 result:=public.reconcile_facts_only_business_findings(100,false);
 if result->>'source_limits_recorded'<>'0' or result->>'organizations_examined'<>'0' then raise exception 'Remaining contact gaps starve repeated passes %',result; end if;
 if (select count(*) from public.business_brand_quality_events)<>6 then raise exception 'Audit incomplete'; end if;
 if exists(select 1 from public.organizations where not safety_gated or status<>'active') then raise exception 'Safety/publication changed'; end if;
 insert into public.venue_sources(venue_id,source_slug) values(md5('specific-venue-1')::uuid,'new-evidence');
 if (select quality_checked_at from public.organizations where id=md5('specific-org-1')::uuid) is not null then raise exception 'New evidence did not invalidate quality cursor'; end if;
 if public.organization_facts_only_source(md5('specific-org-1')::uuid) is not null then raise exception 'New evidence did not invalidate source limit'; end if;
end $$;
rollback;
