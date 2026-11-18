#!/usr/bin/env python3
"""Reproduce unrelated detector execution and retain exact neutral category evidence."""
import os
from pathlib import Path
import re
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
M=ROOT/'supabase/migrations'
source=(M/'20261021175220_review_ready_cases_and_research.sql').read_text()
native=re.search(r'create function public.repair_admin_review_mechanical[\s\S]*?end \$\$;',source).group()
source=(M/'99991790271091_event_data_quality_programme.sql').read_text()
branch=re.search(r"select 'validity','CATEGORY_UNRESOLVED'[\s\S]*?(?=\n    union all)",source).group()
patch=next(M.glob('*_bound_neutral_category_evidence.sql')).read_text()
schema=r"""
create schema api_private;create role anon;create role authenticated;create role service_role;
create table marketplace_brands(id uuid primary key,product_count integer,brand_key text,updated_at timestamptz);
create table marketplace_listings(id uuid,brand_key text,status text,duplicate_of_id uuid);
create table entity_quality_findings(entity_type text,entity_id uuid,reason_code text,state text,waived_at timestamptz,checked_at timestamptz,dimension text,evidence jsonb);
create table events(id uuid primary key,title text,description text,event_type text,duplicate_of_id uuid);
create table event_quality_issues(id uuid primary key,event_id uuid,status text,issue_code text,severity text,reviewed_by uuid,reviewed_at timestamptz,resolution text,evidence jsonb,evidence_hash text);
create table event_quality_current(event_id uuid,open_issue_codes text[]);
create table admin_review_repairs(entity_type text,entity_id uuid,reason text,previous_value jsonb,next_value jsonb);
create function public.infer_event_type(text,text)returns jsonb language sql immutable as $$select case when $1='Supported'then '{"event_type":"drag","confidence":0.9}'::jsonb else '{"event_type":"other","confidence":0}'::jsonb end$$;
create function api_private.expensive_unrelated()returns text language plpgsql volatile as $$begin raise exception 'Unrelated detector invoked';end$$;
insert into events select md5(n::text)::uuid,case when n=2 then 'Supported'else 'Neutral'end,'Keep description','other',null from generate_series(1,10)n;
insert into event_quality_issues select id,id,'open','CATEGORY_UNRESOLVED','medium',null,null,null,'{}','original'from events;
update event_quality_issues set reviewed_by=md5('staff')::uuid where id=md5('3')::uuid;
update event_quality_issues set reviewed_at=now()where id=md5('4')::uuid;
update event_quality_issues set resolution='Hold'where id=md5('5')::uuid;
update event_quality_issues set severity='critical'where id=md5('6')::uuid;
update events set duplicate_of_id=md5('canonical')::uuid where id=md5('7')::uuid;
update event_quality_issues set evidence='{"manual_hold":true}'where id=md5('8')::uuid;
update event_quality_issues set status='accepted'where id=md5('9')::uuid;
insert into event_quality_current select id,array['CATEGORY_UNRESOLVED','KEEP']from events;
create table before_events as select *from events;
create table before_issues as select *from event_quality_issues;
"""
detector="create function event_quality_findings(p_event_id uuid)returns table(dimension text,issue_code text,severity text,evidence jsonb)language sql stable security definer as $$with e as(select *from events where id=p_event_id) "+branch+" union all select 'linkage',api_private.expensive_unrelated(),'medium','{}'::jsonb$$;"
reference="create function reference_evidence(p_event_id uuid)returns jsonb language sql stable as $$select evidence from(with e as(select *from events where id=p_event_id) "+branch+")r(dimension,issue_code,severity,evidence)$$;"
before=r"""
revoke all on function repair_admin_review_mechanical(integer,boolean)from public;
grant execute on function repair_admin_review_mechanical(integer,boolean)to service_role;
create table security_before as select oid,proowner,proacl,proconfig,prosecdef from pg_proc where oid='repair_admin_review_mechanical(integer,boolean)'::regprocedure;
do $$begin
 begin perform repair_admin_review_mechanical(200,false);raise exception 'Expected original failure';
 exception when raise_exception then if sqlerrm<>'Unrelated detector invoked'then raise;end if;end;
end$$;
"""
checks=r"""
do $$declare r jsonb;begin
r:=repair_admin_review_mechanical(200,true);
if r->>'neutral_categories'<>'2'or exists(select 1 from admin_review_repairs)then raise exception 'Dry run failed: %',r;end if;
if repair_admin_review_mechanical(0,false)->>'neutral_categories'<>'0'then raise exception 'Zero bound lost';end if;
if repair_admin_review_mechanical(1,false)->>'neutral_categories'<>'1'then raise exception 'Batch bound lost';end if;
if repair_admin_review_mechanical(200,false)->>'neutral_categories'<>'1'then raise exception 'Remaining neutral missing';end if;
if exists(select 1 from event_quality_issues where id in(md5('1')::uuid,md5('10')::uuid)and(status<>'accepted'or evidence is distinct from reference_evidence(event_id)or evidence_hash<>md5(evidence::text)or reviewed_at is not null or reviewed_by is not null))then raise exception 'Evidence or machine attribution drift';end if;
if exists(select 1 from before_issues b join event_quality_issues i using(id)where b.id not in(md5('1')::uuid,md5('10')::uuid)and to_jsonb(b)<>to_jsonb(i))then raise exception 'Supported, critical, reviewed, hold, duplicate or accepted history changed';end if;
if exists((select *from events except select *from before_events))then raise exception 'Event fields changed';end if;
if repair_admin_review_mechanical(200,false)->>'neutral_categories'<>'0'then raise exception 'Repeat not idempotent';end if;
if exists(select 1 from security_before b join pg_proc p on p.oid=b.oid where row(p.proowner,p.proacl,p.proconfig,p.prosecdef)is distinct from row(b.proowner,b.proacl,b.proconfig,b.prosecdef))then raise exception 'Function security changed';end if;
end$$;
"""
with tempfile.TemporaryDirectory(prefix='qg-neutral-evidence-')as tmp:
    data=str(Path(tmp)/'data')
    subprocess.run([str(PG/'initdb'),'-D',data,'-A','trust','--no-locale','--encoding=UTF8'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([str(PG/'pg_ctl'),'-D',data,'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55496 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
    try:
        r=subprocess.run([str(PG/'psql'),'-X','-h',tmp,'-p','55496','-d','postgres','-v','ON_ERROR_STOP=1'],input=schema+detector+reference+native+before+patch+patch+checks,text=True,capture_output=True)
        if r.returncode:raise RuntimeError(r.stderr)
    finally:
        subprocess.run([str(PG/'pg_ctl'),'-D',data,'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: original unrelated detector failure reproduced; exact native evidence/hash retained; supported, critical, reviewed, held, duplicate and accepted history protected; bounds, dry/repeat, event preservation, security and idempotence pass')
