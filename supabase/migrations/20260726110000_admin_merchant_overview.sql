-- Affiliate Cockpit v2 — P1 unified vendor view.
--
-- One RPC returning every marketplace merchant with its sync state, listing
-- counts, link-health rollup, image-mirror coverage, price activity,
-- relevance-gate rejects, clicks/impressions and realized commission — the
-- "all vendors, their statistics and affiliate configuration in one place"
-- query behind the Merchants tab.
--
-- Listing linkage (in reliability order):
--   1. marketplace_listing_sources.source_slug = merchant.slug  (sync fn stamps it)
--   2. marketplace_listings.source_type       = merchant.slug  (staging stamp)
--   3. marketplace_listings.merchant_domain   = merchant.shop_domain (fallback)

CREATE OR REPLACE FUNCTION public.admin_merchant_overview(p_days int DEFAULT 30)
RETURNS TABLE (
  merchant_id uuid, provider text, slug text, display_name text,
  shop_domain text, is_enabled boolean, awin_advertiser_id text,
  affiliate_partner_id uuid, partner_name text,
  last_sync_at timestamptz, last_sync_status text, last_sync_items int,
  listings_total bigint, listings_active bigint,
  link_ok bigint, link_broken bigint, link_redirect bigint,
  link_timeout bigint, link_unchecked bigint,
  images_mirrored bigint,
  price_points bigint,
  relevance_rejects bigint,
  clicks bigint, impressions bigint,
  conversions bigint, commission_usd numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_iv interval := make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 365));
BEGIN
  IF NOT public.has_role_jwt('admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  RETURN QUERY
  WITH listing_map AS (
    SELECT DISTINCT x.m_id, x.listing_id
    FROM (
      SELECT m.id AS m_id, s.listing_id
      FROM public.marketplace_merchants m
      JOIN public.marketplace_listing_sources s ON s.source_slug = m.slug
      UNION
      SELECT m.id, l.id
      FROM public.marketplace_merchants m
      JOIN public.marketplace_listings l ON l.source_type = m.slug
      UNION
      SELECT m.id, l.id
      FROM public.marketplace_merchants m
      JOIN public.marketplace_listings l
        ON m.shop_domain IS NOT NULL AND l.merchant_domain = m.shop_domain
    ) x
  ),
  listing_stats AS (
    SELECT lm.m_id,
      count(*)::bigint AS listings_total,
      count(*) FILTER (WHERE l.status = 'active')::bigint AS listings_active,
      count(*) FILTER (WHERE l.link_health = 'ok')::bigint AS link_ok,
      count(*) FILTER (WHERE l.link_health = 'broken')::bigint AS link_broken,
      count(*) FILTER (WHERE l.link_health = 'redirect')::bigint AS link_redirect,
      count(*) FILTER (WHERE l.link_health = 'timeout')::bigint AS link_timeout,
      count(*) FILTER (WHERE COALESCE(l.link_health, 'unchecked') = 'unchecked')::bigint AS link_unchecked,
      count(*) FILTER (WHERE l.image_hashes IS NOT NULL AND l.image_hashes <> '[]'::jsonb)::bigint AS images_mirrored
    FROM listing_map lm
    JOIN public.marketplace_listings l ON l.id = lm.listing_id
    GROUP BY 1
  ),
  price_stats AS (
    SELECT lm.m_id, count(*)::bigint AS price_points
    FROM listing_map lm
    JOIN public.marketplace_price_history ph ON ph.listing_id = lm.listing_id
    WHERE ph.observed_at >= now() - v_iv
    GROUP BY 1
  ),
  click_stats AS (
    SELECT lm.m_id,
      count(*) FILTER (WHERE ac.kind = 'click')::bigint AS clicks,
      count(*) FILTER (WHERE ac.kind = 'impression')::bigint AS impressions
    FROM listing_map lm
    JOIN public.affiliate_clicks ac
      ON ac.entity_type = 'marketplace_listing' AND ac.entity_id = lm.listing_id
    WHERE ac.clicked_at >= now() - v_iv
    GROUP BY 1
  ),
  reject_stats AS (
    SELECT m.id AS m_id, count(*)::bigint AS relevance_rejects
    FROM public.marketplace_merchants m
    JOIN public.ingestion_staging st ON st.source_type = m.slug
    WHERE st.disposition = 'rejected' AND st.created_at >= now() - v_iv
    GROUP BY 1
  ),
  conv_stats AS (
    SELECT c.merchant_id AS m_id,
      count(*)::bigint AS conversions,
      COALESCE(sum(c.commission_usd), 0) AS commission_usd
    FROM public.affiliate_conversions c
    WHERE c.merchant_id IS NOT NULL AND c.transaction_time >= now() - v_iv
    GROUP BY 1
  )
  SELECT
    m.id, m.provider, m.slug, m.display_name,
    m.shop_domain, m.is_enabled, m.awin_advertiser_id,
    m.affiliate_partner_id, ap.partner_name,
    m.last_sync_at, m.last_sync_status, m.last_sync_items,
    COALESCE(ls.listings_total, 0), COALESCE(ls.listings_active, 0),
    COALESCE(ls.link_ok, 0), COALESCE(ls.link_broken, 0), COALESCE(ls.link_redirect, 0),
    COALESCE(ls.link_timeout, 0), COALESCE(ls.link_unchecked, 0),
    COALESCE(ls.images_mirrored, 0),
    COALESCE(ps.price_points, 0),
    COALESCE(rs.relevance_rejects, 0),
    COALESCE(cs.clicks, 0), COALESCE(cs.impressions, 0),
    COALESCE(vs.conversions, 0), COALESCE(vs.commission_usd, 0)
  FROM public.marketplace_merchants m
  LEFT JOIN public.affiliate_partners ap ON ap.id = m.affiliate_partner_id
  LEFT JOIN listing_stats ls ON ls.m_id = m.id
  LEFT JOIN price_stats ps ON ps.m_id = m.id
  LEFT JOIN click_stats cs ON cs.m_id = m.id
  LEFT JOIN reject_stats rs ON rs.m_id = m.id
  LEFT JOIN conv_stats vs ON vs.m_id = m.id
  ORDER BY m.display_name;
END $$;

REVOKE ALL ON FUNCTION public.admin_merchant_overview(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_merchant_overview(int) TO authenticated;
