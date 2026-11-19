import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDatabase } from './snapshot-fixtures.mjs';

// The immutable recovered migration tests these IDs inside a rollback savepoint.
// Supply missing rows only in the disposable database. Real snapshot rows and
// country boundaries remain authoritative; never fabricate a country verdict.
export function territoryVerifierMigrationSeedSql(databaseUrl) {
  assertLocalDatabase(databaseUrl);
  return `begin;
set local session_replication_role='replica';
create temp table ci_territory_fixtures(id uuid, label text, code text, lat numeric, lng numeric) on commit drop;
insert into ci_territory_fixtures values
 ('ca89cf6f-d161-4d25-b558-8831b803894c','Fort-de-France','MQ',14.6,-61.06666667),
 ('2f978911-985d-4c29-a08b-6dce8c40591b','Sosnowiec','PL',50.28333333,19.13333333),
 ('343d6987-2e90-4d58-a2df-fc9fa3ac7425','Beausoleil','FR',43.7402914,7.4209279),
 ('dbb3d43d-5da0-4f43-b5af-c9e0274133c2','Lippen','DE',51.37920,14.46390);
do $guard$ begin
 if exists(select 1 from ci_territory_fixtures f where not exists(select 1 from public.countries c where c.code=f.code)) then
  raise exception 'Territory verifier fixtures require the snapshot country references';
 end if;
end $guard$;
insert into public.cities(id,name,name_normalized,country_id,slug,latitude,longitude,seo_indexable,needs_attention,shell_status)
select f.id,'CI verifier '||f.label,lower('CI verifier '||f.label),c.id,
 'ci-territory-verifier-'||f.id::text,f.lat,f.lng,false,true,'real'
from ci_territory_fixtures f join public.countries c on c.code=f.code
on conflict(id) do nothing;
insert into public.geo_places(id,place_type,name,name_normalized,slug,city_id,country_id,parent_id,parent_type,latitude,longitude,seo_indexable)
select c.id,'city',c.name,c.name_normalized,c.slug,c.id,c.country_id,c.country_id,'country',c.latitude,c.longitude,false
from public.cities c join ci_territory_fixtures f on f.id=c.id
on conflict(id) do nothing;
update public.cities c set field_provenance=coalesce(c.field_provenance,'{}')||jsonb_build_object(
 'city_place_audit',jsonb_build_object('status','non_city','reason','CI synthetic subdivision refusal',
 'sources',jsonb_build_array('https://example.invalid/ci-territory-fixture'),
 'fingerprint',public.geo_cms_fingerprint(c.id),'human_reviewed',false))
where c.id='dbb3d43d-5da0-4f43-b5af-c9e0274133c2' and c.name='CI verifier Lippen';
commit;`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(territoryVerifierMigrationSeedSql(process.env.DB_URL) + '\n');
}
