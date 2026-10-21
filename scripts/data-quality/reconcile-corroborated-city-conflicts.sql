-- Explicit source-checked city identity conflicts from city request 58248.
-- Default dry run. Same country, live source-selected settlement, both exact
-- current source names, <=15 km and original unmerged identities are required.
-- This is an allowlisted repair, not a general nearby-place merge heuristic.
-- Islip, Distrito Federal and Tucuman are excluded for administrative scope.
-- Existing merge_cities records every reparented row and supports unmerge.
begin;
do $repair$
declare dry_run boolean:=true; r jsonb; k public.cities; d public.cities; result jsonb; before_venues bigint; results jsonb:='[]'::jsonb;
begin
 for r in select value from jsonb_array_elements($source$
[
  {
    "drop_id": "440b0a54-341c-4b8f-b770-6a001a64c1cc",
    "drop_name": "Mecca",
    "keep_id": "55bf9c08-eeea-4b12-8474-89b2f39ee7bc",
    "keep_name": "Makkah",
    "wikidata_qid": "Q5806",
    "country_code": "SA",
    "distance_m": 5346.46051407681,
    "drop_source_name": "Mecca",
    "keep_source_name": "Makkah",
    "source_url": "https://www.wikidata.org/wiki/Q5806",
    "source_sha256": "f3e8bdf2b29c7a9f6fcf29a7cf0d2e1188ca9a222581a9848839a18dca75a8c2",
    "scope_needs_review": false,
    "eligible": true
  },
  {
    "drop_id": "5adc0d39-b1a9-485e-9443-8d2d22f9f33b",
    "drop_name": "Lourenço Marques",
    "keep_id": "93e017dd-8a3e-47b1-ae23-5c8179cd0627",
    "keep_name": "Maputo",
    "wikidata_qid": "Q3889",
    "country_code": "MZ",
    "distance_m": 2190.74177205476,
    "drop_source_name": "Lourenço Marques",
    "keep_source_name": "Maputo",
    "source_url": "https://www.wikidata.org/wiki/Q3889",
    "source_sha256": "28e176ff04fd82d9cfbd6d7c2c2f516f3f74be02fc2e4d578cdd0c99551f540b",
    "scope_needs_review": false,
    "eligible": true
  },
  {
    "drop_id": "77b7e972-930f-4526-abe4-f87750efa46d",
    "drop_name": "Port St. Lucie",
    "keep_id": "b8a3f423-8273-4530-b084-97ee0f106395",
    "keep_name": "Port Saint Lucie",
    "wikidata_qid": "Q667749",
    "country_code": "US",
    "distance_m": 9868.71105499941,
    "drop_source_name": "Port St. Lucie",
    "keep_source_name": "Port Saint Lucie",
    "source_url": "https://www.wikidata.org/wiki/Q667749",
    "source_sha256": "671136874ae278eb7e80609621cbdcb03b097fcf58052dfd50f9bcc53b7d03e9",
    "scope_needs_review": false,
    "eligible": true
  },
  {
    "drop_id": "8cdd7e4a-e0d0-4de6-aa99-33990e1ac33f",
    "drop_name": "Москва",
    "keep_id": "18b887a3-09cc-419c-bcac-08597e24edb1",
    "keep_name": "Moscow",
    "wikidata_qid": "Q649",
    "country_code": "RU",
    "distance_m": 5307.71119810905,
    "drop_source_name": "Москва",
    "keep_source_name": "Moscow",
    "source_url": "https://www.wikidata.org/wiki/Q649",
    "source_sha256": "1a0930cdcec544cafe83e86ed98e11b6b0c57ea8da610f471914c886ef016a0f",
    "scope_needs_review": false,
    "eligible": true
  },
  {
    "drop_id": "8f80bddd-5c1f-4219-8d0d-8cb0d9af207c",
    "drop_name": "Chittagong",
    "keep_id": "0cddf9d9-7dc8-46f5-b934-d7ef402bd14e",
    "keep_name": "Chattogram",
    "wikidata_qid": "Q376749",
    "country_code": "BD",
    "distance_m": 5393.55305203788,
    "drop_source_name": "Chittagong",
    "keep_source_name": "Chattogram",
    "source_url": "https://www.wikidata.org/wiki/Q376749",
    "source_sha256": "9d4022f9feed45605788be101ac234f910dca6e3c1b5eb54576e0feae564ccaf",
    "scope_needs_review": false,
    "eligible": true
  },
  {
    "drop_id": "9c695daf-6a4b-4ba1-b95a-515f96822071",
    "drop_name": "Ho Chi Minh City",
    "keep_id": "3e36cafb-19b1-4913-b536-25533eec300b",
    "keep_name": "Thành phố Hồ Chí Minh",
    "wikidata_qid": "Q1854",
    "country_code": "VN",
    "distance_m": 10965.2494905252,
    "drop_source_name": "Ho Chi Minh City",
    "keep_source_name": "Thành phố Hồ Chí Minh",
    "source_url": "https://www.wikidata.org/wiki/Q1854",
    "source_sha256": "f5ae9da80a229f738ce10e9d33f758850d1942dfa97c68b37cea988adacea775",
    "scope_needs_review": false,
    "eligible": true
  },
  {
    "drop_id": "a01cdf4f-1b49-462b-be34-360f0e18cc64",
    "drop_name": "Khartum",
    "keep_id": "b72cf551-35fa-4bbc-9f77-3026eeaca4d9",
    "keep_name": "Khartoum",
    "wikidata_qid": "Q1963",
    "country_code": "SD",
    "distance_m": 12770.789393811,
    "drop_source_name": "Khartum",
    "keep_source_name": "Khartoum",
    "source_url": "https://www.wikidata.org/wiki/Q1963",
    "source_sha256": "2af460052322babeb9b63625debeb9d703999784627e1f2ac6d8ca7eb5919cde",
    "scope_needs_review": false,
    "eligible": true
  },
  {
    "drop_id": "c4b85ccb-c218-4f5c-bde4-6d6a74264b21",
    "drop_name": "Tuxtla Gutiérrez",
    "keep_id": "372bfc9e-ea17-4504-85c8-bfdcfded6313",
    "keep_name": "Tuxtla",
    "wikidata_qid": "Q207429",
    "country_code": "MX",
    "distance_m": 3664.05176152988,
    "drop_source_name": "Tuxtla Gutiérrez",
    "keep_source_name": "Tuxtla",
    "source_url": "https://www.wikidata.org/wiki/Q207429",
    "source_sha256": "65b8587fc274b1ebd1d861ab63943fdcc5b1dcc9ab3cc49d2e2dbbed533a5b93",
    "scope_needs_review": false,
    "eligible": true
  },
  {
    "drop_id": "e3965f98-9d59-4c0c-8dfd-cafdd43166a7",
    "drop_name": "Padova",
    "keep_id": "3ba8842a-06e4-457e-b591-56da17229d06",
    "keep_name": "Padua",
    "wikidata_qid": "Q617",
    "country_code": "IT",
    "distance_m": 2400.53422208507,
    "drop_source_name": "Padova",
    "keep_source_name": "Padua",
    "source_url": "https://www.wikidata.org/wiki/Q617",
    "source_sha256": "2fb56cc681247c841ca67ad2d5eb3c9138307619a2d36d2ca8d53143fb0f1312",
    "scope_needs_review": false,
    "eligible": true
  }
]
$source$::jsonb)
 loop
  perform 1 from public.cities where id in ((r->>'drop_id')::uuid,(r->>'keep_id')::uuid) order by id for update;
  select * into strict k from public.cities where id=(r->>'keep_id')::uuid;
  select * into strict d from public.cities where id=(r->>'drop_id')::uuid;
  if d.duplicate_of_id=k.id then continue; end if;
  if k.duplicate_of_id is not null or d.duplicate_of_id is not null
   or k.wikidata_qid is distinct from r->>'wikidata_qid' or d.wikidata_qid is not null
   or k.name is distinct from r->>'keep_name' or d.name is distinct from r->>'drop_name'
   or k.country_id is null or k.country_id is distinct from d.country_id
   or (select code from public.countries where id=k.country_id) is distinct from r->>'country_code'
   or coalesce(public.haversine_m(k.latitude::numeric,k.longitude::numeric,d.latitude::numeric,d.longitude::numeric),1e9)>15000
   or d.enrichment_status#>>'{qid_conflict,qid}' is distinct from r->>'wikidata_qid'
   or d.enrichment_status#>>'{wikidata_search,detail,outcome}' is distinct from 'selected'
   or not exists(select 1 from jsonb_array_elements(d.enrichment_status#>'{wikidata_search,detail,probes}') probe
    where probe->>'qid'=r->>'wikidata_qid' and probe->>'class'='settlement'
      and probe->>'country'='agree' and probe->>'coordinates'='agree')
  then raise exception 'City identity evidence changed for %',d.id; end if;
  if dry_run then result:=jsonb_build_object('source',r,'would_merge',true);
  else
   select count(*) into before_venues from public.venues where city_id=d.id;
   result:=public.merge_cities(k.id,d.id,false);
   if not exists(select 1 from public.cities where id=d.id and duplicate_of_id=k.id)
    or exists(select 1 from public.venues where city_id=d.id)
    or (result#>>'{reparented,venues.city_id}')::bigint is distinct from before_venues then
    raise exception 'City merge verification failed for %',d.id;
   end if;
   update public.city_merge_audit set details=details||jsonb_build_object('automation',jsonb_build_object(
    'contract','corroborated-city-conflict:v1','source_evidence',r,'source_request',58248,'human_reviewed',false))
   where id=(result->>'audit_id')::uuid;
  end if;
  results:=results||jsonb_build_array(jsonb_build_object('drop_id',d.id,'keep_id',k.id,'result',result));
 end loop;
 perform set_config('matching_city_conflicts.result',jsonb_build_object('dry_run',dry_run,'pairs',jsonb_array_length(results),'results',results)::text,true);
end $repair$;
select current_setting('matching_city_conflicts.result')::jsonb as result;
commit;
