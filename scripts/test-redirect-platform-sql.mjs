import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRedirectTestDb } from './lib/redirect-test-db.mjs';

// Isolated PostgreSQL only; never the production project.
const db = await createRedirectTestDb();
try {
  await db.exec(readFileSync('supabase/tests/redirect_workspace_owner_authority.sql', 'utf8'));
  await db.exec(
    readFileSync('supabase/tests/redirect_workspace_public_principal_scope.sql', 'utf8'),
  );
  await db.exec(readFileSync('supabase/tests/redirect_workspace_public_report_scope.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_native_builtin_host_owner.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_public_link_identity.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_billing_role.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_information.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_identity.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_relationships.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_membership_scope.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_direct_rls.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_link_scope.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_qr_report_scope.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_qr_defaults.sql', 'utf8'));
  await db.exec(
    readFileSync('supabase/tests/redirect_workspace_customer_analytics_scope.sql', 'utf8'),
  );
  await db.exec(readFileSync('supabase/tests/redirect_workspace_customer_keys.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_domain_scope.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_webhook_scope.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_native_asset_scope.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_legacy_writer_scope.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_resource_names.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_link_workspace.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_link_policies.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_conversion_attribution.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_analytics_reports.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_password_throttle.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_link_management_api.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_api.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_presentations.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_preview_generation.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_archive_bulk.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_policy_api.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_folder_access.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_access_requests.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_saved_reports.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_team_reports.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_public_report_dates.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_report_indexing.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_domain_registry.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_domain_provisioning.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_domain_routing.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_domain_choices.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_domain_archiving.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_domain_connect_operations.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_domain_instruction_mail.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_manual_records.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_linked_domains.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_domain_validation_restart.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_domain_root_links.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_qr_styles.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_qr_logo_assets.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_qr_image_links.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_qr_image_artwork.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_qr_install_targets.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_customer_profiles.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_webhooks.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_password_branding.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_current_owner_keys.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_member_administration.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_session_scope_context.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_current_owner_rls.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_token_administration.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_all_source_inventory.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_workspace_invitations.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_native_apps.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_resolution_snapshots.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_native_handoff_receipts.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_native_install_settings.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_invitation_inbox.sql', 'utf8'));
  // Missing cron was already exercised while loading the migration. Reapply
  // against a named-job seam, then execute its actual bounded SQL command.
  await db.exec(readFileSync('supabase/tests/redirect_native_handoff_cleanup.sql', 'utf8'));
  const cleanup = readdirSync('supabase/migrations').find((name) =>
    name.endsWith('_redirect_native_handoff_cleanup_schedule.sql'),
  );
  const scheduleSql = readFileSync('supabase/migrations/' + cleanup, 'utf8');
  await db.exec(scheduleSql);
  await db.exec(scheduleSql);
  const jobs = (await db.query('SELECT * FROM cron.test_jobs')).rows;
  assert.equal(jobs.length, 1, 'Reapplication duplicated cleanup schedule');
  assert.equal(jobs[0].name, 'redirect-native-handoff-expiry');
  assert.equal(jobs[0].schedule, '* * * * *');
  const priorRole = (await db.query('SELECT current_user AS role')).rows[0].role;
  await db.exec(jobs[0].command);
  assert.equal(
    (await db.query('SELECT current_user AS role')).rows[0].role,
    priorRole,
    'Cleanup role escaped its transaction',
  );
  // No credential-bearing relay or extra execution grant is needed.
  assert.equal(
    (
      await db.query(
        "SELECT has_function_privilege('anon','public.cleanup_redirect_native_handoffs(integer)','EXECUTE') OR has_function_privilege('authenticated','public.cleanup_redirect_native_handoffs(integer)','EXECUTE') AS exposed",
      )
    ).rows[0].exposed,
    false,
  );
  const mailMigration = readdirSync('supabase/migrations').find((name) =>
    name.endsWith('_redirect_domain_instruction_mail.sql'),
  );
  const mailSchedule = readFileSync('supabase/migrations/' + mailMigration, 'utf8').match(
    /DO \$migration\$[\s\S]*?\$migration\$;/,
  )?.[0];
  assert.ok(mailSchedule, 'Instruction mail schedule missing');
  await db.exec(mailSchedule);
  await db.exec(mailSchedule);
  const mailJobs = (
    await db.query("SELECT * FROM cron.test_jobs WHERE name='redirect-domain-instruction-mail'")
  ).rows;
  assert.equal(mailJobs.length, 1, 'Instruction mail schedule duplicated');
  assert.equal(mailJobs[0].schedule, '* * * * *');
  await db.exec(`CREATE SCHEMA vault; CREATE SCHEMA net;
   CREATE TABLE vault.decrypted_secrets(name text,decrypted_secret text);
   CREATE TABLE net.test_mail_requests(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,url text,headers jsonb,body jsonb,timeout_ms integer);
   CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.test_mail_requests(url,headers,body,timeout_ms) VALUES($1,$2,$3,$4) RETURNING id $$;`);
  await db.exec(mailJobs[0].command);
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM net.test_mail_requests')).rows[0].n,
    0,
  );
  await db.exec(
    "INSERT INTO vault.decrypted_secrets VALUES('supabase_url','https://fixture.supabase.co'),('internal_invoke_secret','')",
  );
  await db.exec(mailJobs[0].command);
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM net.test_mail_requests')).rows[0].n,
    0,
  );
  await db.exec(
    "UPDATE vault.decrypted_secrets SET decrypted_secret='fixture-domain-mail' WHERE name='internal_invoke_secret'",
  );
  await db.exec(mailJobs[0].command);
  const scheduledMail = (await db.query('SELECT * FROM net.test_mail_requests')).rows;
  assert.equal(scheduledMail.length, 1);
  assert.equal(
    scheduledMail[0].url,
    'https://fixture.supabase.co/functions/v1/redirect-domain-instruction-mail',
  );
  assert.deepEqual(scheduledMail[0].headers, {
    'Content-Type': 'application/json',
    'x-internal-secret': 'fixture-domain-mail',
  });
  assert.deepEqual(scheduledMail[0].body, {});
  assert.equal(scheduledMail[0].timeout_ms, 60000);
  await db.exec(
    "UPDATE vault.decrypted_secrets SET decrypted_secret='http://other.example.org' WHERE name='supabase_url'",
  );
  await db.exec(mailJobs[0].command);
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM net.test_mail_requests')).rows[0].n,
    1,
    'Invalid scheduler URL escaped guard',
  );
  console.log(
    'Redirect platform SQL: policies, atomic creation, quotas, expiry, variant metrics, conversion attribution, analytics, password throttling scoped link management, workspace APIs and presentations passed.',
  );
} finally {
  await db.close();
}
