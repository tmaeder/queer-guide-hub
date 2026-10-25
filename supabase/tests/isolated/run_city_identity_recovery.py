#!/usr/bin/env python3
"""Run the actual operator against refusal fixtures in disposable PostgreSQL."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ.get('PG_BINDIR', '/opt/homebrew/opt/postgresql@17/bin'))
schema = """
create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
create function auth.uid()returns uuid language sql as 'select nullif(current_setting(''test.uid'',true),'''')::uuid';
create function assert_admin_or_internal()returns void language sql as 'select';
create table countries(id uuid primary key,code text);
create table cities(id uuid primary key,name text,country_id uuid,wikidata_qid text,latitude numeric,longitude numeric,
 updated_at timestamptz default now(),field_provenance jsonb default '{}',enrichment_status jsonb default '{}',
 duplicate_of_id uuid,shell_status text default 'placeholder',seo_indexable boolean default false,slug text,
 description text default 'Preserve this text');
create table geo_places(id uuid primary key,place_type text default 'city',duplicate_of_id uuid);
create table geo_cms_verifications(place_id uuid primary key,status text,checks jsonb,sources jsonb);
create table admin_automations(slug text,enabled boolean);
insert into admin_automations values('review_automatic_resolution',true);
create table content_revisions(source_table text,source_id uuid,actor_kind text,changed_fields text[]);
create table review_queue(id bigint generated always as identity,entity_type text,entity_id uuid,review_type text,
 details jsonb default '{}',status text default 'pending',resolved_by uuid,resolved_at timestamptz);
create table admin_review_repairs(entity_type text,entity_id uuid,reason text,previous_value jsonb,next_value jsonb);
create function city_canonical_key(text)returns text language sql immutable as 'select lower($1)';
create function geo_cms_fingerprint(uuid)returns text language sql stable as 'select md5(name)from cities where id=$1';
create function haversine_m(numeric,numeric,numeric,numeric)returns numeric language sql immutable as
 'select sqrt(power(($1-$3)*111000,2)+power(($2-$4)*111000,2))';
create function geo_country_at(numeric,numeric)returns table(iso_a2 text)language sql immutable as
 'select case when $1=59 then ''FR'' else ''DE'' end';
create function generate_slug(text)returns text language sql immutable as 'select lower(replace($1,'' '',''-''))';
create function generate_unique_slug(text,text,uuid)returns text language sql as 'select $2';
create function geo_cms_verify(uuid)returns jsonb language sql as
 'select ''{"verification":{"checks":{"country_match":true},"sources":[{"url":"https://example.org/boundary"}]}}''::jsonb';
create function geo_cms_record_evidence(uuid,text,jsonb,jsonb)returns void language sql as
 'insert into geo_cms_verifications values($1,''verified'',$3,$4)on conflict(place_id)do update set status=excluded.status,checks=$3,sources=$4';
insert into countries values(md5('country')::uuid,'DE');
insert into cities(id,name,country_id,wikidata_qid,latitude,longitude,slug)
 select md5(i::text)::uuid,'Example '||i,md5('country')::uuid,'Q'||(100+i),50,8,'tmp-'||i from generate_series(1,33)i;
insert into geo_places(id)select id from cities;
insert into review_queue(entity_type,entity_id,review_type)select 'city',id,'CITY_LIFECYCLE_UNRESOLVED'from cities;
create table proofs as select i,jsonb_build_object('id',c.id,'name',c.name,'wikidata_qid',c.wikidata_qid,'country_code','DE',
 'expected_updated_at',c.updated_at,'expected_fingerprint',geo_cms_fingerprint(c.id),'previous_classification',null,
 'status','municipality','reason','Explicit independent city or municipal classification','classes',jsonb_build_array('city'),
 'class_ids',jsonb_build_array('Q515'),'source_latitude',50,'source_longitude',8,
 'source_url','https://www.wikidata.org/wiki/'||c.wikidata_qid,'observed_at',now(),
 'entity_payload_text',jsonb_build_object('id',c.wikidata_qid,'claims','{}'::jsonb)::text,
 'entity_payload_sha256',encode(extensions.digest(jsonb_build_object('id',c.wikidata_qid,'claims','{}'::jsonb)::text,'sha256'),'hex'),
 'human_reviewed',false) proof from generate_series(1,33)i join cities c on c.id=md5(i::text)::uuid;
-- Identity discovery starts only from unlinked, machine-unresolved records.
update cities set wikidata_qid=null,shell_status='real',slug='example-'||substring(name from '[0-9]+$'),
 field_provenance='{"city_place_audit":{"status":"unresolved","reason":"No corroborated settlement classification"}}';
update proofs set proof=proof||jsonb_build_object('previous_classification','{"status":"unresolved","reason":"No corroborated settlement classification"}'::jsonb,
 'discovery_contract','city_missing_identity.v1','previous_wikidata_qid',null,'identity_search',jsonb_build_object(
 'url','https://www.wikidata.org/w/api.php?action=wbsearchentities','observed_at',now(),
 'payload_text',jsonb_build_object('search',jsonb_build_array(jsonb_build_object('id',proof->>'wikidata_qid')))::text,
 'sha256',encode(extensions.digest(jsonb_build_object('search',jsonb_build_array(jsonb_build_object('id',proof->>'wikidata_qid')))::text,'sha256'),'hex')));
insert into geo_cms_verifications select id,'review','{"reason":"No corroborated settlement classification"}','[]'from cities;
-- The original publication setting must be preserved, even when already true.
update cities set seo_indexable=true where id=md5('1')::uuid;
-- Each case protects a distinct ownership, freshness or source boundary.
update proofs set proof=jsonb_set(proof,'{expected_updated_at}',to_jsonb(now()-interval '1 day'))where i=2;
update proofs set proof=jsonb_set(proof,'{expected_fingerprint}','"changed"')where i=3;
insert into content_revisions values('cities',md5('4')::uuid,'human',array['shell_status']);
update cities set field_provenance=field_provenance||'{"wikidata_qid":{"source":"human"}}'where id=md5('5')::uuid;
update cities set field_provenance='{"city_place_audit":{"status":"review"}}'where id=md5('6')::uuid;
update proofs set proof=jsonb_set(proof,'{previous_classification}','{"status":"review"}')where i=6;
update review_queue set details='{"force_review":"true"}'where entity_id=md5('7')::uuid;
update proofs set proof=jsonb_set(proof,'{country_code}','"FR"')where i=8;
update proofs set proof=jsonb_set(proof,'{source_latitude}','52')where i=9;
insert into cities(id,name,country_id,wikidata_qid,latitude,longitude,slug,shell_status)
 values(md5('duplicate')::uuid,'Other',md5('country')::uuid,'Q110',50,8,'other','real');
update review_queue set resolved_by=md5('human')::uuid where entity_id=md5('11')::uuid;
update proofs set proof=jsonb_set(proof,'{classes}','[]')where i=12;
update proofs set proof=jsonb_set(proof,'{entity_payload_text}',to_jsonb(jsonb_build_object('id','Q113','claims',jsonb_build_object('P576',jsonb_build_array(1)))::text))where i=13;
update proofs set proof=jsonb_set(proof,'{entity_payload_sha256}',to_jsonb(encode(extensions.digest(proof->>'entity_payload_text','sha256'),'hex')))where i=13;
update proofs set proof=jsonb_set(proof,'{entity_payload_sha256}','"bad"')where i=14;
update proofs set proof=jsonb_set(proof,'{observed_at}',to_jsonb(now()-interval '2 hours'))where i=15;
update cities set shell_status='ghost'where id=md5('16')::uuid;
update review_queue set details='{"requires_confirm":true}'where entity_id=md5('17')::uuid;
update proofs set proof=jsonb_set(proof,'{source_url}','"https://example.org/wrong"')where i=18;
update cities set latitude=59 where id=md5('19')::uuid;
update proofs set proof=jsonb_set(proof,'{source_latitude}','59')where i=19;
insert into proofs select * from proofs where i=20;
update proofs set proof=jsonb_set(proof,'{identity_search,sha256}','"bad"')where i=21;
update proofs set proof=jsonb_set(proof,'{identity_search,payload_text}','"{\\"search\\":[]}"')where i=22;
update proofs set proof=jsonb_set(proof,'{identity_search,payload_text}',to_jsonb(jsonb_build_object('search',jsonb_build_array(jsonb_build_object('id',proof->>'wikidata_qid')),'search-continue',10)::text))where i=23;
update proofs set proof=jsonb_set(proof,'{identity_search,sha256}',to_jsonb(encode(extensions.digest(proof#>>'{identity_search,payload_text}','sha256'),'hex')))where i in(22,23);
update cities set wikidata_qid='Q999'where id=md5('24')::uuid;
update geo_cms_verifications set status='verified'where place_id=md5('25')::uuid;
update proofs set proof=jsonb_set(proof,'{source_latitude}','50.03')where i=26;
update proofs set proof=jsonb_set(proof,'{wikidata_qid}','"Q127"')where i=28;
-- Only the exact machine-generated identity blocker permits factual repair.
update review_queue q set review_type='CITY_IDENTITY_AMBIGUOUS',details=jsonb_build_object(
 'source','city_quality_profile','city_name',c.name,'city_slug',c.slug,'hard_blocker',true,'publication_ready',false,'observed_at',now())
 from cities c where q.entity_id=c.id and c.id in(md5('1')::uuid,md5('29')::uuid,md5('30')::uuid,md5('31')::uuid,md5('32')::uuid);
update review_queue set details=details||'{"manual_hold":true}'where entity_id=md5('29')::uuid;
update review_queue set review_type='CITY_DUPLICATE_UNRESOLVED'where entity_id=md5('30')::uuid;
update review_queue set details=jsonb_set(details,'{source}','"human"')where entity_id=md5('31')::uuid;
update review_queue set details=details||'{"human_reviewed":true}'where entity_id=md5('32')::uuid;
update review_queue set review_type='CITY_IDENTITY_AMBIGUOUS',details='{"hard_blocker":true}'where entity_id=md5('33')::uuid;
create table before_cities as select id,to_jsonb(c) value from cities c;
create table before_reviews as select id,to_jsonb(q)value from review_queue q;
-- The operator must work even when every review mutation is forbidden.
create function reject_review_mutations()returns trigger language plpgsql as $$begin raise exception 'Factual repair attempted a review mutation';end$$;
create trigger review_immutable before insert or update or delete on review_queue for each statement execute function reject_review_mutations();
select set_config('matching.city_classification_proofs',(select jsonb_agg(proof)::text from proofs),false);
"""
operator = (ROOT / 'scripts/data-quality/reconcile-discovered-city-identities.sql').read_text()
assertions = """
do $check$
begin
 if(current_setting('matching.city_identity_result')::jsonb->>'eligible')::int<>1 then raise exception 'Expected exactly one eligible city';end if;
 if exists(select 1 from before_reviews b full join review_queue q using(id)where b.value is distinct from to_jsonb(q))then raise exception 'Review records changed';end if;
 if exists(select 1 from before_cities b join cities c using(id) where b.id<>md5('1')::uuid and b.value<>to_jsonb(c))then raise exception 'A refused city changed';end if;
end $check$;
"""
dry_assert = """
do $check$begin
 if exists(select 1 from before_cities b join cities c using(id)where b.value<>to_jsonb(c))or exists(select 1 from admin_review_repairs)
 then raise exception 'Dry run wrote data';end if;end $check$;
"""
apply_assert = """
do $check$begin
 if(select count(*)from admin_review_repairs)<>1 or not exists(select 1 from cities where id=md5('1')::uuid and shell_status='real' and slug='example-1' and seo_indexable and wikidata_qid='Q101' and description='Preserve this text')
 then raise exception 'Expected one audited internal identity repair';end if;
 if not exists(select 1 from review_queue where entity_id=md5('1')::uuid and status='pending'and resolved_by is null)
 or not exists(select 1 from geo_cms_verifications where place_id=md5('1')::uuid and status='verified')then raise exception 'Factual verification or pending review invariant failed';end if;
end $check$;
"""
repeat_assert = """
do $check$begin
 if(current_setting('matching.city_identity_result')::jsonb->>'repaired')::int<>0 or(select count(*)from admin_review_repairs)<>1 then raise exception 'Repeated pass was not idempotent';end if;
end $check$;
"""
gate_function = operator[operator.index('do $repair$'):operator.index('select current_setting')].replace('do $repair$', 'create function pg_temp.repair()returns void language plpgsql as $repair$',1)
gate_checks = """
do $$begin
 perform set_config('test.uid',md5('human')::uuid::text,false);
 begin perform pg_temp.repair();raise exception 'Human actor accepted';
 exception when raise_exception then if sqlerrm<>'Internal actor required'then raise;end if;end;
 perform set_config('test.uid','',false);
 update admin_automations set enabled=false;
 begin perform pg_temp.repair();raise exception 'Paused repair ran';
 exception when raise_exception then if sqlerrm<>'Automatic resolution is paused'then raise;end if;end;
 update admin_automations set enabled=true;
end$$;
"""
sql = schema + gate_function + gate_checks + operator + assertions + dry_assert + operator.replace('dry_run boolean:=true','dry_run boolean:=false') + assertions + apply_assert + operator.replace('dry_run boolean:=true','dry_run boolean:=false') + repeat_assert
with tempfile.TemporaryDirectory(prefix='qg-city-identity-') as tmp:
 data = Path(tmp) / 'data'
 subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale','--wal-segsize=1'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55496 -c listen_addresses= -c min_wal_size=2MB -c max_wal_size=16MB','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:
  subprocess.run([str(PG/'psql'),'-h',tmp,'-p','55496','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True,stdout=subprocess.DEVNULL)
 finally:
  subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: 33 discovery/ownership/source cases, dry run, 2 km bound, protected fields, audited identity repair, immutable review records and idempotency')
