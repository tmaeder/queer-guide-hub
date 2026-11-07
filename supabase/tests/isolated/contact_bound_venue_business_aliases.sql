alter table organizations add column phone text;
alter table venues add column phone text,add column website text,add column address text,
  add column latitude numeric,add column longitude numeric;
create table content_revisions(source_table text,source_id uuid,actor_kind text);
create function city_canonical_key(text) returns text language sql immutable as
  'select regexp_replace(lower($1),''[^a-z0-9]'','''',''g'')';
create function org_normalize_domain(text) returns text language sql immutable as
  'select split_part(regexp_replace(lower($1),''^https?://(www[.])?'',''''),''/'',1)';
create function normalize_phone(text) returns text language sql immutable as
  'select regexp_replace($1,''[^0-9+]'','''',''g'')';
create function haversine_m(numeric,numeric,numeric,numeric) returns double precision
  language sql immutable as 'select null::double precision';

insert into fixture_ids select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()
  from generate_series(201,204) n;
insert into organizations(id,name,primary_venue_id,city_id,country_id,website,phone,field_provenance)
  select o,'Venue and Lounge '||n,d,'00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002','https://example.test/','+441234567890',
    jsonb_build_object('name',jsonb_build_object('source','venues_backfill'),
      'location_inheritance',jsonb_build_object('source_table','venues','source_id',d),
      'phone',jsonb_build_object('source','primary_venue','source_id',d,'human_reviewed',false))
  from fixture_ids where n>=201;
insert into organizations(id,name,primary_venue_id,city_id,country_id,website,phone)
  select k,'Venue '||n,v,'00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002','https://www.example.test','+441234567890'
  from fixture_ids where n>=201;
insert into venues(id,organization_id,name,duplicate_of_id,city_id,country_id,website,phone,address)
  select d,o,'Venue and Lounge '||n,v,'00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002','https://example.test/','+441234567890','100 Example Street'
  from fixture_ids where n>=201;
insert into venues(id,organization_id,name,city_id,country_id,website,phone,address)
  select v,k,'Venue '||n,'00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    case when n=202 then 'https://other.test' else 'https://www.example.test/' end,
    '+44 1234 567890','100 Example Street'
  from fixture_ids where n>=201;
insert into venue_merge_audit(id,keep_id,drop_id) select a,v,d from fixture_ids where n>=201;
insert into entity_quality_findings(entity_id) select o from fixture_ids where n>=201;
insert into content_revisions select 'organizations',o,'human' from fixture_ids where n=203;
update organizations set field_provenance=field_provenance||'{"email":{"source":"primary_venue","source_id":"00000000-0000-0000-0000-000000000099"}}'
  where id=(select o from fixture_ids where n=204);

do $test$
declare result jsonb; canonical_before jsonb;
begin
  select to_jsonb(o) into canonical_before from organizations o where id=(select k from fixture_ids where n=201);
  result:=reconcile_merged_venue_business_spines(100,true);
  assert (result->>'candidates')::int=1,'Identity or editorial evidence guard failed';
  result:=reconcile_merged_venue_business_spines(100,false);
  assert (result->>'merged')::int=1,'Confirmed venue alias was not reconciled';
  assert canonical_before=(select to_jsonb(o) from organizations o where id=(select k from fixture_ids where n=201)),
    'Surviving organization changed';
  assert (select state from entity_quality_findings where entity_id=(select o from fixture_ids where n=201))='not_applicable';
  assert not exists(select 1 from organizations o join fixture_ids f on f.o=o.id where f.n>=202 and o.duplicate_of_id is not null);
  result:=reconcile_merged_venue_business_spines(100,false);
  assert (result->>'merged')::int=0,'Contact-bound repair was not idempotent';
end $test$;
