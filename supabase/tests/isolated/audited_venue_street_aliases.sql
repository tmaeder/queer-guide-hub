create or replace function haversine_m(numeric,numeric,numeric,numeric) returns double precision
  language sql immutable as 'select abs($1-$3)::double precision';
create table cities(id uuid primary key,name text,name_local text,country_id uuid,duplicate_of_id uuid,
  shell_status text,latitude numeric,longitude numeric);
create table countries(id uuid primary key,code text);
create table venue_sources(venue_id uuid,source_slug text,source_url text,payload_hash text,payload jsonb);
create function geo_country_at(numeric,numeric) returns table(iso_a2 text)
  language sql immutable as 'select ''GB''::text';

insert into fixture_ids
select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()
from generate_series(211,214) n;
insert into organizations(id,name,primary_venue_id,city_id,country_id,field_provenance)
select o,'Old name '||n,d,'00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  jsonb_build_object('name',jsonb_build_object('source','venues_backfill'),
    'location_inheritance',jsonb_build_object('source_table','venues','source_id',d))
from fixture_ids where n between 211 and 214;
insert into organizations(id,name,primary_venue_id,city_id,country_id)
select k,'Current name '||n,v,'00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
from fixture_ids where n between 211 and 214;
insert into venues(id,organization_id,name,duplicate_of_id,city_id,country_id,address,latitude,longitude,phone)
select d,o,'Old name '||n,v,'00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002','100 Example Street'||chr(10)||'Example City',0,0,
  case when n=214 then '+441234567891' end
from fixture_ids where n between 211 and 214;
insert into venues(id,organization_id,name,city_id,country_id,address,latitude,longitude,phone)
select v,k,'Current name '||n,'00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  case when n=212 then '101 Example Street, Example City' else '100 Example Street, Example City' end,
  case when n=213 then 51 else 10 end,0,case when n=214 then '+441234567892' end
from fixture_ids where n between 211 and 214;
insert into venue_merge_audit(id,keep_id,drop_id) select a,v,d from fixture_ids where n between 211 and 214;
insert into entity_quality_findings(entity_id) select o from fixture_ids where n between 211 and 214;

do $test$
declare result jsonb;
begin
  result:=reconcile_merged_venue_business_spines(100,false);
  assert (result->>'merged')::int=1,'Only the corroborated street and pin qualify';
  assert exists(select from organizations o join fixture_ids f on f.o=o.id where f.n=211 and o.duplicate_of_id=f.k);
  assert not exists(select from organizations o join fixture_ids f on f.o=o.id
    where f.n between 212 and 214 and o.duplicate_of_id is not null);
end $test$;

-- A shared venue pin can straddle city labels. Only captures that agree on
-- the surviving street, city, country and coordinates count as corroboration.
create or replace function haversine_m(numeric,numeric,numeric,numeric) returns double precision
  language sql immutable as 'select abs($1-$3)::double precision * 100000';
insert into countries values('00000000-0000-0000-0000-000000000002','GB');
insert into cities values
 ('00000000-0000-0000-0000-000000000001','Previous City',null,
  '00000000-0000-0000-0000-000000000002',null,'real',51.4,0),
 ('00000000-0000-0000-0000-000000000003','Current City','Local Name',
  '00000000-0000-0000-0000-000000000002',null,'real',51.5,0);
insert into fixture_ids
select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()
from generate_series(221,222) n;
insert into organizations(id,name,primary_venue_id,city_id,country_id,field_provenance)
select o,'Former profile '||n,d,'00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  jsonb_build_object('identity',jsonb_build_object('source','unified_location','venue_id',d),
    'location_inheritance',jsonb_build_object('source_table','venues','source_id',d))
from fixture_ids where n between 221 and 222;
insert into organizations(id,name,primary_venue_id,city_id,country_id)
select k,'Current profile '||n,v,'00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002'
from fixture_ids where n between 221 and 222;
insert into venues(id,organization_id,name,duplicate_of_id,city_id,country_id,address,latitude,longitude)
select d,o,'Old venue '||n,v,'00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002','100 Example Street',51.50001,0
from fixture_ids where n between 221 and 222;
insert into venues(id,organization_id,name,city_id,country_id,address,latitude,longitude)
select v,k,'Current venue '||n,'00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002','100 Example Street',51.5,0
from fixture_ids where n between 221 and 222;
insert into venue_merge_audit(id,keep_id,drop_id) select a,v,d from fixture_ids where n between 221 and 222;
insert into entity_quality_findings(entity_id) select o from fixture_ids where n between 221 and 222;
insert into venue_sources
select v,'directory-'||s,'https://directory-'||s||'.test/venue',repeat('a',64),
 jsonb_build_object('normalized',jsonb_build_object('location',jsonb_build_object('city',
 case when n=222 and s=2 then 'Previous City' else 'Local Name' end,
 'country','GB','address','100 Example Street','lat',51.5,'lng',0)))
from fixture_ids cross join generate_series(1,2) s where n between 221 and 222;

do $test$
declare result jsonb;
begin
  result:=reconcile_merged_venue_business_spines(100,false);
  assert (result->>'merged')::int=1,'Only the independently corroborated locality qualifies';
  assert exists(select from organizations o join fixture_ids f on f.o=o.id where f.n=221 and o.duplicate_of_id=f.k);
  assert not exists(select from organizations o join fixture_ids f on f.o=o.id
    where f.n=222 and o.duplicate_of_id is not null);
end $test$;
