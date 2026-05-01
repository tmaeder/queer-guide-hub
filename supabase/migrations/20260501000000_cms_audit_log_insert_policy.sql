-- Allow admins, moderators, and editors to write audit log entries
-- attributed to themselves. Without this policy, RLS denies every
-- client INSERT (403) -- breaking writeAuditLog() in useCMSEditor and
-- the audit-log writes from useCMSWorkflow / useCMSAudit.
DROP POLICY IF EXISTS "Staff can insert audit logs" ON public.cms_audit_log;
CREATE POLICY "Staff can insert audit logs" ON public.cms_audit_log
  FOR INSERT
  WITH CHECK (
    actor_id = auth.uid()
    AND (
      has_role_jwt('admin'::app_role)
      OR has_role_jwt('moderator'::app_role)
      OR has_role_jwt('editor'::app_role)
    )
  );
