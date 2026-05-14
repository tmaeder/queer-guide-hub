-- Retry creating events_public view outside DO block to avoid plpgsql $$ quoting issues
DROP VIEW IF EXISTS public.events_public;
CREATE VIEW public.events_public AS
SELECT 
  id, title, description, start_date, end_date,
  venue_id, venue_name, address, city, state, country,
  latitude, longitude,
  price_min, price_max, is_free,
  images, age_restriction, ticket_url, website,
  created_at, updated_at
FROM public.events
WHERE is_public = true AND status = 'active';

-- Ensure invoker semantics and grants
ALTER VIEW public.events_public SET (security_invoker = on);
GRANT SELECT ON public.events_public TO anon, authenticated;