#!/usr/bin/env python3
"""Run the original liveness cleanup against a detector with an expensive unrelated branch."""
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
M=ROOT/'supabase/migrations'
source=(M/'99991792706043_review_queue_automatic_recovery.sql').read_text()
block=re.search(r'\$block\$([\s\S]*?)\$block\$\|\|anchor',source).group(1)
detector_source=(M/'99991790271091_event_data_quality_programme.sql').read_text()
branch=re.search(r"select 'freshness','LIVENESS_STALE'[\s\S]*?(?=\n    union all)",detector_source).group()
# Production no longer treats an unknown liveness label as stale by itself.
# The new migration refuses to run if this exact current predicate changes.
branch=branch.replace(" or liveness_status='unknown'",'')
patch=next(M.glob('*_bound_review_liveness_cleanup.sql')).read_text()
schema=r"""
create role anon;create role authenticated;create role service_role;create schema api_private;
create table events(id uuid primary key,start_date timestamptz,end_date timestamptz,status text,website text,ticket_url text,last_verified_at timestamptz,liveness_status text,duplicate_of_id uuid);
create table event_quality_issues(id uuid primary key,event_id uuid,status text default 'open',detector text default 'event-quality-scan',issue_code text default 'LIVENESS_STALE',reviewed_by uuid,reviewed_at timestamptz,resolution text,resolved_at timestamptz);
create table event_quality_current(event_id uuid,open_issue_codes text[],issue_codes text[]);
create table admin_review_repairs(entity_type text,entity_id uuid,reason text,previous_value jsonb,next_value jsonb);
create table admin_automations(enabled boolean);
insert into admin_automations values(true);
create function api_private.unrelated_detector()returns text language plpgsql volatile as $$begin raise exception 'Unrelated expensive detector invoked';end$$;
insert into events
select md5(row_number()over()::text)::uuid,starts,ends,state,url,ticket,verified,'unknown',null
from unnest(array[now()+interval '1 day',now()-interval '1 day',null])starts
cross join unnest(array[now()+interval '2 days',now()-interval '2 days',null])ends
cross join unnest(array['active','completed','cancelled',null])state
cross join unnest(array['https://owner.test','',null])url
cross join unnest(array['https://tickets.test',null])ticket
cross join unnest(array[now(),now()-interval '7 days',now()-interval '8 days',null])verified;
insert into event_quality_issues(id,event_id)select id,id from events;
update event_quality_issues set reviewed_by=md5('reviewer')::uuid where id in(select id from events order by id limit 3);
update event_quality_issues set reviewed_at=now()where id in(select id from events order by id offset 3 limit 3);
update event_quality_issues set resolution='Hold'where id in(select id from events order by id offset 6 limit 3);
update events set duplicate_of_id=md5('duplicate')::uuid where id in(select id from events order by id offset 9 limit 3);
insert into event_quality_current select id,array['LIVENESS_STALE','KEEP'],array['LIVENESS_STALE','KEEP']from events;
create table before_events as select *from events;
create table before_issues as select *from event_quality_issues;
"""
cte="""with e as(select ev.*,case when coalesce(ev.end_date,ev.start_date) >= now() then 'current' else 'historical' end as event_scope from events ev where ev.id=p_event_id) """
detector="create function public.event_quality_findings(p_event_id uuid)returns table(dimension text,issue_code text,severity text,evidence jsonb)language sql stable security definer set search_path=public as $function$"+cte+branch+"\n union all select 'linkage',api_private.unrelated_detector(),'medium','{}'::jsonb $function$;"
reference="create function api_private.reference_liveness(p_event_id uuid)returns table(dimension text,issue_code text,severity text,evidence jsonb)language sql stable as $function$"+cte+branch+" $function$;"
reconciler="""create function api_private.run_review_automatic_resolution(p_batch integer,p_dry_run boolean)returns jsonb language plpgsql security definer set search_path=''as $$declare r record;v_limit integer:=greatest(0,least(500,p_batch));v_liveness integer:=0;v_after jsonb;begin
if not pg_try_advisory_xact_lock(hashtext('review_automatic_resolution'))then return '{"skipped":"already_running"}';end if;
if exists(select 1 from public.admin_automations where not enabled)then return '{"skipped":"paused"}';end if;
"""+block+"""return jsonb_build_object('count',v_liveness);end$$;"""
before=r"""
revoke all on function api_private.run_review_automatic_resolution(integer,boolean)from public;
grant execute on function api_private.run_review_automatic_resolution(integer,boolean)to service_role;
create table security_before as select oid,proowner,proacl,proconfig,prosecdef from pg_proc where oid='api_private.run_review_automatic_resolution(integer,boolean)'::regprocedure;
create table expected as select i.id from event_quality_issues i join events e on e.id=i.event_id where i.reviewed_by is null and i.reviewed_at is null and i.resolution is null and e.duplicate_of_id is null and not exists(select 1 from api_private.reference_liveness(e.id));
do $$begin
 begin perform api_private.run_review_automatic_resolution(2,true);raise exception 'Original failure missing';
 exception when raise_exception then if sqlerrm<>'Unrelated expensive detector invoked'then raise;end if;end;
end$$;
"""
checks=r"""
do $$declare r jsonb;n integer;begin
r:=api_private.run_review_automatic_resolution(500,true);
if(r->>'count')::integer<>least(500,(select count(*)from expected))or exists(select 1 from admin_review_repairs)then raise exception 'Dry-run mismatch: %',r;end if;
update admin_automations set enabled=false;
if api_private.run_review_automatic_resolution(500,false)->>'skipped'<>'paused'then raise exception 'Pause bypassed';end if;
update admin_automations set enabled=true;
r:=api_private.run_review_automatic_resolution(0,false);
if r->>'count'<>'0'then raise exception 'Zero bound ignored';end if;
r:=api_private.run_review_automatic_resolution(7,false);
if r->>'count'<>'7'or(select count(*)from admin_review_repairs)<>7 then raise exception 'Batch bound lost: %',r;end if;
for n in 1..10 loop perform api_private.run_review_automatic_resolution(500,false);end loop;
if exists(select id from event_quality_issues where status='resolved'except select id from expected)
or exists(select id from expected except select id from event_quality_issues where status='resolved')then raise exception 'Reference detector semantics changed';end if;
if exists((select *from events except select *from before_events))then raise exception 'Event fields changed';end if;
if exists(select 1 from before_issues b join event_quality_issues i using(id)where b.id not in(select id from expected)and to_jsonb(b)<>to_jsonb(i))then raise exception 'Protected issue changed';end if;
if exists(select 1 from event_quality_current where not 'KEEP'=any(issue_codes)or not 'KEEP'=any(open_issue_codes))then raise exception 'Unrelated finding lost';end if;
if api_private.run_review_automatic_resolution(500,false)->>'count'<>'0'then raise exception 'Repeat changed rows';end if;
if exists(select 1 from security_before b join pg_proc p on p.oid=b.oid where row(p.proowner,p.proacl,p.proconfig,p.prosecdef)is distinct from row(b.proowner,b.proacl,b.proconfig,b.prosecdef))then raise exception 'Function security changed';end if;
end$$;
"""
with tempfile.TemporaryDirectory(prefix='qg-liveness-cleanup-')as tmp:
    data=str(Path(tmp)/'data')
    subprocess.run([str(PG/'initdb'),'-D',data,'-A','trust','--no-locale','--encoding=UTF8'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([str(PG/'pg_ctl'),'-D',data,'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55493 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
    try:
        r=subprocess.run([str(PG/'psql'),'-X','-h',tmp,'-p','55493','-d','postgres','-v','ON_ERROR_STOP=1'],input='begin;'+schema+detector+reference+reconciler+before+patch+patch+checks+'rollback;',text=True,capture_output=True)
        if r.returncode:raise RuntimeError(r.stderr)
    finally:
        subprocess.run([str(PG/'pg_ctl'),'-D',data,'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: original unrelated-detector failure reproduced; full freshness matrix matches native detector; bounds, protected reviews, pause/dry/repeat, security and idempotence preserved')
