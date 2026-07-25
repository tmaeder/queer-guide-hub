-- Unified Guides: table grants. The schema migration relied on default
-- privileges that don't exist for tables created by the migration role in
-- this project — anon had NO SELECT on guides (42501 on the public hub).
-- Convention per marketplace_guides/quests: SELECT for anon+authenticated,
-- writes for authenticated (RLS gates them to admins/owners), ALL for
-- service_role.

GRANT SELECT ON public.guides, public.guide_picks, public.guide_sections,
               public.guide_slug_redirects, public.guide_participations,
               public.guide_contributions
  TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.guides, public.guide_picks,
               public.guide_sections, public.guide_contributions
  TO authenticated;  -- RLS: admin-only

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guide_reads,
               public.guide_participations
  TO authenticated;  -- RLS: owner-only

GRANT ALL ON public.guides, public.guide_picks, public.guide_sections,
             public.guide_reads, public.guide_participations,
             public.guide_contributions, public.guide_slug_redirects
  TO service_role;
