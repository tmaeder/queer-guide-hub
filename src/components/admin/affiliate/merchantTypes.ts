/** Row shape of the admin_merchant_overview RPC (migration 20260726110000). */
export interface MerchantOverviewRow {
  merchant_id: string;
  provider: string;
  slug: string;
  display_name: string;
  shop_domain: string | null;
  is_enabled: boolean;
  awin_advertiser_id: string | null;
  affiliate_partner_id: string | null;
  partner_name: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_items: number | null;
  listings_total: number;
  listings_active: number;
  link_ok: number;
  link_broken: number;
  link_redirect: number;
  link_timeout: number;
  link_unchecked: number;
  images_mirrored: number;
  price_points: number;
  relevance_rejects: number;
  clicks: number;
  impressions: number;
  conversions: number;
  commission_usd: number;
}
