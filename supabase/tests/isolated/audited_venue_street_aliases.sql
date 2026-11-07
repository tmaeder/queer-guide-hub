create or replace function haversine_m(numeric,numeric,numeric,numeric) returns double precision
  language sql immutable as 'select abs($1-$3)::double precision';

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
