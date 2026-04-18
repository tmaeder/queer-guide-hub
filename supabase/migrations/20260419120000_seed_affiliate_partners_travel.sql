-- ============================================================
-- Trip Planning V2: Seed travel affiliate partners
--
-- Adds Trainline, Omio, FlixBus, Hotels.com.
-- Updates existing Aviasales + Booking.com verticals to match
-- the trip-planner suggestion categories.
--
-- Verticals used by reservation suggestions:
--   - 'flight'        → flight deep-links
--   - 'rail'          → rail deep-links
--   - 'bus'           → bus deep-links
--   - 'accommodation' → hotel / apartment deep-links
-- ============================================================

-- Align existing partners to the new vertical taxonomy
UPDATE public.affiliate_partners
SET vertical = 'flight'
WHERE partner_name = 'Aviasales' AND vertical IS DISTINCT FROM 'flight';

UPDATE public.affiliate_partners
SET vertical = 'accommodation'
WHERE partner_name = 'Booking.com' AND vertical IS DISTINCT FROM 'accommodation';

-- Ensure a unique key for ON CONFLICT on partner_name
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_partners_partner_name_key
  ON public.affiliate_partners (partner_name);

-- ── New partners ───────────────────────────────────────────────
INSERT INTO public.affiliate_partners
  (partner_name, domains, url_patterns, parameters, redirect_template,
   enabled, vertical, provider_type, notes)
VALUES
  -- Rail (EU) — Trainline via Partnerize
  ('Trainline',
   ARRAY['thetrainline.com','www.thetrainline.com','trainline.com']::text[],
   ARRAY['https://www.thetrainline.com/book/results*']::text[],
   jsonb_build_object(
     'partner_param', 'clickref',
     'partner_id_env', 'TRAINLINE_PARTNER_ID',
     'base_url', 'https://www.thetrainline.com/book/results'
   ),
   NULL,
   true, 'rail', 'affiliate',
   'Rail EU. Deep-link built client-side in utils/transport/trainlineUrl.ts. Partnerize clickref attaches affiliate ID.'),

  -- Multi-modal (EU) — Omio via Partnerize
  ('Omio',
   ARRAY['omio.com','www.omio.com']::text[],
   ARRAY['https://www.omio.com/search-frontend/*']::text[],
   jsonb_build_object(
     'partner_param', 'partner_id',
     'partner_id_env', 'OMIO_PARTNER_ID',
     'base_url', 'https://www.omio.com/search-frontend/results'
   ),
   NULL,
   true, 'rail', 'affiliate',
   'Multi-modal (rail + bus + flight) EU. Vertical=rail primary, also used for bus fallback.'),

  -- Bus — FlixBus via Awin
  ('FlixBus',
   ARRAY['flixbus.com','global.flixbus.com','www.flixbus.com']::text[],
   ARRAY['https://global.flixbus.com/search*']::text[],
   jsonb_build_object(
     'partner_param', 'awc',
     'partner_id_env', 'FLIXBUS_AWIN_ID',
     'base_url', 'https://global.flixbus.com/search'
   ),
   NULL,
   true, 'bus', 'affiliate',
   'Bus global. Deep-link via utils/transport/flixbusUrl.ts. Awin tracking param awc=.'),

  -- Accommodation — Hotels.com via Travelpayouts
  ('Hotels.com',
   ARRAY['hotels.com','www.hotels.com']::text[],
   ARRAY['https://www.hotels.com/search*']::text[],
   jsonb_build_object(
     'partner_param', 'marker',
     'partner_id_env', 'TRAVELPAYOUTS_MARKER',
     'base_url', 'https://tp.media/r',
     'affiliate_network', 'travelpayouts'
   ),
   NULL,
   true, 'accommodation', 'affiliate',
   'Travelpayouts reroute through tp.media/r?marker=… → hotels.com. Secondary accommodation partner.')

ON CONFLICT (partner_name) DO UPDATE SET
  domains = EXCLUDED.domains,
  url_patterns = EXCLUDED.url_patterns,
  parameters = EXCLUDED.parameters,
  vertical = EXCLUDED.vertical,
  enabled = EXCLUDED.enabled,
  notes = EXCLUDED.notes,
  updated_at = now();

-- ── Verification notice ────────────────────────────────────────
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.affiliate_partners
  WHERE vertical IN ('flight','rail','bus','accommodation') AND enabled = true;

  RAISE NOTICE 'affiliate partners ready for trip-planner: % enabled rows across flight/rail/bus/accommodation', v_count;
END $$;
