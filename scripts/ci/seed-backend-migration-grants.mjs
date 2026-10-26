// Supabase's schema-only snapshot omits ACLs. Local default privileges can
// therefore invent browser access to backend tables. Restore the *denial*
// required by the pending security migration; do not grant service privileges.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { assertLocalDatabase } from './snapshot-fixtures.mjs'

export function backendMigrationGrantFixture(databaseUrl, migration) {
 assertLocalDatabase(databaseUrl)
 const match=migration.match(/FOREACH t IN ARRAY ARRAY\[([^\]]+)\]/)
 const tables=match?.[1].match(/'([a-z_]+)'/g)?.map(s=>s.slice(1,-1))
 if(!tables?.length||tables.some(t=>!/^email_[a-z_]+$/.test(t)))throw Error('Expected backend migration table contract')
 return `begin;
set local lock_timeout='2s';
do $fixture$
declare t text;
begin
 foreach t in array array[${tables.map(t=>`'${t}'`).join(',')}] loop
  if to_regclass(format('public.%I',t))is null or not has_table_privilege('service_role',to_regclass(format('public.%I',t)),'SELECT')
  then raise exception 'Snapshot is missing existing service SELECT on %',t;end if;
  execute format('revoke all privileges on table public.%I from public,anon,authenticated',t);
 end loop;
end $fixture$;
commit;
`
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file=process.argv[2]
 if(!file)throw Error('Pass the pending backend security migration')
 process.stdout.write(backendMigrationGrantFixture(process.env.DB_URL??'',readFileSync(file,'utf8')))
}
