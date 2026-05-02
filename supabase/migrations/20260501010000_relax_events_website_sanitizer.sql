-- Loosen the events.website sanitizer.
--
-- The shared sanitize_website_field() trigger was nulling out events.website
-- for Eventbrite, Tripadvisor, Wikipedia, etc. For *events* those are
-- perfectly legitimate canonical URLs (Eventbrite is *the* most common
-- official event page). The result was admins editing an event in
-- /admin/content, hitting save, and silently losing the Website field with
-- no error — which is exactly what was reported in feedback
-- f4fcdc2d-7554-4045-8377-05bf186f2d8e.
--
-- Replace the trigger on the events table so only the scraper-source
-- domains (spartacus, gaytravel4u) are stripped; everything else passes
-- through. Other tables (venues, personalities) keep the original
-- aggressive blocklist via sanitize_website_field().

CREATE OR REPLACE FUNCTION public.sanitize_event_website_field()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  blocked_domains TEXT[] := ARRAY[
    'gaytravel4u.com',
    'gaytravel4u.de',
    'spartacus.gayguide.travel'
  ];
  domain TEXT;
BEGIN
  IF NEW.website IS NOT NULL AND NEW.website <> '' THEN
    FOREACH domain IN ARRAY blocked_domains LOOP
      IF NEW.website ILIKE '%' || domain || '%' THEN
        RAISE NOTICE 'Blocked scraper source URL in events.website: %', NEW.website;
        NEW.website := NULL;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sanitize_website_before_upsert ON public.events;
CREATE TRIGGER sanitize_website_before_upsert
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.sanitize_event_website_field();
