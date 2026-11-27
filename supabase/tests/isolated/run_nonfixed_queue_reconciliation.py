#!/usr/bin/env python3
"""Reproduce stale multi-site candidates using the actual native proof contract."""
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ.get("PG_BINDIR", "/opt/homebrew/opt/postgresql@17/bin"))
helper_source = (ROOT / "supabase/migrations/99991794072220_review_verified_nonfixed_event_locations.sql").read_text()
helper = re.search(r"create or replace function api_private.event_has_verified_nonfixed_location[\s\S]*?\$fn\$;", helper_source).group()
baseline = (ROOT / "supabase/tests/fixtures/nonfixed-queue-reconciliation-baseline.sql").read_text()
# The assertion must count executable code, not an example in prose.
baseline = baseline.replace("AS $function$\n", "AS $function$\n-- Old branch: case when e.venue_id is not null then 'venue_linked' else 'event_no_longer_actionable' end\n", 1)
patch = (ROOT / "supabase/migrations/99991795038004_review_pending_nonfixed_manual_holds.sql").read_text()
schema = r"""
create schema api_private;
create table events(id uuid primary key,title text,venue_name text,city_id uuid,country_id uuid,
 start_date timestamptz,end_date timestamptz,venue_id uuid,address text,is_public boolean,
 safety_gated boolean,duplicate_of_id uuid,status text,event_type text,data_source text,external_id text,field_provenance jsonb);
create table event_sources(id uuid primary key,event_id uuid,is_primary boolean,source_slug text,source_entity_id text,payload_hash text);
create table review_queue(id uuid primary key default gen_random_uuid(),entity_type text,entity_id uuid,
 review_type text,status text,resolved_by uuid,resolved_at timestamptz,details jsonb);
create table event_quality_issues(event_id uuid,issue_code text,status text,reviewed_by uuid,
 reviewed_at timestamptz,resolved_at timestamptz,resolution text,evidence jsonb);
create function api_private.event_source_lists_multiple_venues(uuid,text,text,text,text)returns boolean language sql as $$select false$$;
create function api_private.event_source_confirms_park_location(uuid,text,text,text,text)returns boolean language sql as $$select false$$;
create function api_private.event_source_confirms_ticketmaster_location(uuid,text,text,text,text)returns boolean language sql as $$select false$$;
insert into events select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 'Programme '||i,'Resort programme','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
 now()+interval '10 days',now()+interval '17 days',null,null,true,false,null,'active','pride','fixture',i::text,'{}'
 from generate_series(1,15)i;
insert into event_sources select ('10000000-0000-0000-0000-'||lpad(external_id,12,'0'))::uuid,id,true,'fixture',external_id,'source-hash' from events;
insert into review_queue(entity_type,entity_id,review_type,status,details)
 select 'event',id,'venue_link_candidate','pending','{"source":"venue_quality_v2","resolution":"no_precision_match"}' from events;
update events e set field_provenance=jsonb_build_object('venue_scope',jsonb_build_object(
 'contract','organizer_venue_scope.v1','scope','multi_site','title',e.title,'venue_label',e.venue_name,
 'city_id',e.city_id,'country_id',e.country_id,'start_date',e.start_date,'end_date',e.end_date,
 'source_id',s.id,'payload_hash',s.payload_hash,'capture_sha256',repeat('a',64),'url','https://organizer.example/programme'))
 from event_sources s where s.event_id=e.id;
update event_sources set payload_hash='newer-source'where source_entity_id='2';
update events set title='Changed title'where external_id='3';
update events set start_date=start_date+interval '1 day'where external_id='4';
update events set is_public=false where external_id='5';
-- Existing reconciler already closes non-public records; keep this fixture public
-- and use a duplicate-free, public event whose native privacy gate is safety_gated.
update events set is_public=true,safety_gated=true where external_id='5';
update events set address='Fixed location'where external_id='6';
update review_queue set details=details||'{"manual_hold":true}'where entity_id=(select id from events where external_id='7');
update review_queue set resolved_by='40000000-0000-0000-0000-000000000001'where entity_id=(select id from events where external_id='8');
insert into event_quality_issues(event_id,issue_code,status,evidence)
 select id,'NAMED_VENUE_UNLINKED','open','{"manual_review_required":true}'from events where external_id='9';
update events set end_date=null where external_id='10';
insert into event_quality_issues(event_id,issue_code,status,reviewed_by)
 select id,'NAMED_VENUE_UNLINKED','accepted','40000000-0000-0000-0000-000000000001'from events where external_id='11';
update events set country_id='30000000-0000-0000-0000-000000000002'where external_id='12';
update review_queue set details=details||'{"human_reviewed":false}'where entity_id=(select id from events where external_id='13');
update events set event_type='cruise',field_provenance=jsonb_set(field_provenance,'{venue_scope,scope}','"onboard"')where external_id='14';
update events set field_provenance=jsonb_set(field_provenance,'{venue_scope,scope}','"onboard"')where external_id='15';
create temp table queue_before as select * from review_queue;
create temp table events_before as select * from events;
"""
before = r"""
select reconcile_event_venue_link_reviews();
do $$begin
 if exists(select 1 from review_queue where status<>'pending')then raise exception 'Baseline changed fixture';end if;
 if not exists(select 1 from events where external_id='1'and api_private.event_has_verified_nonfixed_location(id,field_provenance))then raise exception 'Native proof not valid';end if;
end$$;
create temp table function_before as select proowner,proacl,proconfig,prosecdef from pg_proc where oid='reconcile_event_venue_link_reviews()'::regprocedure;
"""
closing_paths = r"""
-- Every legacy closing condition needs a held row and an unheld control.
insert into events select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 'Programme '||i,'Fixed programme','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
 now()+interval '10 days',now()+interval '17 days',null,null,true,false,null,'active','pride','fixture',i::text,'{}'
 from generate_series(16,29)i;
insert into review_queue(entity_type,entity_id,review_type,status,details)
 select 'event',id,'venue_link_candidate','pending','{"source":"venue_quality_v2"}' from events where external_id::int>=16;
update events set venue_id='50000000-0000-0000-0000-000000000001' where external_id in('16','21','26','28');
update events set duplicate_of_id='00000000-0000-0000-0000-000000000001' where external_id in('17','22');
update events set is_public=false where external_id in('18','23','29');
update events set start_date=now()-interval '2 days' where external_id in('19','24','27');
update events set venue_name='' where external_id in('20','25');
update review_queue set details=details||'{"manual_hold":true}' where entity_id=(select id from events where external_id='16');
update review_queue set resolved_by='40000000-0000-0000-0000-000000000001' where entity_id=(select id from events where external_id='17');
update review_queue set resolved_at=now() where entity_id=(select id from events where external_id='19');
update review_queue set details=details||'{"requires_confirm":true}' where entity_id=(select id from events where external_id='20');
update review_queue set details=details||'{"hard_blocker":true}' where entity_id=(select id from events where external_id='28');
insert into event_quality_issues(event_id,issue_code,status,evidence)
 select id,'NAMED_VENUE_UNLINKED','open','{"manual_review_required":true}' from events where external_id in('18','27');
insert into event_quality_issues(event_id,issue_code,status,reviewed_by)
 select id,'NAMED_VENUE_UNLINKED','accepted','40000000-0000-0000-0000-000000000001' from events where external_id='26';
insert into event_quality_issues(event_id,issue_code,status,reviewed_at)
 select id,'NAMED_VENUE_UNLINKED','open',now() from events where external_id='29';
truncate queue_before,events_before;
insert into queue_before select * from review_queue;
insert into events_before select * from events;
select reconcile_event_venue_link_reviews();
do $$begin
 if (select count(*) from review_queue where status='resolved')<>14 then raise exception 'Unsafe legacy closing paths not reproduced';end if;
end$$;
delete from review_queue;
insert into review_queue select * from queue_before;
"""
checks = r"""
select reconcile_event_venue_link_reviews();
do $$begin
 if(select count(*)from review_queue where status='resolved'and details->>'resolution'='verified_nonfixed_location')<>2 then raise exception 'Valid multi-site/onboard candidates did not close';end if;
 if exists(select 1 from review_queue q join events e on e.id=q.entity_id where e.external_id not in('1','14','21','22','23','24','25')and to_jsonb(q)is distinct from(select to_jsonb(b)from queue_before b where b.id=q.id))then raise exception 'Held/stale/mismatched candidate changed';end if;
 if (select count(*) from review_queue where status='resolved')<>7 then raise exception 'Unheld closing controls did not resolve';end if;
 if not exists(select 1 from review_queue q join events e on e.id=q.entity_id where e.external_id='21' and q.details->>'resolution'='venue_linked') then raise exception 'Linked control lost its resolution';end if;
 if (select count(*) from review_queue q join events e on e.id=q.entity_id where e.external_id in('22','23','24','25') and q.details->>'resolution'='event_no_longer_actionable')<>4 then raise exception 'Legacy closing controls lost their resolution';end if;
 if exists((select * from events except select * from events_before)union all(select * from events_before except select * from events))then raise exception 'Event content mutated';end if;
 if exists(select 1 from function_before b cross join pg_proc p where p.oid='reconcile_event_venue_link_reviews()'::regprocedure and row(p.proowner,p.proacl,p.proconfig,p.prosecdef)is distinct from row(b.proowner,b.proacl,b.proconfig,b.prosecdef))then raise exception 'Function security changed';end if;
 if exists(select 1 from review_queue where status='resolved'and resolved_by is not null)then raise exception 'Human verification invented';end if;
end$$;
select reconcile_event_venue_link_reviews();
do $$begin if(select count(*)from review_queue)<>29 then raise exception 'Resolved proof reopened or duplicate created';end if;end$$;
"""
with tempfile.TemporaryDirectory(prefix="qg-nonfixed-") as tmp:
    data = str(Path(tmp) / "data")
    subprocess.run([str(PG / "initdb"), "-D", data, "-A", "trust", "--no-locale"], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([str(PG / "pg_ctl"), "-D", data, "-l", str(Path(tmp) / "postgres.log"), "-o", f"-k {tmp} -p 55493 -c listen_addresses=", "-w", "start"], check=True, stdout=subprocess.DEVNULL)
    try:
        result = subprocess.run([str(PG / "psql"), "-X", "-h", tmp, "-p", "55493", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input=schema + helper + baseline + before + closing_paths + patch + patch + checks, text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr)
    finally:
        subprocess.run([str(PG / "pg_ctl"), "-D", data, "-m", "fast", "-w", "stop"], check=True, stdout=subprocess.DEVNULL)
print("PASS: stale queue and unsafe legacy closures reproduced; 7 valid controls close; 22 held/stale/unsafe cases preserved; no event or security changes; repeat runs remain stable")
