import type { MarketplaceFiltersInput } from '@/hooks/useMarketplace';

const COMMUNITY_OWNED_LABELS: Record<string, string> = {
  queer_owned: 'queer-owned',
  trans_owned: 'trans-owned',
  bipoc_owned: 'BIPOC-owned',
  women_owned: 'women-owned',
  disabled_owned: 'disabled-owned',
  nonprofit: 'non-profit',
};

/**
 * Build a concrete empty-state title from the active filter set so it
 * reads like the user's own query rather than a generic "no results"
 * panel — "No queer-owned listings under $50 in Berlin." instead of
 * "No listings match these filters."
 */
export function buildEmptyTitle(f: MarketplaceFiltersInput): string {
  const parts: string[] = [];
  if (f.communityOwned && f.communityOwned.length > 0) {
    parts.push(f.communityOwned.map((v) => COMMUNITY_OWNED_LABELS[v] ?? v).join(' / '));
  }
  parts.push(f.subcategory ? f.subcategory.replace(/_/g, ' ') : 'listings');
  const qualifiers: string[] = [];
  if (f.priceRange) {
    if (f.priceRange.max < 100000) qualifiers.push(`under $${f.priceRange.max}`);
    else if (f.priceRange.min > 0) qualifiers.push(`over $${f.priceRange.min}`);
  }
  if (f.location) qualifiers.push(`in ${f.location}`);
  if (f.search) qualifiers.push(`matching "${f.search}"`);
  return `No ${parts.join(' ')}${qualifiers.length ? ' ' + qualifiers.join(', ') : ''}.`;
}

/**
 * Suggest which filter dimension to drop. Picks the most restrictive
 * one first so the suggestion is actionable, not "try clearing
 * filters" hand-wave.
 */
export function buildLooseningSuggestion(f: MarketplaceFiltersInput): string {
  const suggestions: string[] = [];
  if (f.location) suggestions.push(`Drop the city (${f.location})?`);
  if (f.priceRange && f.priceRange.max < 100000) suggestions.push(`Raise the price ceiling?`);
  if (f.communityOwned && f.communityOwned.length > 0)
    suggestions.push(`Loosen the ownership filter?`);
  if (f.subcategory) suggestions.push(`Show all categories?`);
  if (f.verifiedWithinDays) suggestions.push(`Include older listings?`);
  if (suggestions.length === 0) return 'Try broadening your search.';
  return suggestions.slice(0, 2).join(' ');
}
