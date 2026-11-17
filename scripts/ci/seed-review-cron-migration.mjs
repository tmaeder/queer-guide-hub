import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDatabase } from './snapshot-fixtures.mjs';

// Private automation state is omitted from the anonymous snapshot. Keep this
// dependency paused: applying the real migration must not schedule local work.
export function reviewCronMigrationSeedSql(databaseUrl) {
  assertLocalDatabase(databaseUrl);
  return `begin;
set local session_replication_role='replica';
insert into public.admin_automations(slug,name,managed_by,enabled,trigger,action,schedule,lifecycle_state)
values('review_automatic_resolution','CI synthetic Review dependency','system',false,
 '{"type":"schedule"}',
 '{"type":"rpc","fn":"run_review_automatic_resolution","args":{"p_batch":200,"p_dry_run":false}}',
 '0-59/5 * * * *','paused')
on conflict(slug)do nothing;
commit;`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(reviewCronMigrationSeedSql(process.env.DB_URL) + '\n');
}
