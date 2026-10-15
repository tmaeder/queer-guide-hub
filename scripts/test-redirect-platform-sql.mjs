import { readFileSync } from 'node:fs';
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
  await db.exec(readFileSync('supabase/tests/redirect_invitation_inbox.sql', 'utf8'));
  console.log(
    'Redirect platform SQL: policies, atomic creation, quotas, expiry, variant metrics, conversion attribution, analytics, password throttling scoped link management, workspace APIs and presentations passed.',
  );
} finally {
  await db.close();
}
