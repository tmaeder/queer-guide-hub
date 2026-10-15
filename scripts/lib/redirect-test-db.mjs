import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
export async function createRedirectTestDb() {
  const db = new PGlite();
  try {
    await db.exec(readFileSync('supabase/tests/fixtures/redirect-platform-bootstrap.sql', 'utf8'));
    await db.exec(readFileSync('supabase/tests/fixtures/redirect-inventory-sources.sql', 'utf8'));
    const files = readdirSync('supabase/migrations');
    for (const suffix of [
      'redirect_link_workspace.sql',
      'redirect_link_policies.sql',
      'redirect_conversion_attribution.sql',
      'redirect_analytics_reports.sql',
      'redirect_password_throttle.sql',
      'redirect_link_management_api.sql',
      'redirect_workspace_api.sql',
      'redirect_presentations.sql',
      'redirect_preview_generation.sql',
      'redirect_archive_bulk.sql',
      'redirect_policy_api.sql',
      'redirect_folder_access.sql',
      'redirect_member_workspace.sql',
      'redirect_access_requests.sql',
      'redirect_saved_reports.sql',
      'redirect_public_report_dates.sql',
      'redirect_report_indexing.sql',
      'redirect_domain_registry.sql',
      'redirect_domain_provisioning.sql',
      'redirect_domain_routing.sql',
      'redirect_domain_choices.sql',
      'redirect_manual_records.sql',
      'redirect_linked_domains.sql',
      'redirect_domain_validation_restart.sql',
      'redirect_domain_root_links.sql',
      'redirect_qr_styles.sql',
      'redirect_qr_logo_assets.sql',
      'redirect_qr_image_links.sql',
      'redirect_qr_image_artwork.sql',
      'redirect_customer_profiles.sql',
      'redirect_webhooks.sql',
      'redirect_password_branding.sql',
      'redirect_current_owner_keys.sql',
      'redirect_member_administration.sql',
      'redirect_session_scope_context.sql',
      'redirect_current_owner_rls.sql',
      'redirect_token_administration.sql',
      'redirect_all_source_inventory.sql',
      'redirect_workspace_invitations.sql',
      'redirect_native_apps.sql',
      'redirect_native_app_clips.sql',
      'redirect_resolution_snapshots.sql',
      'redirect_native_handoff_receipts.sql',
      'redirect_invitation_inbox.sql',
    ]) {
      const name = files.find((file) => file.endsWith(suffix));
      if (!name) throw new Error('Missing migration ' + suffix);
      await db.exec(readFileSync('supabase/migrations/' + name, 'utf8'));
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
