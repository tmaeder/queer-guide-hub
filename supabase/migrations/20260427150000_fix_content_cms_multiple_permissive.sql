-- Fix multiple_permissive_policies advisor warnings on
-- public.content_metadata and public.content_threads.
-- The FOR ALL `_write` policies overlapped the FOR SELECT `_read`
-- policies, producing two permissive SELECT policies per role.
-- Split each `_write` policy into INSERT/UPDATE/DELETE so SELECT is
-- covered exclusively by the existing `_read` policy.
-- Also wraps auth.uid() in (SELECT …) per auth_rls_initplan guidance.

-- content_metadata
DROP POLICY IF EXISTS content_metadata_write ON public.content_metadata;

CREATE POLICY content_metadata_insert ON public.content_metadata FOR INSERT
  WITH CHECK (public.cms_can_edit(content_type, content_id));

CREATE POLICY content_metadata_update ON public.content_metadata FOR UPDATE
  USING (public.cms_can_edit(content_type, content_id))
  WITH CHECK (public.cms_can_edit(content_type, content_id));

CREATE POLICY content_metadata_delete ON public.content_metadata FOR DELETE
  USING (public.cms_can_edit(content_type, content_id));

-- content_threads
DROP POLICY IF EXISTS content_threads_write ON public.content_threads;

CREATE POLICY content_threads_insert ON public.content_threads FOR INSERT
  WITH CHECK (
    public.cms_can_edit(content_type, content_id)
    OR created_by = (SELECT auth.uid())
  );

CREATE POLICY content_threads_update ON public.content_threads FOR UPDATE
  USING (
    public.cms_can_edit(content_type, content_id)
    OR created_by = (SELECT auth.uid())
  )
  WITH CHECK (
    public.cms_can_edit(content_type, content_id)
    OR created_by = (SELECT auth.uid())
  );

CREATE POLICY content_threads_delete ON public.content_threads FOR DELETE
  USING (
    public.cms_can_edit(content_type, content_id)
    OR created_by = (SELECT auth.uid())
  );
