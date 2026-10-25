#!/usr/bin/env python3
"""Exercise official website/map evidence against native ownership rules."""
import os
from pathlib import Path
import subprocess,tempfile
ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
schema="""
create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
create function auth.uid()returns uuid language sql as 'select nullif(current_setting(''test.auth_uid'',true),'''')::uuid';
create function assert_admin_or_internal()returns void language sql as 'select';
create table admin_automations(slug text,enabled boolean);insert into admin_automations values('event_venue_link',true),('review_automatic_resolution',true);
create table countries(id uuid primary key,code text);insert into countries values(md5('DE')::uuid,'DE');
create table cities(id uuid primary key,name text,country_id uuid,duplicate_of_id uuid);insert into cities values(md5('Berlin')::uuid,'Berlin',md5('DE')::uuid,null);
create table venues(id uuid primary key,name text,city_id uuid,country_id uuid,website text,address text,postal_code text,latitude numeric,longitude numeric,safety_gated boolean default false,closed_at timestamptz,duplicate_of_id uuid);
insert into venues values(md5('venue')::uuid,'Insomnia night club',md5('Berlin')::uuid,md5('DE')::uuid,'https://www.insomnia-berlin.de/','17 Alt-Tempelhof Berlin (12099)','12099',52.4655581,13.3860876,false,null,null);
create table events(id uuid primary key,test_n int,title text,start_date timestamptz,external_id text,venue_id uuid,venue_name text default 'Insomnia',city_id uuid default md5('Berlin')::uuid,
 country_id uuid default md5('DE')::uuid,country text default 'DE',data_source text default 'siegessaeule',duplicate_of_id uuid,
 latitude numeric default 52.52,longitude numeric default 13.405,is_public boolean default true,safety_gated boolean default false,status text default 'active',updated_at timestamptz default now(),geo_linked_at timestamptz,
 field_provenance jsonb default '{"latitude":{"source":"derived:city_centroid","value":52.52},"longitude":{"source":"derived:city_centroid","value":13.405}}',description text default 'Keep description',images text[] default '{keep}',event_type text default 'other');
create table event_sources(id uuid primary key,event_id uuid,source_slug text default 'siegessaeule',source_entity_id text,source_url text,payload_hash text default repeat('a',64),payload jsonb);
create table review_queue(id uuid primary key,entity_id uuid,entity_type text default 'event',review_type text default 'venue_link_candidate',status text default 'pending',resolved_by uuid,resolved_at timestamptz,details jsonb default '{}');
create table event_quality_issues(id uuid primary key,event_id uuid,issue_code text default 'NAMED_VENUE_UNLINKED',status text default 'open',detector text default 'event-quality-scan',reviewed_by uuid,reviewed_at timestamptz,resolution text,resolved_at timestamptz,evidence jsonb default '{}');
create table event_quality_current(event_id uuid,issue_codes text[]default '{NAMED_VENUE_UNLINKED,IMAGE_MISSING}',open_issue_codes text[]default '{NAMED_VENUE_UNLINKED,IMAGE_MISSING}');
create table content_revisions(source_table text,source_id uuid,actor_kind text,changed_fields text[]);
create table admin_review_repairs(entity_type text,entity_id uuid,reason text,previous_value jsonb,next_value jsonb);
create function haversine_m(numeric,numeric,numeric,numeric)returns numeric language sql immutable as 'select sqrt(power(($1-$3)*111000,2)+power(($2-$4)*80000,2))';
create function geo_country_at(numeric,numeric)returns table(iso_a2 text)language sql as 'select ''DE''where $1 between 47 and 55 and $2 between 5 and 16';
create function event_quality_findings(uuid)returns table(issue_code text)language sql as 'select ''NAMED_VENUE_UNLINKED''from events where id=$1 and venue_id is null union all select ''IMAGE_MISSING''';
create function native_link()returns trigger language plpgsql as $$begin
 new.geo_linked_at:=now();new.field_provenance:=new.field_provenance||'{"country_id":{"source":"venue"}}';return new;end$$;
create trigger native_geo before update of venue_id on events for each row execute function native_link();
create function native_review()returns trigger language plpgsql as $$begin
 update review_queue set status='resolved',resolved_at=now()where entity_id=new.id and review_type='venue_link_candidate'and status='pending';return new;end$$;
create trigger native_review after update of venue_id on events for each row execute function native_review();
insert into events(id,test_n,title,start_date,external_id)select md5(n::text)::uuid,n,'Tour '||n,'2026-10-26T15:30:00Z','kultur/tour-'||n||'/2026-10-26/16:30'from generate_series(1,26)n;
insert into event_sources(id,event_id,source_entity_id,source_url,payload)select md5('source-'||test_n)::uuid,id,external_id,'https://www.siegessaeule.de/termine/'||external_id||'/',
 jsonb_build_object('normalized',jsonb_build_object('sourceId',external_id,'title',title,'start_date',start_date,'metadata',jsonb_build_object('source','siegessaeule'),
 'venue_name','Insomnia','location',jsonb_build_object('address','Insomnia, Alt-Tempelhof 17-19, 12099 Berlin','country','DE')))from events;
insert into review_queue(id,entity_id)select id,id from events;
insert into event_quality_issues(id,event_id)select id,id from events;
insert into event_quality_current(event_id)select id from events;
update events set latitude=52.4655581,longitude=13.3860876,field_provenance='{}'where test_n=2;
update event_sources set payload_hash='bad'where event_id=md5('4')::uuid;
update events set country='FR'where test_n=8;
update events set field_provenance=field_provenance||'{"venue_id":{"source":"human"}}'where test_n=9;
update events set field_provenance=jsonb_set(field_provenance,'{latitude,value}','52.521')where test_n=10;
insert into content_revisions values('events',md5('11')::uuid,'human',array['latitude']);
update event_quality_issues set reviewed_by=md5('human')::uuid where event_id=md5('12')::uuid;
update review_queue set details='{"requires_confirm":"TRUE"}'where entity_id=md5('13')::uuid;
insert into events(id,title,start_date,venue_id)select md5('collision')::uuid,title,start_date,md5('venue')::uuid from events where test_n=16;
update events set safety_gated=true where test_n=17;
update events set is_public=false where test_n=18;
update event_sources set payload=jsonb_set(payload,'{normalized,start_date}','"bad timestamp"')where event_id=md5('19')::uuid;
update events set status='cancelled'where test_n=21;
update events set field_provenance=field_provenance||'{"country_id":{"source":"human"}}'where test_n=22;
update review_queue set resolved_by=md5('human')::uuid where entity_id=md5('23')::uuid;
update events set latitude=null,longitude=null,field_provenance='{}'where test_n=26;
create table before_events as select id,to_jsonb(e)value from events e;
create table before_sources as select id,to_jsonb(s)value from event_sources s;
create table fixture_captures(n int,url text,body text,sha256 text,observed_at timestamptz default now());
insert into fixture_captures(n,url,body)select e.test_n,s.source_url,'Publisher capture '||e.test_n from events e join event_sources s on s.event_id=e.id;
insert into fixture_captures(n,url,body)values(0,'https://www.insomnia-berlin.de/kontakt.html','Official capture'),(-6,'https://www.insomnia-berlin.de/kontakt.html','Tampered capture');
update fixture_captures set sha256=encode(extensions.digest(convert_to(body,'UTF8'),'sha256'),'hex');
update fixture_captures set sha256=repeat('e',64)where n=-6;
update fixture_captures set observed_at=now()-interval '2 hours'where n=7;
create table fixture_input(value jsonb);
insert into fixture_input select jsonb_build_object('proofs',(select jsonb_agg(p)from(
 select jsonb_build_object('id',e.id,'title',e.title,'start_date',e.start_date,'external_id',e.external_id,'expected_updated_at',e.updated_at,
 'expected_event_hash',case when e.test_n=3 then repeat('0',32)else md5(to_jsonb(e)::text)end,
 'event_source_id',s.id,'source_url',s.source_url,'event_payload_hash',s.payload_hash,'expected_source_hash',case when e.test_n=25 then repeat('0',32)else md5(to_jsonb(s)::text)end,
 'venue_id',v.id,'expected_venue_hash',md5(to_jsonb(v)::text),'publisher_venue_name',case when e.test_n=24 then 'Wrong'else 'Insomnia'end,
 'publisher_venue_url',case when e.test_n=15 then 'https://other.test/'else 'https://www.insomnia-berlin.de/index.html'end,'publisher_address','Insomnia, Alt-Tempelhof 17-19, 12099 Berlin',
 'source_latitude',case when e.test_n=14 then 53 else 52.4656105 end,'source_longitude',13.38597012,'official_latitude',52.46561,'official_longitude',13.38597,
 'homepage_host','insomnia-berlin.de','postal_code','12099','publisher_capture',case when e.test_n=5 then repeat('d',64)else pc.sha256 end,
 'official_capture',(select sha256 from fixture_captures where n=case when e.test_n=6 then -6 else 0 end))p
 from events e join event_sources s on s.event_id=e.id join fixture_captures pc on pc.n=e.test_n cross join venues v where e.test_n is not null
 union all select null::jsonb where false)proofs),
 'captures',(select jsonb_agg(to_jsonb(c)-'n')from fixture_captures c));
update fixture_input set value=jsonb_set(value,'{proofs}',value->'proofs'||(select jsonb_build_array(x)from jsonb_array_elements(value->'proofs')x where x->>'id'=md5('20')::uuid::text));
"""
operator=(ROOT/'scripts/data-quality/reconcile-publisher-venue-websites.sql').read_text()
setter="select set_config('matching.publisher_venue_website_evidence',(select value::text from fixture_input),true);\n"
def repair(apply=False,extra=''):
 sql=operator.replace('do $repair$',extra+setter+'do $repair$')
 return sql.replace('dry_run boolean:=true','dry_run boolean:=false')if apply else sql
dry_checks="""
do $$begin
 if(current_setting('matching.publisher_venue_website_result')::jsonb->>'linked')::int<>3 then raise exception 'Wrong dry candidates';end if;
 if exists(select 1 from admin_review_repairs)or exists(select 1 from before_events b join events e using(id)where b.value<>to_jsonb(e))then raise exception 'Dry wrote';end if;
end$$;
"""
checks="""
do $$declare r jsonb;begin
 r:=current_setting('matching.publisher_venue_website_result')::jsonb;
 if(r->>'linked')::int<>3 or(r->>'pins')::int<>2 or(r->>'review_findings')::int<>3 or(r->>'quality_findings')::int<>3 then raise exception 'Wrong counters %',r;end if;
 if exists(select 1 from before_events b join events e using(id)where coalesce(e.test_n,0)not in(1,2,26)and b.value<>to_jsonb(e))then raise exception 'Refused event changed';end if;
 if exists(select 1 from before_sources b join event_sources s using(id)where b.value<>to_jsonb(s))then raise exception 'Source changed';end if;
 if exists(select 1 from event_quality_current where not('IMAGE_MISSING'=any(open_issue_codes)))then raise exception 'Unrelated issue changed';end if;
 if(select count(*)from admin_review_repairs)<>13 then raise exception 'Missing or duplicated audits: %',(select count(*)from admin_review_repairs);end if;
 if not exists(select 1 from events where test_n=2 and latitude=52.4655581 and longitude=13.3860876)then raise exception 'Explicit pin changed';end if;
end$$;
"""
with tempfile.TemporaryDirectory(prefix='qg-venue-website-')as tmp:
 data=Path(tmp)/'data';subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55499 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
 def run(sql,success=True):
  r=subprocess.run([str(PG/'psql'),'-h',tmp,'-p','55499','-d','postgres','-v','ON_ERROR_STOP=1','-t','-A'],input=sql,text=True,capture_output=True)
  if success and r.returncode:raise RuntimeError(r.stderr)
  if not success and not r.returncode:raise RuntimeError('Expected refusal')
  return r
 try:
  run(schema)
  run(repair()+dry_checks)
  r=run(repair(True,"set local test.auth_uid='00000000-0000-0000-0000-000000000001';"),False)
  assert 'Internal actor required'in r.stderr
  run("update admin_automations set enabled=false where slug='event_venue_link';")
  r=run(repair(True),False);assert 'paused'in r.stderr
  run("update admin_automations set enabled=true;")
  run(repair(True)+checks)
  run(repair(True)+"do $$begin if(current_setting('matching.publisher_venue_website_result')::jsonb->>'linked')::int<>0 or(select count(*)from admin_review_repairs)<>13 then raise exception 'Not idempotent';end if;end$$;")
 finally:subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: source/official captures, ownership and human holds, stale hashes, duplicates, pins, source preservation, pauses/auth, native reconciliation, audits and idempotency')
