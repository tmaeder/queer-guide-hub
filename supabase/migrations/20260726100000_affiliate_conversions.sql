-- Affiliate Cockpit v2 — P2 revenue reconciliation.
--
-- affiliate_conversions stores realized network transactions (Awin publisher
-- API, Travelpayouts stats, Amazon CSV import) matched back to affiliate_clicks
-- via the per-click code the /go worker embeds in sub_id/clickref/label
-- (migration 20260726090000). Re-pulling a trailing window upserts on
-- (network, network_txn_id) so pending → approved → paid transitions land.

CREATE TABLE IF NOT EXISTS public.affiliate_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL CHECK (network IN ('awin', 'travelpayouts', 'amazon')),
  network_txn_id text NOT NULL,
  advertiser_ref text,                    -- Awin advertiserId / TP campaign id
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  commission_amount numeric,
  commission_currency text,
  commission_usd numeric,
  sale_amount numeric,
  sale_currency text,
  sale_usd numeric,
  click_time timestamptz,
  transaction_time timestamptz,
  sub_id text,                            -- raw clickref / sub_id / label from the network
  click_code text,                        -- parsed "<surface>.<code>" suffix
  surface text,
  partner_key text,
  vertical text,
  matched_click_id uuid REFERENCES public.affiliate_clicks(id) ON DELETE SET NULL,
  listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
  merchant_id uuid REFERENCES public.marketplace_merchants(id) ON DELETE SET NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network, network_txn_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_network_time
  ON public.affiliate_conversions (network, transaction_time DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_status
  ON public.affiliate_conversions (status);
CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_surface_time
  ON public.affiliate_conversions (surface, transaction_time DESC);
CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_merchant
  ON public.affiliate_conversions (merchant_id) WHERE merchant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_matched
  ON public.affiliate_conversions (matched_click_id) WHERE matched_click_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.affiliate_conversions_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS affiliate_conversions_touch_trg ON public.affiliate_conversions;
CREATE TRIGGER affiliate_conversions_touch_trg BEFORE UPDATE ON public.affiliate_conversions
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_conversions_touch();

-- RLS mirrors affiliate_clicks: admin reads, service-role writes.
ALTER TABLE public.affiliate_conversions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='affiliate_conversions' AND policyname='affiliate_conversions_admin_read') THEN
    CREATE POLICY affiliate_conversions_admin_read ON public.affiliate_conversions
      FOR SELECT USING (public.has_role_jwt('admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='affiliate_conversions' AND policyname='affiliate_conversions_service') THEN
    CREATE POLICY affiliate_conversions_service ON public.affiliate_conversions
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ── Revenue summary: network × surface × partner × status ──────────
CREATE OR REPLACE FUNCTION public.affiliate_revenue_summary(p_days int DEFAULT 30, p_network text DEFAULT NULL)
RETURNS TABLE (
  network text, surface text, partner_key text, status text,
  conversions bigint, commission_usd numeric, sale_usd numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.network,
         COALESCE(c.surface, 'unknown'),
         COALESCE(c.partner_key, 'unknown'),
         c.status,
         count(*)::bigint,
         COALESCE(sum(c.commission_usd), 0),
         COALESCE(sum(c.sale_usd), 0)
  FROM public.affiliate_conversions c
  WHERE public.has_role_jwt('admin')
    AND c.transaction_time >= now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 365))
    AND (p_network IS NULL OR c.network = p_network)
  GROUP BY 1, 2, 3, 4
  ORDER BY 6 DESC;
$$;

REVOKE ALL ON FUNCTION public.affiliate_revenue_summary(int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.affiliate_revenue_summary(int, text) TO authenticated;

-- ── Funnel: clicks → conversions per surface × partner ─────────────
CREATE OR REPLACE FUNCTION public.affiliate_funnel_summary(p_days int DEFAULT 30)
RETURNS TABLE (
  surface text, partner text,
  clicks bigint, conversions bigint, conv_rate numeric,
  commission_pending_usd numeric, commission_confirmed_usd numeric,
  unmatched_conversions bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH win AS (
    SELECT make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 365)) AS iv
  ),
  clicks AS (
    SELECT ac.surface, ac.partner, count(*)::bigint AS clicks
    FROM public.affiliate_clicks ac, win
    WHERE ac.kind = 'click' AND ac.clicked_at >= now() - win.iv
    GROUP BY 1, 2
  ),
  conv AS (
    SELECT COALESCE(c.surface, 'unknown') AS surface,
           COALESCE(c.partner_key, 'unknown') AS partner,
           count(*)::bigint AS conversions,
           COALESCE(sum(c.commission_usd) FILTER (WHERE c.status = 'pending'), 0) AS commission_pending_usd,
           COALESCE(sum(c.commission_usd) FILTER (WHERE c.status IN ('approved', 'paid')), 0) AS commission_confirmed_usd,
           count(*) FILTER (WHERE c.matched_click_id IS NULL AND c.click_code IS NOT NULL)::bigint AS unmatched_conversions
    FROM public.affiliate_conversions c, win
    WHERE c.transaction_time >= now() - win.iv
    GROUP BY 1, 2
  )
  SELECT COALESCE(k.surface, v.surface),
         COALESCE(k.partner, v.partner),
         COALESCE(k.clicks, 0),
         COALESCE(v.conversions, 0),
         CASE WHEN COALESCE(k.clicks, 0) > 0 THEN round(COALESCE(v.conversions, 0)::numeric / k.clicks, 4) END,
         COALESCE(v.commission_pending_usd, 0),
         COALESCE(v.commission_confirmed_usd, 0),
         COALESCE(v.unmatched_conversions, 0)
  FROM clicks k
  FULL OUTER JOIN conv v ON v.surface = k.surface AND v.partner = k.partner
  WHERE public.has_role_jwt('admin')
  ORDER BY 3 DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.affiliate_funnel_summary(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.affiliate_funnel_summary(int) TO authenticated;

-- ── Amazon manual import (no earnings API — CSV upload path) ───────
-- Rows: [{order_id, transaction_time, commission_amount, currency, status?,
--         sale_amount?, sub_id?}]  — admin-gated, idempotent on order id.
CREATE OR REPLACE FUNCTION public.admin_import_amazon_conversions(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_code text;
  v_surface text;
  v_click public.affiliate_clicks%ROWTYPE;
  v_upserted int := 0;
BEGIN
  IF NOT public.has_role_jwt('admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 2000 THEN
    RAISE EXCEPTION 'p_rows must be an array of at most 2000 rows';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    CONTINUE WHEN COALESCE(v_row->>'order_id', '') = '';

    -- Parse "<surface>.<code>" out of sub_id when present.
    v_code := NULL; v_surface := NULL; v_click := NULL;
    IF (v_row->>'sub_id') ~ '^[a-z_]+\.[0-9a-f]{8,16}$' THEN
      v_surface := split_part(v_row->>'sub_id', '.', 1);
      v_code := split_part(v_row->>'sub_id', '.', 2);
      SELECT * INTO v_click FROM public.affiliate_clicks WHERE click_code = v_code;
    END IF;

    INSERT INTO public.affiliate_conversions AS c
      (network, network_txn_id, status, commission_amount, commission_currency, commission_usd,
       sale_amount, sale_currency, sale_usd, transaction_time, sub_id, click_code, surface,
       partner_key, vertical, matched_click_id, listing_id, raw)
    VALUES (
      'amazon',
      v_row->>'order_id',
      COALESCE(NULLIF(v_row->>'status', ''), 'approved'),
      NULLIF(v_row->>'commission_amount', '')::numeric,
      COALESCE(NULLIF(v_row->>'currency', ''), 'USD'),
      public.fx_to_usd(NULLIF(v_row->>'commission_amount', '')::numeric, COALESCE(NULLIF(v_row->>'currency', ''), 'USD')),
      NULLIF(v_row->>'sale_amount', '')::numeric,
      COALESCE(NULLIF(v_row->>'currency', ''), 'USD'),
      public.fx_to_usd(NULLIF(v_row->>'sale_amount', '')::numeric, COALESCE(NULLIF(v_row->>'currency', ''), 'USD')),
      COALESCE(NULLIF(v_row->>'transaction_time', '')::timestamptz, now()),
      v_row->>'sub_id',
      v_code,
      COALESCE(v_click.surface, v_surface),
      COALESCE(v_click.partner, 'amazon'),
      COALESCE(v_click.vertical, 'shopping'),
      v_click.id,
      CASE WHEN v_click.entity_type = 'marketplace_listing' THEN v_click.entity_id END,
      v_row
    )
    ON CONFLICT (network, network_txn_id) DO UPDATE SET
      status = EXCLUDED.status,
      commission_amount = EXCLUDED.commission_amount,
      commission_usd = EXCLUDED.commission_usd,
      sale_amount = EXCLUDED.sale_amount,
      sale_usd = EXCLUDED.sale_usd,
      raw = EXCLUDED.raw;
    v_upserted := v_upserted + 1;
  END LOOP;

  RETURN jsonb_build_object('upserted', v_upserted);
END $$;

REVOKE ALL ON FUNCTION public.admin_import_amazon_conversions(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_import_amazon_conversions(jsonb) TO authenticated;

-- ── Cron: pull Awin + Travelpayouts every 6 h ──────────────────────
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('affiliate_conversions_sync', 'Affiliate conversions sync (Awin + Travelpayouts)',
   'Pulls realized transactions from the Awin publisher API and Travelpayouts stats API into affiliate_conversions, matching them back to affiliate_clicks via the per-click code. Idempotent upsert on (network, network_txn_id); re-pulls a 35-day trailing window so commission status transitions land. No-ops per network until its API token secret is set.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"edge_function","fn":"affiliate-conversions-sync"}'::jsonb, '25 */6 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description = EXCLUDED.description, action = EXCLUDED.action, schedule = EXCLUDED.schedule;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'affiliate_conversions_sync') THEN
    PERFORM cron.unschedule('affiliate_conversions_sync');
  END IF;
  PERFORM cron.schedule(
    'affiliate_conversions_sync', '25 */6 * * *',
    $cron$
    select net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/affiliate-conversions-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
      ),
      body := '{"network":"all"}'::jsonb
    ) as request_id;
    $cron$
  );
END $$;
