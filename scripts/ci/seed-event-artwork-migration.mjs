import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDatabase } from './snapshot-fixtures.mjs';

// The anonymous snapshot excludes private automation rows and cron jobs. Seed
// only this migration's dependencies locally, with a harmless SQL command.
export function eventArtworkMigrationSeedSql(databaseUrl) {
  assertLocalDatabase(databaseUrl);
  return `begin;
set local session_replication_role='replica';
insert into public.admin_automations(slug,name,managed_by,enabled,trigger,action,schedule,lifecycle_state)
select slug,'CI synthetic artwork dependency','system',true,'{"type":"schedule"}'::jsonb,
 jsonb_build_object('type','sql','jobname',slug,'command','select 1'),'18 * * * *','active'
from unnest(array['event_image_backfill','queer_image_backfill_event'])slug
on conflict(slug)do nothing;
select cron.schedule('event_image_backfill','18 * * * *','select 1')
where not exists(select 1 from cron.job where jobname='event_image_backfill');
commit;`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(eventArtworkMigrationSeedSql(process.env.DB_URL) + '\n');
}
