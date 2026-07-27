-- Same class of bug fixed for venue_slug_redirects in 20260727162405: these
-- tables were created without a table-level GRANT for anon, so PostgREST
-- returns 401 before RLS is ever evaluated — old slugs never resolve for
-- logged-out visitors or crawlers using the client-side useSlugRedirect hook.
-- No sensitive data (just old_slug -> canonical id mappings); safe to open.
GRANT SELECT ON public.event_slug_redirects TO anon, authenticated;
GRANT SELECT ON public.personality_slug_redirects TO anon, authenticated;
GRANT SELECT ON public.marketplace_slug_redirects TO anon, authenticated;
GRANT SELECT ON public.country_slug_redirects TO anon, authenticated;
GRANT SELECT ON public.hotel_slug_redirects TO anon, authenticated;
GRANT SELECT ON public.milestone_slug_redirects TO anon, authenticated;
GRANT SELECT ON public.news_slug_redirects TO anon, authenticated;
GRANT SELECT ON public.org_slug_redirects TO anon, authenticated;
GRANT SELECT ON public.village_slug_redirects TO anon, authenticated;
