-- Add missing RLS policies for cms_pages_translations and venue_redirects.
-- Both tables had RLS enabled with no policies, effectively blocking all access.
-- Surfaced by Supabase linter: 0008_rls_enabled_no_policy.

-- ── cms_pages_translations ──────────────────────────────────────────────────
-- Mirror cms_pages: anon/authenticated read translations of published+public
-- pages; editor/moderator/admin can read all and write.

CREATE POLICY "Public read published page translations"
  ON public.cms_pages_translations
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cms_pages p
      WHERE p.id = cms_pages_translations.page_id
        AND p.workflow_state = 'published'::cms_workflow_state
        AND p.visibility_level = 'public'::cms_visibility_level
    )
  );

CREATE POLICY "Editors read all page translations"
  ON public.cms_pages_translations
  FOR SELECT
  TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role]));

CREATE POLICY "Editors insert page translations"
  ON public.cms_pages_translations
  FOR INSERT
  TO authenticated
  WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role]));

CREATE POLICY "Editors update page translations"
  ON public.cms_pages_translations
  FOR UPDATE
  TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role]))
  WITH CHECK (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role]));

CREATE POLICY "Editors delete page translations"
  ON public.cms_pages_translations
  FOR DELETE
  TO authenticated
  USING (has_any_role_jwt(ARRAY['admin'::app_role, 'moderator'::app_role, 'editor'::app_role]));

-- ── venue_redirects ─────────────────────────────────────────────────────────
-- Public read so old venue slugs can be resolved by anon visitors;
-- admin-only writes (redirects created by dedup migrations / tooling).

CREATE POLICY "Public read venue redirects"
  ON public.venue_redirects
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins insert venue redirects"
  ON public.venue_redirects
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role_jwt('admin'::app_role));

CREATE POLICY "Admins update venue redirects"
  ON public.venue_redirects
  FOR UPDATE
  TO authenticated
  USING (has_role_jwt('admin'::app_role))
  WITH CHECK (has_role_jwt('admin'::app_role));

CREATE POLICY "Admins delete venue redirects"
  ON public.venue_redirects
  FOR DELETE
  TO authenticated
  USING (has_role_jwt('admin'::app_role));
