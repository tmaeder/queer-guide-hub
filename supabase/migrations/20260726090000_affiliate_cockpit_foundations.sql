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
-- 3. marketplace_merchants.awin_advertiser_id (join key for Awin conversion
--    reports; will eventually replace the worker's AWIN_MERCHANT_MIDS env
--    JSON). Writes stay RPC-only (admin_upsert_marketplace_merchant from
--    20260725160000) — extended here to carry the new column + api_key_env.

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

-- ── 3. marketplace_merchants: Awin linkage (writes stay RPC-only) ──
ALTER TABLE public.marketplace_merchants ADD COLUMN IF NOT EXISTS awin_advertiser_id text;

COMMENT ON COLUMN public.marketplace_merchants.awin_advertiser_id IS
  'Awin advertiserId (MID). Join key for Awin conversion reports; also feeds the worker''s cread-wrap fallback.';

-- Extend the vendor-hub upsert RPC (20260725160000) with awin_advertiser_id +
-- api_key_env. Same contract otherwise; the table policies stay untouched
-- (SELECT-only for admins — this RPC is the single write path).
CREATE OR REPLACE FUNCTION public.admin_upsert_marketplace_merchant(p jsonb)
RETURNS public.marketplace_merchants
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid := nullif(p->>'id','')::uuid;
  v_provider text := p->>'provider';
  v_slug text := p->>'slug';
  m public.marketplace_merchants%ROWTYPE;
BEGIN
  IF NOT has_any_role_jwt(ARRAY['admin'::app_role]) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;

  IF v_id IS NULL THEN
    -- create: provider + slug are the identity, required and validated
    IF v_provider IS NULL OR v_provider NOT IN ('shopify-public','woocommerce-public','etsy','crawl') THEN
      RAISE EXCEPTION 'invalid provider % (allowed: shopify-public, woocommerce-public, etsy, crawl)', coalesce(v_provider,'<null>')
        USING ERRCODE='22023'; END IF;
    IF v_slug IS NULL OR v_slug !~ '^[a-z0-9-]+$' THEN
      RAISE EXCEPTION 'invalid slug % (lowercase letters, digits, dashes only)', coalesce(v_slug,'<null>')
        USING ERRCODE='22023'; END IF;
    IF coalesce(p->>'display_name','') = '' THEN
      RAISE EXCEPTION 'display_name is required' USING ERRCODE='22023'; END IF;

    INSERT INTO public.marketplace_merchants
      (provider, slug, display_name, shop_domain, config, is_enabled,
       affiliate_partner_id, organization_id, awin_advertiser_id, api_key_env)
    VALUES (
      v_provider, v_slug, p->>'display_name', nullif(p->>'shop_domain',''),
      coalesce(p->'config','{}'::jsonb),
      coalesce((p->>'is_enabled')::boolean, true),
      nullif(p->>'affiliate_partner_id','')::uuid,
      nullif(p->>'organization_id','')::uuid,
      nullif(p->>'awin_advertiser_id',''),
      nullif(p->>'api_key_env',''))
    ON CONFLICT (provider, slug) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      shop_domain = EXCLUDED.shop_domain,
      config = public.marketplace_merchants.config || EXCLUDED.config,
      is_enabled = EXCLUDED.is_enabled,
      affiliate_partner_id = EXCLUDED.affiliate_partner_id,
      organization_id = EXCLUDED.organization_id,
      awin_advertiser_id = EXCLUDED.awin_advertiser_id,
      api_key_env = EXCLUDED.api_key_env,
      updated_at = now()
    RETURNING * INTO m;
  ELSE
    -- update: provider/slug are immutable (unique sync-registry key)
    UPDATE public.marketplace_merchants SET
      display_name = coalesce(nullif(p->>'display_name',''), display_name),
      shop_domain = CASE WHEN p ? 'shop_domain' THEN nullif(p->>'shop_domain','') ELSE shop_domain END,
      config = CASE WHEN p ? 'config' THEN config || (p->'config') ELSE config END,
      is_enabled = coalesce((p->>'is_enabled')::boolean, is_enabled),
      affiliate_partner_id = CASE WHEN p ? 'affiliate_partner_id'
        THEN nullif(p->>'affiliate_partner_id','')::uuid ELSE affiliate_partner_id END,
      organization_id = CASE WHEN p ? 'organization_id'
        THEN nullif(p->>'organization_id','')::uuid ELSE organization_id END,
      awin_advertiser_id = CASE WHEN p ? 'awin_advertiser_id'
        THEN nullif(p->>'awin_advertiser_id','') ELSE awin_advertiser_id END,
      api_key_env = CASE WHEN p ? 'api_key_env'
        THEN nullif(p->>'api_key_env','') ELSE api_key_env END,
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO m;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'merchant not found' USING ERRCODE='22023'; END IF;
  END IF;

  -- mirror link_org_merchant_domain_matches: linked orgs gain the seller role
  IF m.organization_id IS NOT NULL THEN
    UPDATE public.organizations o
       SET roles = (SELECT array(SELECT DISTINCT unnest(o.roles || array['seller'])))
     WHERE o.id = m.organization_id AND NOT ('seller' = ANY(o.roles));
  END IF;

  RETURN m;
END; $$;
