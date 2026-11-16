-- The combined admin source registry needs all registrations, including disabled
-- news feeds. ingestion_sources previously had only a USING(false) placeholder.
-- Keep public feed reads and all existing scraper policies unchanged.
-- Reuse the established private role helper; no privileged browser RPC is added.

CREATE POLICY ingestion_sources_admin_select
ON public.ingestion_sources FOR SELECT TO authenticated
USING ((SELECT api_private.has_role_jwt('admin'::public.app_role)));

CREATE POLICY ingestion_sources_admin_update
ON public.ingestion_sources FOR UPDATE TO authenticated
USING ((SELECT api_private.has_role_jwt('admin'::public.app_role)))
WITH CHECK ((SELECT api_private.has_role_jwt('admin'::public.app_role)));

CREATE POLICY news_sources_admin_select
ON public.news_sources FOR SELECT TO authenticated
USING ((SELECT api_private.has_role_jwt('admin'::public.app_role)));
