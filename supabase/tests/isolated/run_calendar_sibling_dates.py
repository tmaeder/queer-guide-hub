#!/usr/bin/env python3
"""Verify recurrence proof, refusals and sweep composition in disposable PostgreSQL."""

import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ.get("PG_BINDIR", "/opt/homebrew/opt/postgresql@17/bin"))
MIGRATION = ROOT / "supabase/migrations/99991794061574_review_calendar_sibling_dates.sql"
SCHEMA = """
create role anon;
create role authenticated;
create role service_role;
create schema api_private;
create schema auth;
create function auth.uid() returns uuid language sql as 'select null::uuid';
create function public.assert_admin_or_internal() returns void language sql as 'select';
create table public.admin_automations(slug text, enabled boolean);
insert into public.admin_automations values ('review_automatic_resolution',true);
create table public.events(
 id uuid primary key, data_source text, external_id text, title text, city_id uuid,
 country_id uuid, start_date timestamptz, timezone text, duplicate_of_id uuid, status text,
 field_provenance jsonb default '{}', description text default 'keep original'
);
create table public.event_sources(
 id uuid primary key, event_id uuid, source_slug text, source_entity_id text, is_primary boolean,
 payload_hash text, source_url text, payload jsonb
);
create table public.review_queue(
 id uuid primary key, entity_id uuid, entity_type text, review_type text, status text,
 resolved_at timestamptz, resolved_by uuid, details jsonb
);
create table public.content_revisions(source_table text, source_id uuid, actor_kind text, changed_fields text[]);
create table public.admin_review_repairs(entity_type text, entity_id uuid, reason text, previous_value jsonb, next_value jsonb);
create function api_private.run_review_automatic_resolution(p_batch integer,p_dry_run boolean) returns jsonb
language plpgsql as $fn$
declare v_limit integer:=p_batch;
begin return jsonb_build_object('dry_run',p_dry_run,'existing',42);end $fn$;

insert into events(id,data_source,external_id,title,city_id,country_id,start_date,timezone,status)
select md5(n||':'||side)::uuid,case when n=2 then 'bka-theater' else 'lab-oratory' end,
 case when n=2 then '416:2026-11-'||(case when side=0 then '12' else '19' end)||'T00:30'
  else md5(n||':'||side)::uuid::text end,
 'Programme '||n,md5('city')::uuid,md5('country')::uuid,
 case when side=0 then '2026-11-12T00:30:00+01:00'::timestamptz else '2026-11-19T00:30:00+01:00'::timestamptz end,
 'Europe/Berlin','active'
from generate_series(1,13) n cross join generate_series(0,1) side;
insert into event_sources
select e.id,e.id,e.data_source,e.external_id,true,md5(e.id::text)||md5(e.id::text),p.url,
 jsonb_build_object('raw',jsonb_build_object('source',e.data_source,'url',p.url),
   'normalized',jsonb_build_object('sourceId',e.external_id,'title',e.title,'start_date',e.start_date,
     'metadata',jsonb_build_object('source',e.data_source,'url',p.url,'block_id',e.external_id,'production_id','416')))
from events e
cross join lateral (select case when e.data_source='bka-theater' then 'https://www.bka-theater.de/content_start.php?id=416&tid='||
   case when e.id=md5('2:0')::uuid then '41' else '42' end
  else 'https://www.lab-oratory.de/'||replace(lower(e.title),' ','-') end url) p;

insert into review_queue
select e.id,e.id,'event','date_mismatch','pending',null,null,
 jsonb_build_object('source','event-agentic-enrich','page',s.source_url,
   'extracted_date','2026-11-19','start_date',e.start_date)
from generate_series(1,13) n join events e on e.id=md5(n||':0')::uuid join event_sources s on s.event_id=e.id;

-- All except 1 and 2 have a specific reason to remain in Review.
update review_queue set details=details||'{"manual_hold":true}' where id=md5('3:0')::uuid;
update review_queue set details=details||'{"start_date":"2026-11-12T03:30:00Z"}' where id=md5('4:0')::uuid;
update review_queue set details=details||'{"page":"https://another.example/"}' where id=md5('5:0')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,start_date}','"invalid"') where id=md5('6:1')::uuid;
update events set field_provenance='{"start_date":{"source":"editor"}}' where id=md5('7:0')::uuid;
insert into content_revisions values('events',md5('8:0')::uuid,'human',array['start_date']);
update events set status='cancelled' where id=md5('9:1')::uuid;
update events set city_id=md5('other-city')::uuid where id=md5('10:1')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,metadata,block_id}','"unknown"') where id=md5('11:1')::uuid;
update review_queue set details=details||'{"extracted_date":"2026-11-18"}' where id=md5('12:0')::uuid;
insert into events select md5('ambiguous')::uuid,data_source,md5('ambiguous')::uuid::text,title,city_id,country_id,
 start_date,timezone,null,status,field_provenance,description from events where id=md5('13:1')::uuid;
insert into event_sources select md5('ambiguous')::uuid,md5('ambiguous')::uuid,source_slug,md5('ambiguous')::uuid::text,
 true,repeat('a',64),source_url,
 jsonb_set(jsonb_set(payload,'{normalized,metadata,block_id}',to_jsonb(md5('ambiguous')::uuid::text)),
   '{normalized,sourceId}',to_jsonb(md5('ambiguous')::uuid::text))
from event_sources where id=md5('13:1')::uuid;
create table before_events as select id,to_jsonb(e) snapshot from events e;
"""

CHECKS = """
do $test$
declare result jsonb;
begin
 result:=api_private.reconcile_calendar_sibling_dates(100,true);
 if (result->>'matched')::int<>2 or exists(select 1 from admin_review_repairs) then
   raise exception 'Unexpected dry-run result %',result;
 end if;
 if (api_private.reconcile_calendar_sibling_dates(1,true)->>'matched')::int<>1
    or (api_private.reconcile_calendar_sibling_dates(0,false)->>'matched')::int<>0
 then raise exception 'Batch bounds failed';end if;
 update admin_automations set enabled=false;
 if api_private.reconcile_calendar_sibling_dates(100,false)->>'skipped' is distinct from 'paused'
 then raise exception 'Pause ignored';end if;
 update admin_automations set enabled=true;
 if has_function_privilege('authenticated','api_private.reconcile_calendar_sibling_dates(integer,boolean)','execute')
 then raise exception 'Browser permission granted';end if;
 result:=api_private.run_review_automatic_resolution(100,false);
 if (result#>>'{calendar_sibling_dates,matched}')::int<>2 or result->>'existing'<>'42'
 then raise exception 'Native sweep composition failed %',result;end if;
 if (select count(*) from review_queue where status='rejected' and resolved_by is null
   and details#>>'{other_occurrence,source_id}' is not null and details#>>'{saved_occurrence,source_id}' is not null)<>2
 or exists(select 1 from review_queue where status<>'pending' and id not in(md5('1:0')::uuid,md5('2:0')::uuid))
 then raise exception 'Unexpected proposal disposition';end if;
 if (select count(*) from admin_review_repairs where reason='calendar_sibling_date_proposal_discarded')<>2
 or exists(select 1 from events e join before_events b using(id) where to_jsonb(e) is distinct from b.snapshot)
 then raise exception 'Audit or event preservation failed';end if;
 if (api_private.reconcile_calendar_sibling_dates(100,false)->>'matched')::int<>0
 then raise exception 'Repeat call reapplied a repair';end if;
end $test$;
"""

with tempfile.TemporaryDirectory(prefix="qg-calendar-siblings-") as temp:
    data = Path(temp) / "data"
    subprocess.run([str(PG / "initdb"), "-D", str(data), "-A", "trust", "--no-locale"], check=True,
                   stdout=subprocess.DEVNULL)
    subprocess.run([str(PG / "pg_ctl"), "-D", str(data), "-l", str(Path(temp) / "postgres.log"),
                    "-o", f"-k {temp} -p 55499 -c listen_addresses=", "-w", "start"], check=True,
                   stdout=subprocess.DEVNULL)
    try:
        subprocess.run([str(PG / "psql"), "-h", temp, "-p", "55499", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
                       input=SCHEMA + MIGRATION.read_text() + CHECKS, text=True, check=True,
                       stdout=subprocess.DEVNULL)
    finally:
        subprocess.run([str(PG / "pg_ctl"), "-D", str(data), "-m", "fast", "-w", "stop"], check=True,
                       stdout=subprocess.DEVNULL)

print("PASS: two publisher contracts, 11 refusal cases, audit, pause, grants and native sweep")
