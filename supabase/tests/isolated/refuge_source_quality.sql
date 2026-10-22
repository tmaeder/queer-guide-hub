-- Run after migrations in the isolated facts-only fixture schema; every change rolls back.
\set ON_ERROR_STOP on
begin;
do $test$
declare org uuid:=gen_random_uuid(); ven uuid:=gen_random_uuid(); src uuid:=gen_random_uuid(); other uuid; original jsonb; result jsonb; k text;
begin
 insert into organizations(id,name,primary_venue_id,roles,field_provenance,description) values(org,'Test Restroom',ven,array['venue'],'{"identity":{"source":"unified_location"}}','Source directions remain assessed even when contacts/media are unavailable.');
 insert into venues(id,name,organization_id,category) values(ven,'Test Restroom',org,'toilet');
 original:='{"raw":{"id":123,"name":"Test Restroom","comment":"Directions"},"normalized":{"name":"Test Restroom","sourceId":"123","sourceName":"refuge-restrooms","description":"Directions","metadata":{"data_source":"refuge-restrooms","external_id":"123"}}}';
 insert into venue_sources(id,venue_id,source_slug,source_entity_id,payload) values(src,ven,'refuge-restrooms','123',original);
 result:=organization_facts_only_source(org);
 if result->'unavailable_dimensions' is distinct from '["contact","media"]'::jsonb then raise exception 'dimensions %',result; end if;
 -- Every supplied extra contact/media fact requires actual enrichment.
 foreach k in array array['website','email','phone','social','contacts','images','photos','image_url','cover_image_url','logo_url'] loop
  update venue_sources set payload=jsonb_set(original,array['normalized',k],'"supplied"'::jsonb) where id=src;
  if organization_facts_only_source(org) is not null then raise exception 'supplied % accepted',k; end if;
 end loop;
 update venue_sources set payload=original where id=src;
 foreach k in array array['sourceId','sourceName','name'] loop
  update venue_sources set payload=jsonb_set(original,array['normalized',k],'"mismatch"'::jsonb) where id=src;
  if organization_facts_only_source(org) is not null then raise exception 'identity % accepted',k; end if;
 end loop;
 update venue_sources set payload=jsonb_set(original,'{raw,id}','124') where id=src;
 if organization_facts_only_source(org) is not null then raise exception 'raw ID mismatch'; end if;
 update venue_sources set payload=original where id=src;
 insert into venue_sources(venue_id,source_slug) values(ven,'another') returning id into other;
 if organization_facts_only_source(org) is not null then raise exception 'multiple sources'; end if;
 delete from venue_sources where id=other;
 update venues set category='cafe' where id=ven;
 if organization_facts_only_source(org) is not null then raise exception 'wrong category'; end if;
 update venues set category='toilet' where id=ven;
 update organizations set roles=array['venue','publisher'] where id=org;
 if organization_facts_only_source(org) is not null then raise exception 'multiple roles'; end if;
 update organizations set roles=array['venue'] where id=org;
 -- Existing contracts retain their exact per-source dimensions.
 foreach k in array array['gayout','planet-randy','gays-cruising'] loop
  update venues set category=case when k='gays-cruising' then 'cruising' else 'toilet' end where id=ven;
  update venue_sources set source_slug=k,source_url=case k when 'gayout' then 'https://www.gayout.com/test' when 'planet-randy' then 'https://planet-randy.com/test' else 'https://www.gays-cruising.com/test' end,
   payload=jsonb_build_object('normalized',jsonb_build_object('name','Test Restroom','metadata',jsonb_build_object('data_source',k))) where id=src;
  result:=organization_facts_only_source(org);
  if result->'unavailable_dimensions' is distinct from (case when k='gays-cruising' then '["editorial","contact","media"]'::jsonb else '["editorial","media"]'::jsonb end) then raise exception 'existing contract % changed: %',k,result; end if;
 end loop;
 update venues set category='toilet' where id=ven;
 update venue_sources set source_slug='refuge-restrooms',source_url=null,payload=original where id=src;
 insert into entity_quality_findings(entity_type,entity_id,dimension,state,reason_code)
 select 'organization',org,d,'fail','missing' from unnest(array['contact','media','editorial']) d;
 result:=reconcile_facts_only_business_findings(50,true);
 if (result->>'source_limits_recorded')::int<>2 then raise exception 'dry run %',result; end if;
 result:=reconcile_facts_only_business_findings(50,false);
 if (result->>'source_limits_recorded')::int<>2 then raise exception 'real %',result; end if;
 if (select count(*) from entity_quality_findings where entity_id=org and state='source_unavailable')<>2 then raise exception 'actual outcomes'; end if;
 if not exists(select 1 from entity_quality_findings where entity_id=org and dimension='editorial' and state='fail') then raise exception 'editorial altered'; end if;
 if (select count(*) from business_brand_quality_events where entity_id=org)<>2 then raise exception 'missing audit'; end if;
 result:=reconcile_facts_only_business_findings(50,false);
 if (result->>'source_limits_recorded')::int<>0 then raise exception 'idempotency %',result; end if;
 update organizations set website='https://example.org',logo_url='https://example.org/logo.png' where id=org;
 update entity_quality_findings set state='fail' where entity_id=org and dimension in ('contact','media');
 result:=reconcile_facts_only_business_findings(50,false);
 if (result->>'source_limits_recorded')::int<>0 then raise exception 'supplied profile facts overwritten'; end if;
 if (select count(*) from business_brand_quality_events where entity_id=org)<>2 then raise exception 'unexpected second audit'; end if;
 update entity_quality_findings set state='source_unavailable' where entity_id=org and dimension='media';
 if not exists(select 1 from organizations where id=org and safety_gated and status='active') then raise exception 'safety changed'; end if;
 update organizations set quality_checked_at=now() where id=org;
 update venue_sources set payload_hash='new-evidence' where id=src;
 if not exists(select 1 from organizations where id=org and quality_checked_at is null) then raise exception 'cursor did not invalidate'; end if;
 raise notice 'refuge source fixtures passed';
end $test$;
rollback;
