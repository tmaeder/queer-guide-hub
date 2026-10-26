#!/usr/bin/env python3
"""Restore snapshot ACL denial, then run the unchanged applied migration."""
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
migration=ROOT/'supabase/migrations/20261025175909_complete_security_advisor_backend_contracts.sql'
tables=re.findall("'([a-z_]+)'",re.search(r'FOREACH t IN ARRAY ARRAY\[([^\]]+)\]',migration.read_text())[1])
readonly={'email_group_invitation_sources','email_mailbox_sends','email_recipient_user_lookup'}
schema="""
create role anon;create role authenticated;create role service_role;
create function public.tag_facet_of(text)returns text language sql immutable as
 'select case $1 when ''venues'' then ''venue'' when ''personalities'' then ''person'' when ''news_article'' then ''news'' end';
"""
for table in tables:
 schema+=f'create table public.{table}(id int);alter table public.{table} enable row level security;'
 schema+=f'grant all on public.{table} to anon,authenticated;'
 schema+=f'grant {"select" if table in readonly else "all"} on public.{table} to service_role;'
fixture=subprocess.check_output(['node',str(ROOT/'scripts/ci/seed-backend-migration-grants.mjs'),str(migration)],
 env={**os.environ,'DB_URL':'postgres://postgres@127.0.0.1:55493/postgres'},text=True)
checks='do $check$begin\n'
for table in tables:
 checks+=f"if has_table_privilege('anon','public.{table}','SELECT')or has_table_privilege('authenticated','public.{table}','SELECT')or not has_table_privilege('service_role','public.{table}','SELECT')then raise exception 'Wrong backend access';end if;\n"
 if table in readonly:
  checks+=f"if has_table_privilege('service_role','public.{table}','INSERT,UPDATE,DELETE')then raise exception 'Read-only service privileges expanded';end if;\n"
checks+='end $check$;'
with tempfile.TemporaryDirectory(prefix='qg-snapshot-grants-')as tmp:
 data=Path(tmp)/'data'
 subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55493 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:
  subprocess.run([str(PG/'psql'),'-h',tmp,'-p','55493','-d','postgres','-v','ON_ERROR_STOP=1'],
   input=schema+fixture+'begin;'+migration.read_text()+'commit;'+checks,text=True,check=True,stdout=subprocess.DEVNULL)
 finally:
  subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: unchanged backend security migration; browser denial and service read-only privileges preserved')
