#!/usr/bin/env python3
"""Execute the immutable recorded migration with anonymous-snapshot ACL fixtures."""
import os
from pathlib import Path
import re
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
seed_module='./scripts/ci/seed-backend-policy-migration.mjs'
js=f"import{{backendPolicyMigrationSeedSql}}from'{seed_module}';process.stdout.write(backendPolicyMigrationSeedSql(process.argv[1]));"
for url in ['postgresql://postgres@db.example.org/postgres','postgresql://postgres@xqeacpakadqfxjxjcewc.supabase.co/postgres']:
 result=subprocess.run(['node','--input-type=module','-e',js,url],cwd=ROOT,capture_output=True,text=True)
 assert result.returncode!=0 and not result.stdout,'Remote fixture was allowed'
seed=subprocess.check_output(['node','--input-type=module','-e',js,'postgresql://postgres@127.0.0.1:55513/postgres'],cwd=ROOT,text=True)
migration=(ROOT/'supabase/migrations/20261025175909_complete_security_advisor_backend_contracts.sql').read_text()
tables=re.search(r'FOREACH t IN ARRAY ARRAY\[(.*?)\] LOOP',migration,re.S)[1]
names=re.findall(r"'([a-z_]+)'",tables)
schema="create role anon;create role authenticated;create role service_role;create function public.tag_facet_of(text)returns text language sql as $$select case $1 when 'venues'then 'venue'when 'personalities'then 'person'when 'news_article'then 'news'end$$;"
for table in names:schema+=f'create table {table}(id int primary key);alter table {table}enable row level security;grant all on {table}to anon,authenticated;'
checks='''do $$declare t text;begin
 foreach t in array array['''+tables+''']loop
  assert not has_table_privilege('anon',t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE');
  assert not has_table_privilege('authenticated',t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE');
  assert has_table_privilege('service_role',t,'SELECT');
  assert not has_table_privilege('service_role',t,'INSERT,UPDATE,DELETE,TRUNCATE');
  assert exists(select 1 from pg_policy where polrelid=t::regclass and polname='service_role_backend_access');
 end loop;
end$$;'''
with tempfile.TemporaryDirectory(prefix='qg-backend-fixture-')as tmp:
 data=Path(tmp)/'data'
 subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale','--wal-segsize=1'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55513 -c listen_addresses= -c min_wal_size=2MB -c max_wal_size=16MB','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:
  base=[str(PG/'psql'),'-h',tmp,'-p','55513','-d','postgres','-v','ON_ERROR_STOP=1']
  subprocess.run(base,input=schema,text=True,check=True,stdout=subprocess.DEVNULL)
  failed=subprocess.run(base+['-1'],input=migration,text=True,capture_output=True)
  assert failed.returncode!=0 and 'Unexpected backend table grants' in failed.stderr,'Guard no longer fails closed'
  subprocess.run(base,input=seed,text=True,check=True,stdout=subprocess.DEVNULL)
  subprocess.run(base+['-1'],input=migration+checks,text=True,check=True,stdout=subprocess.DEVNULL)
 finally:subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: remote URLs rejected; missing ACLs fail closed; exact immutable migration preserves backend/client permission boundaries on all 17 tables')
