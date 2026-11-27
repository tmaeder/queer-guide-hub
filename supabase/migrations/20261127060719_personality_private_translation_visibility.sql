-- Published translations of private personalities must remain private too.
-- Staff review access and every other content type retain their existing policy.
ALTER POLICY content_translations_select ON public.content_translations
USING (
  (status = 'published' AND (
    table_name <> 'personalities' OR EXISTS (
      SELECT 1 FROM public.personalities p
      WHERE p.id = content_translations.record_id
        AND p.visibility = 'public' AND p.duplicate_of_id IS NULL
    )
  )) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = (SELECT auth.uid())
      AND user_roles.role = ANY (ARRAY['admin'::public.app_role, 'moderator'::public.app_role])
  )
);

-- Source-review metadata for an unpublished personality is private as well.
ALTER POLICY personality_sources_select_all ON public.personality_sources
USING (
  EXISTS (
    SELECT 1 FROM public.personalities p
    WHERE p.id = personality_sources.personality_id
      AND p.visibility = 'public' AND p.duplicate_of_id IS NULL
  ) OR api_private.has_any_role_jwt(ARRAY['admin'::public.app_role, 'moderator'::public.app_role])
);
