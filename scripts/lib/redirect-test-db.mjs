import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
export async function createRedirectTestDb({ beforeMigration } = {}) {
  const db = new PGlite();
  try {
    await db.exec(readFileSync('supabase/tests/fixtures/redirect-platform-bootstrap.sql', 'utf8'));
    await db.exec(readFileSync('supabase/tests/fixtures/redirect-inventory-sources.sql', 'utf8'));
    const files = readdirSync('supabase/migrations');
    // These replacements have existing dependencies on main. Exercise their
    // actual deployment order when concurrent merges require version allocation.
    const workspaceResourceScopes = [
      'redirect_workspace_link_scope.sql',
      'redirect_workspace_qr_report_scope.sql',
      'redirect_workspace_customer_analytics_scope.sql',
      'redirect_workspace_domain_scope.sql',
      'redirect_workspace_webhook_scope.sql',
      'redirect_workspace_native_asset_scope.sql',
      'redirect_workspace_legacy_writer_scope.sql',
      'redirect_workspace_resource_names.sql',
      'redirect_workspace_member_uniqueness.sql',
      'redirect_workspace_customer_keys.sql',
      'redirect_workspace_qr_defaults.sql',
      'redirect_workspace_owner_authority.sql',
      'redirect_workspace_public_principal_scope.sql',
      'redirect_workspace_public_report_scope.sql',
      'redirect_native_builtin_host_owner.sql',
      'redirect_workspace_public_link_identity.sql',
      'redirect_billing_role.sql',
      'redirect_workspace_information.sql',
      'redirect_workspace_public_capabilities.sql',
      'redirect_global_retention.sql',
      'redirect_mail_job_workspaces.sql',
      'redirect_provider_job_workspaces.sql',
      'redirect_webhook_job_workspaces.sql',
    ].sort((a, b) =>
      (files.find((name) => name.endsWith(a)) ?? a).localeCompare(
        files.find((name) => name.endsWith(b)) ?? b,
      ),
    );
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
      'redirect_native_install_settings.sql',
      'redirect_native_handoff_cleanup_schedule.sql',
      'redirect_invitation_inbox.sql',
      'redirect_qr_install_targets.sql',
      'redirect_domain_archiving.sql',
      'redirect_team_reports.sql',
      'redirect_domain_connect_operations.sql',
      'redirect_domain_instruction_mail.sql',
      'redirect_domain_instruction_mail_latest.sql',
      'redirect_workspace_identity.sql',
      'redirect_workspace_membership_scope.sql',
      ...workspaceResourceScopes,
    ]) {
      const name = files.find((file) => file.endsWith(suffix));
      if (!name) throw new Error('Missing migration ' + suffix);
      if (beforeMigration) await beforeMigration(db, suffix);
      await db.exec(readFileSync('supabase/migrations/' + name, 'utf8'));
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
