import type { Database } from '@/integrations/supabase/types';
import { formatCurrency } from '@/lib/currency';

export type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

export type FxRates = Record<string, number>;

/**
 * Convert a USD amount into a target currency using fx_rates (where
 * rate_to_usd is the native→USD multiplier).
 */
function convertFromUsd(usdAmount: number, target: string, rates: FxRates | undefined): number | null {
  if (!rates) return null;
  const code = target.toUpperCase();
  if (code === 'USD') return usdAmount;
  const rate = rates[code];
  if (!rate || rate <= 0) return null;
  return usdAmount / rate;
}

const AFFILIATE_SOURCES = new Set(['awin', 'shopify', 'etsy', 'amazon']);

export interface OutboundLink {
  url: string;
  label: string;
  isAffiliate: boolean;
  rel: string;
}

/**
 * Resolve the best outbound link for a listing.
 * Preference: affiliate_url → external_url → website → null.
 */
export function getOutboundLink(listing: MarketplaceListing): OutboundLink | null {
  const url = listing.affiliate_url ?? listing.external_url ?? listing.website;
  if (!url) return null;
  const isAffiliate = Boolean(listing.affiliate_url) || AFFILIATE_SOURCES.has(listing.source_type ?? '');
  const sourceLabel = sourceDisplayLabel(listing.source_type);
  const label = isAffiliate && sourceLabel
    ? `Shop on ${sourceLabel}`
    : isAffiliate
    ? 'Shop now'
    : 'Visit website';
  const rel = isAffiliate ? 'sponsored nofollow noopener noreferrer' : 'noopener noreferrer';
  return { url, label, isAffiliate, rel };
}

const KNOWN_SOURCE_LABELS: Record<string, string> = {
  awin: 'Awin',
  shopify: 'Shopify',
  etsy: 'Etsy',
  amazon: 'Amazon',
  user_submission: 'Community',
};

export function sourceDisplayLabel(sourceType: string | null | undefined): string | null {
  if (!sourceType) return null;
  return KNOWN_SOURCE_LABELS[sourceType] ?? null;
}

export function sourceProvenanceLine(listing: MarketplaceListing): string | null {
  const label = sourceDisplayLabel(listing.source_type);
  if (!label) return null;
  if (listing.source_type === 'user_submission') return 'Community submission';
  return `via ${label}`;
}

export interface TrustPill {
  key: string;
  label: string;
  title: string;
}

export function trustPillsFor(listing: MarketplaceListing): TrustPill[] {
  const pills: TrustPill[] = [];
  if (listing.business_type === 'queer-owned' || listing.business_type === 'lgbtq-owned') {
    pills.push({ key: 'owned', label: 'Queer-owned', title: 'Identified as a queer-owned business' });
  }
  if (AFFILIATE_SOURCES.has(listing.source_type ?? '')) {
    pills.push({ key: 'merchant', label: 'Verified merchant', title: 'Listed via a verified merchant integration' });
  }
  return pills;
}

export type LinkHealthState = 'ok' | 'stale' | 'broken' | 'unknown';

export function linkHealthState(listing: MarketplaceListing): LinkHealthState {
  const h = listing.link_health;
  if (h === 'broken' || h === 'dead') return 'broken';
  if (h === 'stale' || h === 'warning') return 'stale';
  if (h === 'ok' || h === 'healthy') return 'ok';
  return 'unknown';
}

export interface PriceDisplay {
  primary: string;
  secondary: string | null;
  modifier: string | null;
}

export interface FormatPriceOpts {
  /** User's selected display currency (e.g. 'GBP'). Defaults to 'USD'. */
  displayCurrency?: string;
  /** Live fx_rates map. When undefined, the secondary line is suppressed. */
  rates?: FxRates;
}

/**
 * Format the listing price with optional native + display-currency line.
 *
 * Primary: the listing's native currency (e.g. €32).
 * Secondary: ≈ converted to the user's selected display currency
 * (e.g. ≈ £27). Omitted when native == display, or when no fx rate is
 * available for the requested display currency.
 */
export function formatListingPrice(listing: MarketplaceListing, opts: FormatPriceOpts = {}): PriceDisplay {
  if (!listing.price && listing.price_type !== 'free') {
    return { primary: 'Price varies', secondary: null, modifier: null };
  }
  if (listing.price_type === 'free') {
    return { primary: 'Free', secondary: null, modifier: null };
  }
  const nativeCurrency = (listing.currency || 'USD').toUpperCase();
  const displayCurrency = (opts.displayCurrency || 'USD').toUpperCase();
  const primary = formatCurrency(listing.price!, nativeCurrency);
  let secondary: string | null = null;
  if (nativeCurrency !== displayCurrency && typeof listing.price_usd === 'number') {
    const converted = convertFromUsd(listing.price_usd, displayCurrency, opts.rates);
    if (converted != null && Math.abs(converted - listing.price!) > 0.01) {
      secondary = `≈ ${formatCurrency(converted, displayCurrency)}`;
    }
  }
  let modifier: string | null = null;
  if (listing.price_type === 'starting_at') modifier = 'from';
  else if (listing.price_type === 'negotiable') modifier = 'negotiable';
  return { primary, secondary, modifier };
}

export function highlightMatches(text: string, query: string | undefined | null): Array<{ text: string; match: boolean }> {
  const q = (query ?? '').trim();
  if (!q || !text) return [{ text, match: false }];
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'ig');
  const parts = text.split(re);
  return parts.filter(Boolean).map((part) => ({ text: part, match: part.toLowerCase() === q.toLowerCase() }));
}
