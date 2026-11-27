#!/usr/bin/env python3
"""Hold a real cache-row lock in a second connection; both native cleanups must skip it."""
import ast
import os
from pathlib import Path
import re
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[3]
M=ROOT/'supabase/migrations'
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
tree=ast.parse((Path(__file__).parent/'run_neutral_category_evidence.py').read_text())
schema=next(ast.literal_eval(n.value)for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='schema'for t in n.targets))
schema+="""
alter table events add start_date timestamptz default now()-interval '1 day',add end_date timestamptz,add status text default 'active',add website text default 'https://owner.test',add ticket_url text,add last_verified_at timestamptz,add liveness_status text;
alter table event_quality_issues add detector text default 'event-quality-scan',add resolved_at timestamptz;
alter table event_quality_current add issue_codes text[];
update event_quality_current set issue_codes=open_issue_codes;
insert into event_quality_issues(id,event_id,status,issue_code,severity)select md5('live-'||id)::uuid,id,'open','LIVENESS_STALE','high'from events where id in(md5('1')::uuid,md5('10')::uuid);
update event_quality_current set open_issue_codes=array_append(open_issue_codes,'LIVENESS_STALE'),issue_codes=array_append(issue_codes,'LIVENESS_STALE');
"""
source=(M/'20261021175220_review_ready_cases_and_research.sql').read_text()
neutral=re.search(r'create function public.repair_admin_review_mechanical[\s\S]*?end \$\$;',source).group()
source=(M/'99991792706043_review_queue_automatic_recovery.sql').read_text()
block=re.search(r'\$block\$([\s\S]*?)\$block\$\|\|anchor',source).group(1)
liveness="""create function api_private.run_review_automatic_resolution(p_batch integer,p_dry_run boolean)returns jsonb language plpgsql security definer set search_path=''as $$declare r record;v_limit integer:=greatest(0,least(500,p_batch));v_liveness integer:=0;v_after jsonb;begin
"""+block+"""return jsonb_build_object('count',v_liveness);end$$;"""
source=(M/'99991790271091_event_data_quality_programme.sql').read_text()
category=re.search(r"select 'validity','CATEGORY_UNRESOLVED'[\s\S]*?(?=\n    union all)",source).group()
freshness=re.search(r"select 'freshness','LIVENESS_STALE'[\s\S]*?(?=\n    union all)",source).group().replace(" or liveness_status='unknown'",'')
detector="""create function event_quality_findings(p_event_id uuid)returns table(dimension text,issue_code text,severity text,evidence jsonb)language sql stable security definer as $$with e as(select ev.*,case when coalesce(ev.end_date,ev.start_date) >= now() then 'current' else 'historical' end as event_scope from events ev where ev.id=p_event_id) """+category+" union all "+freshness+"$$;"
patches=''.join(next(M.glob('*_'+name+'.sql')).read_text()for name in ['bound_review_liveness_cleanup','bound_neutral_category_evidence'])
patch=next(M.glob('*_skip_busy_review_quality_caches.sql')).read_text()
checks_locked="""
set statement_timeout='2s';
do $$declare n jsonb;l jsonb;begin
 n:=repair_admin_review_mechanical(200,false);
 l:=api_private.run_review_automatic_resolution(200,false);
 if n->>'neutral_categories'<>'1'or l->>'count'<>'1'then raise exception 'Busy row was not skipped: %, %',n,l;end if;
 if exists(select 1 from event_quality_issues where event_id=md5('1')::uuid and status<>'open')then raise exception 'Busy issue changed';end if;
end$$;
"""
checks_unlocked="""
set statement_timeout='2s';
do $$declare n jsonb;l jsonb;begin
 n:=repair_admin_review_mechanical(200,false);
 l:=api_private.run_review_automatic_resolution(200,false);
 if n->>'neutral_categories'<>'1'or l->>'count'<>'1'then raise exception 'Released row not revisited: %, %',n,l;end if;
 if exists(select 1 from event_quality_issues where event_id=md5('1')::uuid and status='open')then raise exception 'Released issue left open';end if;
 if exists(select 1 from event_quality_current where event_id in(md5('1')::uuid,md5('10')::uuid)and(open_issue_codes<>array['KEEP']or issue_codes<>array['CATEGORY_UNRESOLVED','KEEP']))then raise exception 'Cache updates wrong';end if;
end$$;
"""
with tempfile.TemporaryDirectory(prefix='qg-cache-locks-')as tmp:
    data=str(Path(tmp)/'data')
    subprocess.run([str(PG/'initdb'),'-D',data,'-A','trust','--no-locale','--encoding=UTF8'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([str(PG/'pg_ctl'),'-D',data,'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55497 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
    args=[str(PG/'psql'),'-X','-qAt','-h',tmp,'-p','55497','-d','postgres','-v','ON_ERROR_STOP=1']
    def run(sql):
        r=subprocess.run(args,input=sql,text=True,capture_output=True)
        if r.returncode:raise RuntimeError(r.stderr)
    locker=None
    try:
        run(schema+neutral+liveness+detector+patches+patch+patch)
        locker=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
        locker.stdin.write("begin;select event_id from event_quality_current where event_id=md5('1')::uuid for update;select 'LOCK_READY';\n");locker.stdin.flush()
        while locker.stdout.readline().strip()!='LOCK_READY':
            if locker.poll()is not None:raise RuntimeError('Lock setup failed')
        run(checks_locked)
        locker.stdin.write('rollback;\\q\n');locker.stdin.flush();locker.communicate(timeout=5);locker=None
        run(checks_unlocked)
    finally:
        if locker is not None:locker.terminate();locker.communicate(timeout=5)
        subprocess.run([str(PG/'pg_ctl'),'-D',data,'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: both native cleanups skip a genuinely locked cache row within 2s, repair other candidates, revisit it after release, preserve other codes and apply twice')
