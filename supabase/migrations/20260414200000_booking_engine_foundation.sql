-- Booking Engine Foundation
-- Creates bookings table, booking_webhooks, extends affiliate_partners and trip_reservations

-- 1. Bookings table - core booking records from API providers
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_booking_id text,
  booking_type text NOT NULL CHECK (booking_type IN ('hotel', 'activity', 'flight')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'failed')),
  check_in timestamptz,
  check_out timestamptz,
  guest_name text,
  total_amount numeric,
  currency text DEFAULT 'EUR',
  commission_amount numeric,
  provider_data jsonb DEFAULT '{}',
  cancellation_policy jsonb,
  city_id uuid REFERENCES public.cities(id),
  country_id uuid REFERENCES public.countries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_user ON public.bookings(user_id, status, check_in DESC);
CREATE INDEX idx_bookings_trip ON public.bookings(trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX idx_bookings_provider ON public.bookings(provider, provider_booking_id);

-- 2. Booking webhooks - process provider status updates
CREATE TABLE public.booking_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed boolean DEFAULT false,
  booking_id uuid REFERENCES public.bookings(id),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX idx_booking_webhooks_unprocessed ON public.booking_webhooks(processed, created_at) WHERE NOT processed;

-- 3. Extend affiliate_partners for multi-vertical booking
ALTER TABLE public.affiliate_partners ADD COLUMN IF NOT EXISTS vertical text DEFAULT 'general';
ALTER TABLE public.affiliate_partners ADD COLUMN IF NOT EXISTS search_api_url text;
ALTER TABLE public.affiliate_partners ADD COLUMN IF NOT EXISTS search_api_key_env text;
ALTER TABLE public.affiliate_partners ADD COLUMN IF NOT EXISTS supports_in_app boolean DEFAULT false;
ALTER TABLE public.affiliate_partners ADD COLUMN IF NOT EXISTS provider_type text DEFAULT 'affiliate';

-- 4. Extend trip_reservations for auto-linking to bookings
ALTER TABLE public.trip_reservations ADD COLUMN IF NOT EXISTS provider_booking_id text;
ALTER TABLE public.trip_reservations ADD COLUMN IF NOT EXISTS auto_created boolean DEFAULT false;
ALTER TABLE public.trip_reservations ADD COLUMN IF NOT EXISTS cancellation_url text;
ALTER TABLE public.trip_reservations ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id);

-- 5. RLS policies for bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookings" ON public.bookings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own bookings" ON public.bookings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bookings" ON public.bookings
  FOR UPDATE USING (auth.uid() = user_id);

-- 6. RLS for booking_webhooks (service role only)
ALTER TABLE public.booking_webhooks ENABLE ROW LEVEL SECURITY;

-- 7. Auto-update updated_at on bookings
CREATE OR REPLACE FUNCTION public.update_bookings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_bookings_updated_at();

-- 8. Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
