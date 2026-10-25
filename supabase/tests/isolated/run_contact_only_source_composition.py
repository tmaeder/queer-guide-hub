#!/usr/bin/env python3
"""Execute real composition helpers against strict and malformed source captures."""
import ast
import os
from pathlib import Path
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
tree=ast.parse(Path(__file__).with_name('run_refuge_source_quality.py').read_text())
schema=next(ast.literal_eval(n.value)for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='SCHEMA'for t in n.targets))
schema+='''
create schema api_private;create schema extensions;create extension pgcrypto with schema extensions;
alter table venue_sources add column is_primary boolean default false;
create function canonicalize_phone(text,text)returns jsonb language sql immutable as $$select case when $1='933 472 424'and $2='AO'then '{"verdict":"ok","e164":"+244933472424"}'::jsonb else '{"verdict":"reject"}'::jsonb end$$;
'''
base=(ROOT/'supabase/migrations/99991792618428_refuge_source_quality_limits.sql').read_text()
migration=(ROOT/'supabase/migrations/99991792951000_contact_only_source_composition.sql').read_text()
checks='''
do $test$
declare org uuid:=gen_random_uuid();ven uuid:=gen_random_uuid();src uuid:=gen_random_uuid();extra uuid:=gen_random_uuid();place jsonb;capture jsonb;original jsonb;mutated jsonb;result jsonb;k text;cases integer:=0;s venue_sources;
begin
 insert into organizations(id,name,primary_venue_id,roles,field_provenance)values(org,'Test Venue',ven,array['venue'],'{"identity":{"source":"unified_location"}}');
 insert into venues(id,name,organization_id,category)values(ven,'Test Venue',org,'hotel');
 insert into venue_sources(venue_id,source_slug,source_entity_id,source_url,payload)values(ven,'gayout','123','https://www.gayout.com/test-venue','{"normalized":{"name":"Test Venue","metadata":{"data_source":"gayout"}}}');
 assert organization_facts_only_source(org)->'unavailable_dimensions'='["editorial","media"]'::jsonb;
 place:=jsonb_build_object('id',src,'names',jsonb_build_object('primary','Test Venue'),'operating_status','open','confidence',.99,'phones',jsonb_build_array('933 472 424'),'sources',jsonb_build_array(jsonb_build_object('license','CDLA-Permissive-2.0')));
 capture:=jsonb_build_object('venue_id',ven,'contact_kind','phone','human_reviewed',false,'release','2026-10-21.0','window_complete',true,'country_code','AO','phone','933 472 424','observed_at',now()-interval '10 days','source_url','https://stac.overturemaps.org/2026-10-21.0/places/place/collection.json','payload_text',jsonb_build_array(place)::text,'payload_sha256',encode(extensions.digest(jsonb_build_array(place)::text,'sha256'),'hex'));
 original:=jsonb_build_object('contract','overture_phone_capture:v1','raw',place,'normalized',jsonb_build_object('name','Test Venue','contacts',jsonb_build_object('phone','+244933472424')),'capture',capture);
 insert into venue_sources(id,venue_id,source_slug,source_entity_id,source_url,payload,payload_hash)values(extra,ven,'overture',src::text,capture->>'source_url',original,encode(extensions.digest(original::text,'sha256'),'hex'));
 select *into s from venue_sources where id=extra;
 assert api_private.overture_phone_source_is_contact_only(s),'Typed phone source rejected';
 result:=organization_facts_only_source(org);
 assert result->'unavailable_dimensions'='["editorial","media"]'::jsonb,'Phone capture reopened unrelated work';
 assert jsonb_array_length(result->'source_records')=2,'Supplement hashes absent from outcome evidence';
 -- Rehash every modified record: a valid outer hash never excuses bad content.
 for mutated in select value from jsonb_array_elements(jsonb_build_array(
  '[]'::jsonb,original||'{"description":"unexpected prose"}',jsonb_set(original,'{raw}','[]'),jsonb_set(original,'{capture}','[]'),jsonb_set(original,'{normalized}','[]'),
  jsonb_set(original,'{normalized,contacts}','[]'),jsonb_set(original,'{contract}','"generic"'),
  jsonb_set(original,'{raw,description}','"supplied prose"'),jsonb_set(original,'{raw,images}','["https://image.example/a.jpg"]'),
  jsonb_set(original,'{raw,names,primary}','"Another"'),jsonb_set(original,'{normalized,contacts,email}','"supplied@example.org"'),
  jsonb_set(original,'{normalized,contacts,phone}','"+244000000000"'),jsonb_set(original,'{raw,id}','"wrong"'),
  jsonb_set(original,'{capture,source_url}','"https://wrong.example/"'),jsonb_set(original,'{capture,venue_id}',to_jsonb(gen_random_uuid())),
  jsonb_set(original,'{capture,human_reviewed}','true'),jsonb_set(original,'{capture,window_complete}','false'),jsonb_set(original,'{capture,release}','"unknown"'),
  jsonb_set(original,'{capture,payload_text}','"invalid JSON"'),jsonb_set(original,'{capture,payload_sha256}','"bad hash"'),
  jsonb_set(original,'{capture,observed_at}','"invalid date"'),jsonb_set(original,'{capture,photos}','["extra"]'),
  jsonb_set(original,'{raw,confidence}','"invalid"'),jsonb_set(original,'{raw,confidence}','0.1'),jsonb_set(original,'{raw,phones}','[]'),
  jsonb_set(original,'{raw,phones}','["another number"]'),jsonb_set(original,'{raw,sources}','[]'),jsonb_set(original,'{raw,sources}','[{"license":"unknown"}]')
 ))loop
  update venue_sources set payload=mutated,payload_hash=encode(extensions.digest(mutated::text,'sha256'),'hex')where id=extra;
  select *into s from venue_sources where id=extra;
  assert not api_private.overture_phone_source_is_contact_only(s),'Unsafe supplement accepted case '||cases;
  assert organization_facts_only_source(org)is null,'Unsafe source waived quality case '||cases;
  cases:=cases+1;
 end loop;
 update venue_sources set payload=original,payload_hash='wrong hash'where id=extra;
 assert organization_facts_only_source(org)is null,'Outer hash mismatch accepted';
 update venue_sources set payload_hash=encode(extensions.digest(original::text,'sha256'),'hex'),is_primary=true where id=extra;
 assert organization_facts_only_source(org)is null,'Primary source reinterpreted as supplement';
 update venue_sources set is_primary=false where id=extra;
 insert into venue_sources(id,venue_id,source_slug)values(gen_random_uuid(),ven,'another');
 assert organization_facts_only_source(org)is null,'Unrecognized additional source waived';
 delete from venue_sources where venue_id=ven and source_slug='another';
 update venue_sources set payload=jsonb_set(payload,'{normalized,description}','"Real supplied prose"')where venue_id=ven and source_slug='gayout';
 assert organization_facts_only_source(org)is null,'Supplied base prose waived';
 assert not exists(select 1 from entity_quality_findings),'Read-only contract wrote findings';
 assert has_function_privilege('service_role','api_private.overture_phone_source_is_contact_only(venue_sources)','execute');
 assert not has_function_privilege('anon','api_private.overture_phone_source_is_contact_only(venue_sources)','execute');
 raise notice 'PASS: % malformed captures, source hashes, composition, original source scope, permissions and no finding writes',cases;
end $test$;
'''
bound_checks='''
-- Instrument only the expensive validator; all semantic cases above used its real body.
create sequence supplement_validation_calls;
create or replace function api_private.overture_phone_source_is_contact_only(s public.venue_sources)
returns boolean language plpgsql stable set search_path=public,pg_temp as $$begin
 if s.venue_id<>'90000000-0000-4000-8000-000000000002'::uuid then raise exception 'Unrelated source capture validated';end if;
 perform nextval('supplement_validation_calls');return true;
end$$;
insert into organizations(id,name,primary_venue_id,roles,field_provenance)values('90000000-0000-4000-8000-000000000001','Bound Venue','90000000-0000-4000-8000-000000000002',array['venue'],'{"identity":{"source":"unified_location"}}');
insert into venues(id,name,organization_id,category)values('90000000-0000-4000-8000-000000000002','Bound Venue','90000000-0000-4000-8000-000000000001','bar');
insert into venue_sources(venue_id,source_slug,source_url,payload)values('90000000-0000-4000-8000-000000000002','gayout','https://www.gayout.com/bound','{"normalized":{"name":"Bound Venue","metadata":{"data_source":"gayout"}}}');
insert into venue_sources(venue_id,source_slug,payload)select gen_random_uuid(),'overture','{}'from generate_series(1,10000);
analyze venue_sources;
do $$begin
 assert organization_facts_only_source('90000000-0000-4000-8000-000000000001')is not null;
 assert not(select is_called from supplement_validation_calls),'Unrelated captures validated';
end$$;
insert into venue_sources(venue_id,source_slug,payload)values('90000000-0000-4000-8000-000000000002','overture','{}');
do $$begin
 assert organization_facts_only_source('90000000-0000-4000-8000-000000000001')is not null;
 assert(select is_called and last_value=1 from supplement_validation_calls),'Current capture validation count changed';
end$$;
'''
fix=(ROOT/'supabase/migrations/99991792955040_bound_contact_supplement_validation.sql').read_text()
with tempfile.TemporaryDirectory(prefix='qg-contact-composition-')as tmp:
 data=Path(tmp)/'data'
 subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55512 -c listen_addresses= -c min_wal_size=32MB -c max_wal_size=64MB','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:
  subprocess.run([str(PG/'psql'),'-h',tmp,'-p','55512','-d','postgres','-v','ON_ERROR_STOP=1'],input="begin;"+schema+base+migration+fix+checks+bound_checks+"commit;",text=True,check=True,stdout=subprocess.DEVNULL)
 finally:subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)

print("PASS: 28 real capture boundaries and validation restricted to 0/1 relevant captures despite 10,000 unrelated records")
