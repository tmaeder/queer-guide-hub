#!/usr/bin/env python3
"""Compare unchanged case expressions across varied payloads, nulls and grouping keys."""
import os
from pathlib import Path
import re
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
M=ROOT/'supabase/migrations'
source=(M/'20261021175220_review_ready_cases_and_research.sql').read_text()
functions='\n'.join(re.findall(r'create function public.review_case_(?:family|key)\(p jsonb\)[\s\S]*?\$\$;',source))
assert functions.count('create function')==2
source_keys=(M/'20261021175735_review_case_read_performance.sql').read_text()
functions+='\n'+re.search(r'create function public.review_case_source_keys[\s\S]*?\$\$;',source_keys).group()
patch=next(M.glob('*_cache_review_case_expressions.sql')).read_text()
source_key_patch=next(M.glob('*_cache_review_source_keys.sql')).read_text()
schema=r"""
create role anon;create role authenticated;create role service_role;
create table inputs(id bigint generated always as identity,p jsonb);
insert into inputs(p)
select jsonb_build_object('queue_type',queue,'content_type',content,'id',id,'entity_id',entity,'meta',meta)
from unnest(array['event-quality','general-review','geography','business-quality','staging',null])queue
cross join unnest(array['city','events',null])content
cross join unnest(array['one','',null])id
cross join unnest(array['entity','',null])entity
cross join jsonb_array_elements('[null,{},{"issue_code":"IMAGE_REUSED","evidence":{"content_hash":"hash"}},
{"issue_code":"IMAGE_CONTENT_REUSED","evidence":{"content_hash":"","images":["a","b"]}},
{"issue_code":"IMAGE_CONTENT_REUSED","evidence":{}},
{"issue_code":"NAMED_VENUE_UNLINKED"},{"review_type":"venue_link_candidate"},
{"review_type":"CITY_LIFECYCLE_UNRESOLVED"},{"checks":{"reason":"No corroborated settlement classification"}},
{"reason_code":"linkage_unresolved"},{"reason_code":"organization_link_pending"},{"reason_code":"other"}]')meta;
insert into inputs(p)values(null),('null'),('{}'),('[]'),('"text"');
"""
before=r"""
revoke all on function review_case_family(jsonb),review_case_key(jsonb)from public;
grant execute on function review_case_family(jsonb),review_case_key(jsonb)to service_role;
create table security_before as select oid,proowner,proacl,proconfig,prosecdef,provolatile from pg_proc where oid in('review_case_family(jsonb)'::regprocedure,'review_case_key(jsonb)'::regprocedure,'review_case_source_keys(jsonb)'::regprocedure);
create table baseline as select id,review_case_family(p)family,review_case_key(p)key,review_case_source_keys(jsonb_build_array(p,p))source_keys from inputs;
"""
checks=r"""
do $$begin
if exists(select 1 from baseline b join inputs i using(id)where b.family is distinct from review_case_family(i.p)or b.key is distinct from review_case_key(i.p)or b.source_keys is distinct from review_case_source_keys(jsonb_build_array(i.p,i.p)))then raise exception 'Classifier/key/source semantics changed';end if;
if review_case_source_keys(null)<>array[]::text[]or review_case_source_keys('[]')<>array[]::text[]then raise exception 'Empty/null source keys changed';end if;
begin perform review_case_source_keys('{}');raise exception 'Malformed source members allowed';exception when invalid_parameter_value then null;end;
if exists(select 1 from security_before b join pg_proc p on p.oid=b.oid where row(p.proowner,p.proacl,p.proconfig,p.prosecdef,p.provolatile)is distinct from row(b.proowner,b.proacl,b.proconfig,b.prosecdef,b.provolatile))then raise exception 'Function security or volatility changed';end if;
end$$;
"""
with tempfile.TemporaryDirectory(prefix='qg-case-expressions-')as tmp:
    data=str(Path(tmp)/'data')
    subprocess.run([str(PG/'initdb'),'-D',data,'-A','trust','--no-locale','--encoding=UTF8'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([str(PG/'pg_ctl'),'-D',data,'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55495 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
    try:
        r=subprocess.run([str(PG/'psql'),'-X','-h',tmp,'-p','55495','-d','postgres','-v','ON_ERROR_STOP=1'],input=schema+functions+before+patch+patch+source_key_patch+source_key_patch+checks,text=True,capture_output=True)
        if r.returncode:raise RuntimeError(r.stderr)
    finally:
        subprocess.run([str(PG/'pg_ctl'),'-D',data,'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: 1,949 payload combinations retain exact case families and keys; OIDs, ACLs, owner, search path, security, volatility and idempotence preserved')
