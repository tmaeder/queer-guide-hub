#!/usr/bin/env python3
"""Exercise exact publisher references and pin ownership in disposable PostgreSQL."""
import os
from pathlib import Path
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
schema="""
create role anon;create role authenticated;create role service_role;
create schema auth;create schema api_private;
create function auth.uid()returns uuid language sql as 'select null::uuid';
create function assert_admin_or_internal()returns void language sql as 'select';
create table countries(id uuid primary key,code text);insert into countries values(md5('CH')::uuid,'CH'),(md5('FR')::uuid,'FR');
create table cities(id uuid primary key,name text,country_id uuid,duplicate_of_id uuid);
insert into cities values(md5('city')::uuid,'Zurich',md5('CH')::uuid,null),(md5('othercity')::uuid,'Other',md5('CH')::uuid,null);
create table venues(id uuid primary key,name text,address text,postal_code text,latitude numeric,longitude numeric,
 city_id uuid,country_id uuid,duplicate_of_id uuid,closed_at timestamptz);
create table events(id uuid primary key,title text,start_date timestamptz,venue_id uuid,venue_name text,latitude numeric,longitude numeric,
 city_id uuid,country_id uuid,country text,data_source text,external_id text,updated_at timestamptz default now(),
 field_provenance jsonb default '{}',geo_linked_at timestamptz,safety_gated boolean default false,is_public boolean default true,status text default 'active',duplicate_of_id uuid,
 description text default 'Keep description',images text[]default '{keep-image}',event_type text default 'community');
create table event_sources(id uuid primary key,event_id uuid,source_slug text,source_entity_id text,payload jsonb,payload_hash text);
create table venue_sources(id uuid primary key,venue_id uuid,source_slug text,source_entity_id text,payload jsonb,payload_hash text);
create table review_queue(id uuid primary key,entity_type text,entity_id uuid,review_type text,status text default 'pending',resolved_at timestamptz,resolved_by uuid,details jsonb default '{}');
create table event_quality_issues(id uuid primary key,event_id uuid,issue_code text,status text default 'open',detector text default 'event-quality-scan',reviewed_by uuid,reviewed_at timestamptz,resolved_at timestamptz,resolution text);
create table event_quality_current(event_id uuid,issue_codes text[],open_issue_codes text[],quality_score int default 71);
create table admin_review_repairs(id bigint generated always as identity,entity_type text,entity_id uuid,reason text,previous_value jsonb,next_value jsonb);
create table content_revisions(source_table text,source_id uuid,actor_kind text,changed_fields text[]);
create table admin_automations(slug text,enabled boolean);insert into admin_automations values('review_automatic_resolution',true),('event_venue_link',true);
create function city_canonical_key(text)returns text language sql immutable as 'select lower($1)';
create function geo_country_at(numeric,numeric)returns table(iso_a2 text)language sql immutable as 'select case when $1=59 then ''FR''else ''CH''end';
create function haversine_m(numeric,numeric,numeric,numeric)returns numeric language sql immutable as 'select sqrt(power(($1-$3)*111000,2)+power(($2-$4)*80000,2))';
create function event_quality_findings(p_event_id uuid)returns table(issue_code text)language sql stable set search_path=public as
 'select ''NAMED_VENUE_UNLINKED''from events where id=$1 and venue_id is null union all select ''IMAGE_MISSING''where $1=md5(''44'')::uuid';
create function native_venue_geo()returns trigger language plpgsql as $$begin
 if new.venue_id is not null then new.geo_linked_at:=now();new.field_provenance:=new.field_provenance||'{"country_id":{"source":"venue"}}';end if;return new;end$$;
create trigger native_geo before update of venue_id on events for each row execute function native_venue_geo();
create function native_review_close()returns trigger language plpgsql set search_path=public as $$begin
 update review_queue set status='resolved',resolved_at=now(),details=details||jsonb_build_object('resolution','venue_linked','venue_id',new.venue_id,'resolved_automatically',true)
 where entity_type='event'and entity_id=new.id and review_type='venue_link_candidate'and status='pending';return new;end$$;
create trigger native_review after update of venue_id on events for each row execute function native_review_close();
create function reconcile_agendaq_event_venues(integer,boolean)returns jsonb language sql as 'select ''{}''::jsonb';
create function link_event_venues(integer,boolean,boolean)returns jsonb language sql as 'select ''{"candidates":0,"linked":0}''::jsonb';
create function reconcile_event_venue_quality_reviews(integer,boolean)returns jsonb language sql as 'select ''{}''::jsonb';
create function run_event_venue_link()returns jsonb language plpgsql as $$declare v_result jsonb;v_source_result jsonb;begin
 v_source_result := public.reconcile_agendaq_event_venues(100,false);
 v_result := public.link_event_venues(500,true,false);
 v_result := v_result || public.reconcile_event_venue_quality_reviews(500,false);
 return v_result;end$$;
insert into venues select md5('v'||i)::uuid,'Facility '||i,'Zollstrasse 117, 8005 Zurich','8005',47.3814978,8.5299396,md5('city')::uuid,md5('CH')::uuid,null,null from generate_series(1,53)i;
insert into events(id,title,start_date,venue_name,latitude,longitude,city_id,country_id,country,data_source,external_id,field_provenance)
select md5(i::text)::uuid,'Example '||i,now()+i*interval '1 day','Facility '||i,47.3769,8.5417,md5('city')::uuid,md5('CH')::uuid,'CH','haz-ch','event-'||i,
 '{"latitude":{"source":"derived:city_centroid","value":47.3769},"longitude":{"source":"derived:city_centroid","value":8.5417},"keep":"preserved"}'::jsonb from generate_series(1,53)i;
insert into event_sources select md5('es'||i)::uuid,e.id,'haz-ch',e.external_id,jsonb_build_object('normalized',jsonb_build_object(
 'entityType','event','sourceId',e.external_id,'sourceName','haz-ch','start_date',e.start_date,'metadata',jsonb_build_object('source','haz-ch','venue_source_id','venue-'||i),
 'location',jsonb_build_object('city','Zurich','country','CH','address','Zollstrasse 117','postal_code','8005'))),repeat('a',64)
 from generate_series(1,53)i join events e on e.id=md5(i::text)::uuid;
insert into venue_sources select md5('vs'||i)::uuid,v.id,'haz-ch','venue-'||i,jsonb_build_object('normalized',jsonb_build_object(
 'entityType','venue','sourceId','venue-'||i,'sourceName','haz-ch','metadata',jsonb_build_object('source','haz-ch'),
 'location',jsonb_build_object('city','Zurich','country','CH','address','Zollstrasse 117','postal_code','8005'))),repeat('b',64)
 from generate_series(1,53)i join venues v on v.id=md5('v'||i)::uuid;
insert into review_queue(id,entity_type,entity_id,review_type,details)select md5('q'||i)::uuid,'event',md5(i::text)::uuid,'venue_link_candidate','{"source":"link_event_venues","keep":"review"}'from generate_series(1,53)i;
insert into event_quality_issues(id,event_id,issue_code)select md5('issue'||i)::uuid,md5(i::text)::uuid,'NAMED_VENUE_UNLINKED'from generate_series(1,53)i;
insert into event_quality_current select md5(i::text)::uuid,array['NAMED_VENUE_UNLINKED'],array['NAMED_VENUE_UNLINKED'],71 from generate_series(1,53)i;
-- Ownership, binding, geography, address and pin contradictions each refuse.
update events set latitude=47.38150,longitude=8.52994,field_provenance='{"keep":"preserved"}'where id in(md5('2')::uuid,md5('45')::uuid,md5('53')::uuid);
update events set latitude=null,longitude=null,field_provenance='{"keep":"preserved"}'where id=md5('3')::uuid;
update events set field_provenance=field_provenance||'{"venue_id":{"source":"human"}}'where id=md5('4')::uuid;
update events set field_provenance=field_provenance||'{"venue_name":{"source":"human"}}'where id=md5('5')::uuid;
insert into content_revisions values('events',md5('6')::uuid,'human',array['venue_id']);
update review_queue set resolved_by=md5('human')::uuid where id=md5('q7')::uuid;
update review_queue set details=details||'{"hard_blocker":true}'where id=md5('q8')::uuid;
update review_queue set details=details||'{"requires_confirm":true}'where id=md5('q9')::uuid;
update review_queue set details=details||'{"force_review":"TRUE"}'where id=md5('q10')::uuid;
update event_quality_issues set reviewed_by=md5('human')::uuid where event_id=md5('11')::uuid;
update venues set closed_at=now()where id=md5('v12')::uuid;
update venues set duplicate_of_id=md5('other')::uuid where id=md5('v13')::uuid;
update events set duplicate_of_id=md5('other')::uuid where id=md5('14')::uuid;
update venues set country_id=md5('FR')::uuid where id=md5('v15')::uuid;
update venues set city_id=md5('othercity')::uuid where id=md5('v16')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,location,country}','"FR"')where event_id=md5('17')::uuid;
update venue_sources set payload=jsonb_set(payload,'{normalized,location,country}','"FR"')where venue_id=md5('v18')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,location,city}','"Other"')where event_id=md5('19')::uuid;
update venue_sources set payload=jsonb_set(payload,'{normalized,location,city}','"Other"')where venue_id=md5('v20')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,sourceId}','"wrong"')where event_id=md5('21')::uuid;
update venue_sources set payload=jsonb_set(payload,'{normalized,sourceId}','"wrong"')where venue_id=md5('v22')::uuid;
update event_sources set payload_hash='bad'where event_id=md5('23')::uuid;
update venue_sources set payload_hash='bad'where venue_id=md5('v24')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,start_date}','"2020-01-01T00:00:00Z"')where event_id=md5('25')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,location,address}','"No house"')where event_id=md5('26')::uuid;
update venue_sources set payload=jsonb_set(payload,'{normalized,location,address}','"Zollstrasse 118"')where venue_id=md5('v27')::uuid;
update venues set address='Zollstrasse 1170, 8005 Zurich'where id=md5('v28')::uuid;
update venues set address='Zollstrasse 117, Other',postal_code='9999'where id=md5('v29')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,location,postal_code}','"bad"')where event_id=md5('30')::uuid;
update venues set latitude=59 where id=md5('v31')::uuid;
update events set field_provenance='{}'where id=md5('32')::uuid;
update events set latitude=47.375 where id=md5('33')::uuid;
update events set field_provenance=jsonb_set(field_provenance,'{latitude,value}','"bad"')where id=md5('34')::uuid;
insert into content_revisions values('events',md5('35')::uuid,'human',array['latitude']);
update events set longitude=null,field_provenance='{}'where id=md5('36')::uuid;
update events set safety_gated=true where id=md5('37')::uuid;
update events set is_public=false where id=md5('38')::uuid;
update events set status='archived'where id=md5('39')::uuid;
insert into venue_sources select md5('ambiguous')::uuid,md5('v41')::uuid,source_slug,source_entity_id,payload,payload_hash from venue_sources where venue_id=md5('v40')::uuid;
update events set data_source='other'where id=md5('41')::uuid;
update venue_sources set venue_id=md5('v42')::uuid where venue_id=md5('v43')::uuid;
update events set title=(select title from events where id=md5('42')::uuid),start_date=(select start_date from events where id=md5('42')::uuid)where id=md5('43')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,start_date}',(select to_jsonb(start_date)from events where id=md5('43')::uuid))where event_id=md5('43')::uuid;
insert into event_quality_issues(id,event_id,issue_code)values(md5('unrelated')::uuid,md5('44')::uuid,'IMAGE_MISSING');
update event_quality_current set issue_codes=array_append(issue_codes,'IMAGE_MISSING'),open_issue_codes=array_append(open_issue_codes,'IMAGE_MISSING')where event_id=md5('44')::uuid;
update events set field_provenance=field_provenance||'{"latitude":{"source":"human","value":47.38150},"longitude":{"source":"human","value":8.52994}}'where id=md5('45')::uuid;
insert into content_revisions values('events',md5('45')::uuid,'human',array['latitude','longitude']);
update review_queue set details=details||'{"human_reviewed":"TrUe"}'where id=md5('q46')::uuid;
update events set field_provenance=field_provenance||'{"country_id":{"source":"human"}}'where id=md5('47')::uuid;
update events set field_provenance=field_provenance||'{"country_id":{"human_reviewed":"TrUe"}}'where id=md5('48')::uuid;
-- Fixture setup updates above invoked the native link trigger; reset known positives.
alter table events disable trigger native_review;
update events set venue_id=md5('v49')::uuid where id=md5('49')::uuid;
alter table events enable trigger native_review;
update review_queue set status='resolved'where id in(md5('q50')::uuid,md5('q51')::uuid);
update event_quality_issues set status='resolved'where event_id=md5('51')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,metadata,source}','"other"')where event_id=md5('52')::uuid;
update events set field_provenance=null where id=md5('53')::uuid;
create table original_events as select id,to_jsonb(e)value from events e;
create table original_reviews as select id,to_jsonb(q)value from review_queue q;
create table original_issues as select id,to_jsonb(i)value from event_quality_issues i;
"""
paths=list((ROOT/'supabase/migrations').glob('*_source_referenced_event_venues.sql'));assert len(paths)==1
migration=paths[0].read_text()
dry="""
do $$declare result jsonb;begin
 result:=api_private.reconcile_source_referenced_event_venues(200,true);
 if(result->>'candidates')::int<>7 then raise exception 'Expected 7 eligible: %',result;end if;
 if exists(select 1 from original_events o join events e using(id)where o.value<>to_jsonb(e))or exists(select 1 from admin_review_repairs)then raise exception 'Dry wrote';end if;
 if has_function_privilege('authenticated','api_private.reconcile_source_referenced_event_venues(integer,boolean)','execute')then raise exception 'Browser execution granted';end if;
 result:=api_private.reconcile_source_referenced_event_venues(2,true);if(result->>'candidates')::int<>2 then raise exception 'Batch limit ignored';end if;
 result:=api_private.reconcile_source_referenced_event_venues(0,false);if(result->>'linked_events')::int<>0 then raise exception 'Zero batch wrote';end if;
 update admin_automations set enabled=false where slug='review_automatic_resolution';
 result:=api_private.reconcile_source_referenced_event_venues(200,false);if result->>'reason'<>'paused'then raise exception 'Review pause ignored';end if;
 update admin_automations set enabled=true;update admin_automations set enabled=false where slug='event_venue_link';
 result:=api_private.reconcile_source_referenced_event_venues(200,false);if result->>'reason'<>'paused'then raise exception 'Link pause ignored';end if;
 update admin_automations set enabled=true;
end$$;
"""
apply="""
do $$declare result jsonb;begin
 result:=api_private.reconcile_source_referenced_event_venues(200,false);
 if(result->>'linked_events')::int<>7 or(result->>'corrected_pins')::int<>4 or(result->>'resolved_review_findings')::int<>6 or(result->>'resolved_quality_findings')::int<>7 then raise exception 'Wrong applied counters: %',result;end if;
 if exists(select 1 from original_events o join events e using(id)where e.id not in(md5('1')::uuid,md5('2')::uuid,md5('3')::uuid,md5('44')::uuid,md5('45')::uuid,md5('50')::uuid,md5('53')::uuid)and o.value<>to_jsonb(e))then raise exception 'A refused event changed';end if;
 if not exists(select 1 from events where id=md5('45')::uuid and latitude=47.38150 and field_provenance#>>'{latitude,source}'='human')then raise exception 'Explicit pin overwritten';end if;
 if exists(select 1 from original_reviews o join review_queue q using(id)where q.entity_id not in(md5('1')::uuid,md5('2')::uuid,md5('3')::uuid,md5('44')::uuid,md5('45')::uuid,md5('50')::uuid,md5('53')::uuid)and o.value<>to_jsonb(q))then raise exception 'A refused review changed';end if;
 if not exists(select 1 from event_quality_issues where id=md5('unrelated')::uuid and status='open')or not exists(select 1 from event_quality_current where event_id=md5('44')::uuid and open_issue_codes=array['IMAGE_MISSING'])then raise exception 'Unrelated finding changed';end if;
 if(select count(*)from admin_review_repairs)<>20 then raise exception 'Audit incomplete: %',(select count(*)from admin_review_repairs);end if;
 result:=api_private.reconcile_source_referenced_event_venues(200,false);if(result->>'linked_events')::int<>0 or(select count(*)from admin_review_repairs)<>20 then raise exception 'Not idempotent';end if;
 result:=public.run_event_venue_link();if not(result?'source_venue_references')or(result#>>'{source_venue_references,linked_events}')::int<>0 then raise exception 'Recurring hook failed';end if;
end$$;
"""
with tempfile.TemporaryDirectory(prefix='qg-source-ref-')as tmp:
 data=Path(tmp)/'data'
 subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55499 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:
  result=subprocess.run([str(PG/'psql'),'-h',tmp,'-p','55499','-d','postgres','-v','ON_ERROR_STOP=1'],input=schema+migration+dry+apply,text=True,capture_output=True)
  if result.returncode:raise RuntimeError(result.stderr)
 finally:
  subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: 53 source/ownership/geography cases; centroid/explicit/missing pins; pauses; browser denial; native hook; protected content; audits and idempotency')
