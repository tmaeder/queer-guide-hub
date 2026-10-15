import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRedirectTestDb } from './lib/redirect-test-db.mjs';

// Isolated PostgreSQL only; never the production project.
const db = await createRedirectTestDb();
try {
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
  await db.exec(readFileSync('supabase/tests/redirect_public_report_dates.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_report_indexing.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_domain_registry.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_domain_provisioning.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_domain_routing.sql', 'utf8'));
  await db.exec(readFileSync('supabase/tests/redirect_domain_choices.sql', 'utf8'));
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
  console.log(
    'Redirect platform SQL: policies, atomic creation, quotas, expiry, variant metrics, conversion attribution, analytics, password throttling scoped link management, workspace APIs and presentations passed.',
  );
} finally {
  await db.close();
}
