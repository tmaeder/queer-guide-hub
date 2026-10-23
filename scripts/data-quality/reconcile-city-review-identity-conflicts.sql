-- Two explicit source-checked city identity conflicts from recorded native resolver requests.
-- Default dry run. Same country, live source-selected settlement, both exact
-- current source names, <=15 km and original unmerged identities are required.
-- This is an allowlisted repair, not a general nearby-place merge heuristic.
-- Islip, Distrito Federal and Tucuman are excluded for administrative scope.
-- Existing merge_cities records every reparented row and supports unmerge.
begin;
set local statement_timeout='45s';set local lock_timeout='2s';
select set_config('matching.city_conflict_before',jsonb_build_object(
'cities',(select jsonb_agg(to_jsonb(c))from cities c where id in('18b818e4-5b72-4f5e-a0cb-133c33d05d6f','54ca17c7-2efa-4b66-808e-66a3c41661b1','2071a3b0-587b-4b48-9428-7965382ae19b','193a96f6-37e2-45f2-a9fd-0467b9155189')),
'venues',(select coalesce(jsonb_agg(to_jsonb(v)),'[]')from venues v where city_id in('18b818e4-5b72-4f5e-a0cb-133c33d05d6f','2071a3b0-587b-4b48-9428-7965382ae19b')),
'events',(select coalesce(jsonb_agg(to_jsonb(e)),'[]')from events e where city_id in('18b818e4-5b72-4f5e-a0cb-133c33d05d6f','2071a3b0-587b-4b48-9428-7965382ae19b')),
'organizations',(select coalesce(jsonb_agg(to_jsonb(o)),'[]')from organizations o where city_id in('18b818e4-5b72-4f5e-a0cb-133c33d05d6f','2071a3b0-587b-4b48-9428-7965382ae19b'))
)::text,true);
do $repair$
declare dry_run boolean:=true; r jsonb; k public.cities; d public.cities; result jsonb; before_venues bigint; results jsonb:='[]'::jsonb;
begin
 for r in select value from jsonb_array_elements($source$
[
  {
    "drop_id": "18b818e4-5b72-4f5e-a0cb-133c33d05d6f",
    "drop_name": "Stolberg (Rhld.)",
    "keep_id": "54ca17c7-2efa-4b66-808e-66a3c41661b1",
    "keep_name": "Stolberg",
    "wikidata_qid": "Q4068",
    "country_code": "DE",
    "distance_m": 4140.66931784125,
    "drop_source_name": "Stolberg (Rhld.)",
    "keep_source_name": "Stolberg",
    "source_url": "https://www.wikidata.org/wiki/Q4068",
    "source_sha256": "77f4522b523052e5f7f7dbcbe1b87c7cd35ab8a6c01ad3211d859990a09122aa",
    "source_request": 79247,
    "scope_needs_review": false,
    "eligible": true
  },
  {
    "drop_id": "2071a3b0-587b-4b48-9428-7965382ae19b",
    "drop_name": "Nuremberg",
    "keep_id": "193a96f6-37e2-45f2-a9fd-0467b9155189",
    "keep_name": "Nürnberg",
    "wikidata_qid": "Q2090",
    "country_code": "DE",
    "distance_m": 2772.54232062891,
    "drop_source_name": "Nuremberg",
    "keep_source_name": "Nürnberg",
    "source_url": "https://www.wikidata.org/wiki/Q2090",
    "source_sha256": "3ce15e9f4f575848cdfaf95c9ca2774f78166b773da0f91d68a662b10353f01c",
    "source_request": 79437,
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
    'contract','corroborated-city-conflict:v1','source_evidence',r,'source_request',coalesce((r->>'source_request')::bigint,58248),'human_reviewed',false))
   where id=(result->>'audit_id')::uuid;
  end if;
  results:=results||jsonb_build_array(jsonb_build_object('drop_id',d.id,'keep_id',k.id,'result',result));
 end loop;
 perform set_config('matching_city_conflicts.result',jsonb_build_object('dry_run',dry_run,'pairs',jsonb_array_length(results),'results',results)::text,true);
end $repair$;
do $verify$ declare old jsonb; cur jsonb; tbl text; snap jsonb:=current_setting('matching.city_conflict_before')::jsonb; begin
if (current_setting('matching_city_conflicts.result')::jsonb->>'dry_run')::boolean then return;end if;
for old in select value from jsonb_array_elements(snap->'cities') loop
select to_jsonb(c) into cur from cities c where c.id=(old->>'id')::uuid;
if old->>'id' in('18b818e4-5b72-4f5e-a0cb-133c33d05d6f','2071a3b0-587b-4b48-9428-7965382ae19b') then
if cur-'duplicate_of_id'-'updated_at'-'shell_status'-'seo_indexable'-'enrichment_status' is distinct from old-'duplicate_of_id'-'updated_at'-'shell_status'-'seo_indexable'-'enrichment_status'
or cur->>'shell_status'<>'merged' or cur->'seo_indexable'<>'false'::jsonb
or (cur->'enrichment_status')-'merge_flags' is distinct from old->'enrichment_status'
or cur#>'{enrichment_status,merge_flags,prior_shell_status}' is distinct from old->'shell_status'
or cur#>'{enrichment_status,merge_flags,prior_seo_indexable}' is distinct from old->'seo_indexable'
then raise exception 'Unexpected merged city change %',old->>'id';end if;
elsif cur is distinct from old then raise exception 'Canonical city content changed %',old->>'id';end if;
end loop;
foreach tbl in array array['venues','events','organizations'] loop
for old in select value from jsonb_array_elements(snap->tbl) loop
execute format('select to_jsonb(t) from public.%I t where id=$1',tbl) into cur using (old->>'id')::uuid;
if cur-'city_id'-'city'-'state'-'timezone'-'updated_at'-'quality_checked_at' is distinct from old-'city_id'-'city'-'state'-'timezone'-'updated_at'-'quality_checked_at' then raise exception 'Unexpected % content change %',tbl,old->>'id';end if;
if cur->'timezone' is distinct from old->'timezone' and (nullif(old->>'timezone','') is not null or cur->>'timezone' is distinct from (select timezone from cities where id=(cur->>'city_id')::uuid)) then raise exception 'Unexpected timezone mutation %',old->>'id';end if;
if cur->'state' is distinct from old->'state' and cur->>'state' is distinct from (select region_name from cities where id=(cur->>'city_id')::uuid) then raise exception 'Unexpected derived state %',old->>'id';end if;
if cur->>'city_id'=old->>'city_id' then raise exception 'Unmoved % %',tbl,old->>'id';end if;
end loop;end loop;
end $verify$;
select current_setting('matching_city_conflicts.result')::jsonb as result;
commit;

