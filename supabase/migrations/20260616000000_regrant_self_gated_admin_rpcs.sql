-- Re-grant EXECUTE to `authenticated` on self-gating SECURITY DEFINER RPCs that
-- the frontend calls directly with the admin/moderator user's own JWT.
--
-- Migrations 20260524500003/4 (Supabase linter fix 0028/0029) blanket-revoked
-- EXECUTE from `authenticated` on every flagged SECURITY DEFINER function. That
-- broke the admin console: get_admin_counts, the automation panel, triage,
-- feedback stories, duplicate finders, staging pager, tag/entity merges, etc. all
-- started returning 403 from the Data API because the React admin pages invoke
-- these RPCs directly (not via a service-role edge function).
--
-- Every function re-granted below enforces admin/moderator itself via
-- has_role_jwt / has_any_role_jwt / an explicit user_roles check and RAISEs
-- `unauthorized` (42501) otherwise — so exposing EXECUTE to `authenticated` is
-- NOT privilege escalation. The role gate lives in the function body, exactly
-- like the RLS helper functions the linter migration already kept executable as
-- a documented exception. The two non-role-gated entries (log_security_event,
-- check_rate_limit_enhanced) are designed to be callable by any authenticated
-- session and branch on the caller internally.
--
-- Scope is surgical: only functions the frontend calls AND that are currently
-- revoked. Internal-only RPCs stay locked.

DO $$
DECLARE
  r record;
  fns text[] := ARRAY[
    'accept_story_suggestion',
    'add_story_members',
    'admin_automation_dry_run',
    'admin_automation_dry_run_all',
    'admin_automation_pause_all',
    'admin_automation_run',
    'admin_automation_set_enabled',
    'admin_bulk_review_action',
    'anonymize_location_data',
    'approve_editorial_draft',
    'approve_group_join_request',
    'approve_story_for_claude',
    'approve_tag_suggestions',
    'archive_story',
    'assign_user_role',
    'audit_admin_sensitive_access',
    'batch_find_duplicates',
    'calculate_secure_venue_distance',
    'cancel_routine_run',
    'cascade_story_to_members',
    'check_financial_data_access',
    'check_rate_limit_enhanced',
    'compute_tag_similarities',
    'create_story',
    'find_exact_duplicates',
    'find_visual_duplicates',
    'get_admin_counts',
    'get_admin_platform_stats',
    'get_import_statistics',
    'get_staging_page',
    'get_unified_triage_queue',
    'increment_template_use_count',
    'log_security_event',
    'log_sensitive_data_access',
    'mark_story_needs_followup',
    'merge_duplicate_images',
    'merge_entities',
    'merge_unified_tag',
    'pgmq_metrics_all',
    'refresh_contribution_metrics_yearly',
    'reject_group_join_request',
    'remove_story_members',
    'resolve_story',
    'scan_table_duplicates',
    'set_story_narrative',
    'start_retest',
    'story_member_divergence',
    'suggest_story_from_ids',
    'triage_action',
    'unarchive_story',
    'validate_import_data',
    'verify_story'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = ANY(fns)
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    RAISE NOTICE 're-granted EXECUTE to authenticated: %', r.sig;
  END LOOP;
END $$;
