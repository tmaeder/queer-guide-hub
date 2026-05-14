-- Consolidation sprint Q2-2026, Batch 2b: wrap auth.uid() in (select ...) for RLS perf.
-- Closes advisor item: WARN auth_rls_initplan (×2)
-- Ref: docs/consolidation-2026-Q2-addendum-db-advisors.md
-- Already applied to prod via Supabase MCP on 2026-05-01.

-- watched_urls: ALL policy "users manage own watched_urls"
DROP POLICY IF EXISTS "users manage own watched_urls" ON public.watched_urls;
CREATE POLICY "users manage own watched_urls"
  ON public.watched_urls
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- cms_audit_log: INSERT policy "Staff can insert audit logs"
DROP POLICY IF EXISTS "Staff can insert audit logs" ON public.cms_audit_log;
CREATE POLICY "Staff can insert audit logs"
  ON public.cms_audit_log
  FOR INSERT
  WITH CHECK (
    (actor_id = (SELECT auth.uid()))
    AND (
      has_role_jwt('admin'::app_role)
      OR has_role_jwt('moderator'::app_role)
      OR has_role_jwt('editor'::app_role)
    )
  );
