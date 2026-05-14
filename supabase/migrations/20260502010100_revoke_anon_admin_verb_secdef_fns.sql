-- Defense in depth. The 13 admin-verb SECURITY DEFINER functions all
-- have `IF NOT has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role])
-- THEN RAISE EXCEPTION 'forbidden'` at the top of their body, so anon
-- callers already get an exception. But the EXECUTE grant means they
-- show up in the security advisor and one missed role check would
-- expose them. Revoke anon EXECUTE so the grant matches the intent.
--
-- Already applied to prod via Supabase MCP on 2026-05-02.
-- Ref: docs/security-definer-function-audit.md

REVOKE EXECUTE ON FUNCTION public.approve_story_for_claude(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.archive_story(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_admin_data_access(uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_routine_run(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dispatch_claude_routine(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_story_needs_followup(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_fix_proposed(uuid, text, text, text[], text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_retest_result(uuid, text, jsonb, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_routine_progress(uuid, text, jsonb, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_retest(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unarchive_story(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_story(uuid, text, text) FROM anon;
