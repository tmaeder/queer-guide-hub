-- Affiliate Cockpit v2 — P0 foundations.
--
-- 1. Per-click attribution code on affiliate_clicks: the /go worker starts
--    sending sub_id/clickref/label as "<surface>.<code>" so network
--    conversions (Awin/Travelpayouts) can be matched back to a click row.
--    Until now sub_id carried only the surface — click-level matching was
--    structurally impossible.
-- 2. affiliate_partners becomes worker-consumable: go_key (the /go?p= key,
--    == affiliate_clicks.partner) + sub_field. The worker loads enabled
--    rows with a non-null go_key and fails open to its baked-in map.
-- 3. marketplace_merchants: admin write path (the Merchants tab edits the
--    registry directly, like AffiliatePartnersManager does for partners)
--    + awin_advertiser_id (join key for Awin conversion reports; will
--    eventually replace the worker's AWIN_MERCHANT_MIDS env JSON).

-- ── 1. affiliate_clicks.click_code ─────────────────────────────────
ALTER TABLE public.affiliate_clicks ADD COLUMN IF NOT EXISTS click_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_clicks_click_code
  ON public.affiliate_clicks (click_code) WHERE click_code IS NOT NULL;

COMMENT ON COLUMN public.affiliate_clicks.click_code IS
  '8-char base36 code the /go worker embeds in the outbound sub_id/clickref/label; conversions match back on it.';

-- ── 2. affiliate_partners: worker-consumable registry ──────────────
ALTER TABLE public.affiliate_partners ADD COLUMN IF NOT EXISTS go_key text;
ALTER TABLE public.affiliate_partners ADD COLUMN IF NOT EXISTS sub_field text NOT NULL DEFAULT 'sub_id';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_partners_sub_field_check'
  ) THEN
    ALTER TABLE public.affiliate_partners
      ADD CONSTRAINT affiliate_partners_sub_field_check
      CHECK (sub_field IN ('sub_id', 'booking_label', 'gyg_placement'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_partners_go_key_key
  ON public.affiliate_partners (go_key) WHERE go_key IS NOT NULL;

COMMENT ON COLUMN public.affiliate_partners.go_key IS
  'Stable key used in /go?p= and affiliate_clicks.partner. Rows with go_key + enabled are served live to the search-proxy worker.';

-- Backfill the 11 partners the worker has always known. domains[] doubles as
-- the redirect allowlist, so it must contain the registrable host.
INSERT INTO public.affiliate_partners (partner_name, domains, parameters, enabled, vertical, go_key, sub_field)
VALUES
  ('Aviasales',     ARRAY['aviasales.com'],     '{}'::jsonb, true, 'flight',    'aviasales',    'sub_id'),
  ('Booking.com',   ARRAY['booking.com'],       '{}'::jsonb, true, 'hotel',     'booking',      'booking_label'),
  ('Hotellook',     ARRAY['hotellook.com'],     '{}'::jsonb, true, 'hotel',     'hotellook',    'sub_id'),
  ('Hotels.com',    ARRAY['hotels.com'],        '{}'::jsonb, true, 'hotel',     'hotelscom',    'sub_id'),
  ('GetYourGuide',  ARRAY['getyourguide.com'],  '{}'::jsonb, true, 'activity',  'getyourguide', 'gyg_placement'),
  ('DiscoverCars',  ARRAY['discovercars.com'],  '{}'::jsonb, true, 'car',       'discovercars', 'sub_id'),
  ('Kiwitaxi',      ARRAY['kiwitaxi.com'],      '{}'::jsonb, true, 'transfer',  'kiwitaxi',     'sub_id'),
  ('Airalo',        ARRAY['airalo.com'],        '{}'::jsonb, true, 'esim',      'airalo',       'sub_id'),
  ('Heymondo',      ARRAY['heymondo.com'],      '{}'::jsonb, true, 'insurance', 'heymondo',     'sub_id'),
  ('Compensair',    ARRAY['compensair.com'],    '{}'::jsonb, true, 'other',     'compensair',   'sub_id'),
  ('Travelpayouts', ARRAY['tp.media'],          '{}'::jsonb, true, 'other',     'tpmedia',      'sub_id')
ON CONFLICT (partner_name) DO UPDATE SET
  go_key    = EXCLUDED.go_key,
  sub_field = EXCLUDED.sub_field,
  vertical  = EXCLUDED.vertical, -- worker vertical wins: it is what affiliate_clicks rows carry
  -- union, so hand-added extra domains survive
  domains   = (SELECT array_agg(DISTINCT d) FROM unnest(affiliate_partners.domains || EXCLUDED.domains) AS d),
  updated_at = now();

-- ── 3. marketplace_merchants: admin writes + Awin linkage ──────────
ALTER TABLE public.marketplace_merchants ADD COLUMN IF NOT EXISTS awin_advertiser_id text;

COMMENT ON COLUMN public.marketplace_merchants.awin_advertiser_id IS
  'Awin advertiserId (MID). Join key for Awin conversion reports; also feeds the worker''s cread-wrap fallback.';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='marketplace_merchants' AND policyname='marketplace_merchants_admin_write') THEN
    CREATE POLICY marketplace_merchants_admin_write ON public.marketplace_merchants
      FOR ALL
      USING (public.has_role_jwt('admin'))
      WITH CHECK (public.has_role_jwt('admin'));
  END IF;
END $$;
