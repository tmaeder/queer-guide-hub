-- Ensure is_public exists before creating the view
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='events' AND column_name='is_public'
  ) THEN
    EXECUTE 'ALTER TABLE public.events ADD COLUMN is_public boolean NOT NULL DEFAULT true';
  END IF;
END$$;

-- Now (re)create the view
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

ALTER VIEW public.events_public SET (security_invoker = on);
GRANT SELECT ON public.events_public TO anon, authenticated;