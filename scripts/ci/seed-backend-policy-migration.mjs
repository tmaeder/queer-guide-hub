import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDatabase } from './snapshot-fixtures.mjs';

// Anonymous snapshots intentionally omit backend ACLs. Recreate only the
// preconditions of the already-applied, guarded backend-policy migration.
export function backendPolicyMigrationSeedSql(databaseUrl) {
  assertLocalDatabase(databaseUrl);
  return `begin;
do $seed$
declare t text;
begin
 foreach t in array array['email_campaign_audience_members','email_campaign_audiences','email_campaign_reviews','email_campaign_versions','email_experiment_assignments','email_experiments','email_group_invitation_sources','email_import_batches','email_import_members','email_mailbox_sends','email_management_tokens','email_operational_notices','email_operator_events','email_recipient_user_lookup','email_retention_policy','email_template_localizations','email_verified_payments']loop
  if not exists(select 1 from pg_class where oid=to_regclass(format('public.%I',t))and relrowsecurity)
   or exists(select 1 from pg_policy where polrelid=to_regclass(format('public.%I',t)))then raise exception 'Unexpected local backend fixture state: %',t;end if;
  execute format('revoke all on table public.%I from anon,authenticated',t);
  execute format('grant select on table public.%I to service_role',t);
 end loop;
end $seed$;
commit;`;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(backendPolicyMigrationSeedSql(process.env.DB_URL) + '\n');
}
