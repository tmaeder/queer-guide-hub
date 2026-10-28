import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDatabase } from './snapshot-fixtures.mjs';

// Private automation rows are excluded from the anonymous CI snapshot. These
// dependencies satisfy the migration's native-contract checks without network
// calls, credentials, or a command capable of touching a production service.
export function cityRefreshMigrationSeedSql(databaseUrl) {
  assertLocalDatabase(databaseUrl);
  return `begin;
set local session_replication_role='replica';
insert into public.admin_automations(slug,name,managed_by,enabled,trigger,action,schedule,lifecycle_state,last_run_status,consecutive_failures)
select slug,'CI synthetic city research dependency','system',slug<>'city_alias_harvest',
 '{"type":"schedule"}'::jsonb,
 jsonb_build_object('type','sql','jobname',slug,'command',
   'select length(''/functions/v1/city-factual-backfill {"batch_limit":60}'')'),
 '10 2 * * *','active',case when slug='city_alias_harvest' then 'auto_paused' else 'success' end,
 case when slug='city_alias_harvest' then 3 else 0 end
from unnest(array['city_qid_gap_link','city_alias_harvest','city_factual_sparql'])slug
on conflict(slug)do nothing;
commit;`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(cityRefreshMigrationSeedSql(process.env.DB_URL) + '\n');
}
