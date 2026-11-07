#!/usr/bin/env python3
"""Exercise Ticketmaster venue evidence and native review cleanup in PostgreSQL."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ.get("PG_BINDIR", "/opt/homebrew/opt/postgresql@17/bin"))

SCHEMA = """
create role anon; create role authenticated; create role service_role;
create schema api_private;
create table countries(id uuid primary key,code text);
create table cities(id uuid primary key,country_id uuid,name text,duplicate_of_id uuid,
 shell_status text,latitude numeric,longitude numeric);
create table events(id uuid primary key,title text,city_id uuid,country_id uuid,country text,
 state text,latitude numeric,longitude numeric,data_source text,external_id text,
 start_date timestamptz,venue_name text,address text,venue_id uuid,
 is_public boolean,safety_gated boolean,duplicate_of_id uuid,status text,field_provenance jsonb);
create table event_sources(id uuid primary key,event_id uuid,source_slug text,
 source_entity_id text,source_url text,payload_hash text,payload jsonb);
create table venues(id uuid,city_id uuid,name text,address text,duplicate_of_id uuid);
create table content_revisions(source_table text,source_id uuid,actor_kind text,changed_fields text[]);
create table review_queue(id uuid primary key,entity_id uuid,entity_type text,review_type text,
 status text,resolved_by uuid,resolved_at timestamptz,details jsonb);
create table event_quality_issues(id uuid primary key,event_id uuid,issue_code text,
 status text,detector text,reviewed_by uuid,reviewed_at timestamptz,resolved_at timestamptz,
 resolution text,evidence jsonb);
create table event_quality_current(event_id uuid,open_issue_codes text[],issue_codes text[]);
create table admin_review_repairs(entity_type text,entity_id uuid,reason text,previous_value jsonb,next_value jsonb);
create function city_canonical_key(text) returns text language sql immutable as 'select lower($1)';
create function geo_country_at(numeric,numeric) returns table(iso_a2 text)
 language sql immutable as 'select case when $1 between 32 and 49 then ''US'' else ''CA'' end';
create function haversine_m(numeric,numeric,numeric,numeric) returns numeric
 language sql immutable as 'select sqrt(power(($1-$3)*111000,2)+power(($2-$4)*80000,2))';
create function api_private.event_source_confirms_park_location(uuid,text,text,text,text)
 returns boolean language sql stable as 'select false';
create function event_quality_findings(uuid) returns table(issue_code text) language sql stable as $$
 select 'NAMED_VENUE_UNLINKED' from events e where e.id=$1
 and not api_private.event_source_confirms_park_location(e.id,e.data_source,e.external_id,e.venue_name,e.address)
 union all select 'IMAGE_MISSING'
$$;
create function reconcile_event_venue_link_reviews() returns bigint language sql stable as $$
 select count(*) from (
  select e.id from events e where
   not api_private.event_source_confirms_park_location(e.id,e.data_source,e.external_id,e.venue_name,e.address)
  union all select e.id from events e where
   not api_private.event_source_confirms_park_location(e.id,e.data_source,e.external_id,e.venue_name,e.address)
 ) eligible
$$;
create function api_private.get_event_venue_review_context(uuid,text) returns jsonb language sql stable as $$
 select jsonb_build_object('source_url',s.source_url) from event_sources s where event_id=$1
$$;
insert into countries values(md5('US')::uuid,'US');
insert into cities values(md5('city')::uuid,md5('US')::uuid,'Springfield',null,'real',41,-72);
insert into events select md5(n::text)::uuid,'Concert '||n,md5('city')::uuid,md5('US')::uuid,'US',
 'Massachusetts',41.01,-72.01,'ticketmaster','evt-'||n,'2026-11-12T22:30:00Z',
 'Hall '||n,n||' Main St',null,true,false,null,'active','{}'
 from generate_series(1,10)n;
insert into event_sources select e.id,e.id,e.data_source,e.external_id,null,repeat('a',64),
 jsonb_build_object('raw',jsonb_build_object(
 'id',e.external_id,'url','https://www.ticketmaster.com/event/'||e.external_id,'name',e.title,
 'dates',jsonb_build_object('start',jsonb_build_object('dateTime',e.start_date)),
 '_embedded',jsonb_build_object('venues',jsonb_build_array(jsonb_build_object(
 'id','venue-'||e.external_id,'name',e.venue_name,'postalCode','01103',
 'address',jsonb_build_object('line1',e.address),'city',jsonb_build_object('name','Springfield'),
 'state',jsonb_build_object('name',e.state,'stateCode','MA'),'country',jsonb_build_object('countryCode','US'),
 'location',jsonb_build_object('latitude',e.latitude::text,'longitude',e.longitude::text))))),
 'normalized',jsonb_build_object('sourceId',e.external_id,'sourceName',e.data_source,'venue_name',e.venue_name,
 'metadata',jsonb_build_object('ticketmaster_id',e.external_id),'location',jsonb_build_object('address',e.address),
 'dates',jsonb_build_object('start',e.start_date))) from events e;
insert into review_queue select id,id,'event','venue_link_candidate','pending',null,null,
 jsonb_build_object('source','venue_quality_v2','resolution','no_precision_match',
 'ambiguous',true,'candidates','[]'::jsonb,'event_venue_name',venue_name) from events;
insert into event_quality_issues select id,id,'NAMED_VENUE_UNLINKED','open','event-quality-scan',
 null,null,null,null,'{}' from events;
insert into event_quality_current select id,array['NAMED_VENUE_UNLINKED','IMAGE_MISSING'],
 array['NAMED_VENUE_UNLINKED','IMAGE_MISSING'] from events;
update event_sources set payload=jsonb_set(payload,'{raw,_embedded,venues,0,state,name}','"Missouri"') where id=md5('2')::uuid;
update event_sources set payload=jsonb_set(payload,'{raw,_embedded,venues,0,location,latitude}','"bad"') where id=md5('3')::uuid;
update event_sources set payload=jsonb_set(payload,'{raw,_embedded,venues}',payload#>'{raw,_embedded,venues}'||payload#>'{raw,_embedded,venues}') where id=md5('4')::uuid;
insert into venues values(md5('v5')::uuid,md5('city')::uuid,'Other Hall','5 Main St, Springfield',null);
update review_queue set details=details||'{"manual_hold":true}' where id=md5('6')::uuid;
insert into content_revisions values('events',md5('7')::uuid,'human',array['address']);
update event_quality_issues set reviewed_at=now() where id=md5('8')::uuid;
update event_sources set payload=jsonb_set(payload,'{raw,url}','"https://ticketmaster.com.example/event"') where id=md5('9')::uuid;
update event_sources set payload=jsonb_set(payload,'{raw,dates,start,dateTime}','"2026-11-13T22:30:00Z"') where id=md5('10')::uuid;
create table before_events as select id,to_jsonb(e) value from events e;
"""

CHECKS = """
do $checks$
declare good uuid:=md5('1')::uuid;
begin
 if (select array_agg(id) from review_queue where status='resolved') is distinct from array[good]
  or (select array_agg(id) from event_quality_issues where status='resolved') is distinct from array[good]
  or (select count(*) from admin_review_repairs where reason='ticketmaster_confirmed_event_location:v1')<>2
 then raise exception 'Wrong review records cleared';end if;
 if exists(select from events e join before_events b using(id) where to_jsonb(e)<>b.value)
 then raise exception 'Event changed';end if;
 if exists(select from event_quality_findings(good) where issue_code='NAMED_VENUE_UNLINKED')
  or not exists(select from event_quality_findings(md5('9')::uuid) where issue_code='NAMED_VENUE_UNLINKED')
  or (select open_issue_codes from event_quality_current where event_id=good)<>array['IMAGE_MISSING']
  or reconcile_event_venue_link_reviews()<>18
 then raise exception 'Native queue producer or unrelated quality code changed';end if;
 if api_private.get_event_venue_review_context(good,null)->>'source_url'<>'https://www.ticketmaster.com/event/evt-1'
  or api_private.get_event_venue_review_context(md5('9')::uuid,null)->>'source_url' is not null
 then raise exception 'Publisher source context is missing or unsafe';end if;
 insert into venues values(md5('v1')::uuid,md5('city')::uuid,'Hall 1','1 Main St',null);
 if not exists(select from event_quality_findings(good) where issue_code='NAMED_VENUE_UNLINKED')
 then raise exception 'New catalogue match did not restore the link finding';end if;
end $checks$;
"""

migration = ROOT / "supabase/migrations/99991794067500_review_ticketmaster_confirmed_locations.sql"
with tempfile.TemporaryDirectory() as temp:
    data = Path(temp) / "data"
    subprocess.run([PG / "initdb", "-D", data, "-A", "trust", "-U", "postgres"], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([PG / "pg_ctl", "-D", data, "-l", Path(temp) / "postgres.log", "-o", f"-k {temp} -c listen_addresses=''", "-w", "start"], check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run([PG / "psql", "-h", temp, "-U", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-q"],
                       input=SCHEMA + migration.read_text() + CHECKS, text=True, check=True)
    finally:
        subprocess.run([PG / "pg_ctl", "-D", data, "-m", "immediate", "stop"], check=True, stdout=subprocess.DEVNULL)
print("Ticketmaster location evidence, review cleanup, catalogue changes, and source links passed")
