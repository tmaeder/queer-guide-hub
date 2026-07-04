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

export interface RelaxationStep {
  label: string;
  next: MarketplaceFiltersInput;
}

/**
 * One actionable "Remove {facet}" chip per active dimension, most
 * restrictive first — each applies the filter set minus that dimension.
 */
export function buildRelaxationSteps(f: MarketplaceFiltersInput): RelaxationStep[] {
  const steps: RelaxationStep[] = [];
  if (f.priceRange) {
    const label =
      f.priceRange.max < 100000
        ? `Remove price limit ($${f.priceRange.min} – ${f.priceRange.max})`
        : `Remove price limit ($${f.priceRange.min}+)`;
    steps.push({ label, next: { ...f, priceRange: undefined } });
  }
  for (const tag of f.tags ?? []) {
    steps.push({
      label: `Remove tag "${tag.replace(/^(mat|occ|vibe)-/, '').replace(/-/g, ' ')}"`,
      next: { ...f, tags: f.tags!.filter((t) => t !== tag) },
    });
  }
  if (f.communityOwned && f.communityOwned.length > 0) {
    steps.push({
      label: 'Remove ownership filter',
      next: { ...f, communityOwned: undefined },
    });
  }
  if (f.subcategory) {
    steps.push({
      label: `Show all ${f.subcategory.replace(/_/g, ' ')} alternatives`,
      next: { ...f, subcategory: undefined },
    });
  }
  if (f.location) {
    steps.push({ label: `Remove location (${f.location})`, next: { ...f, location: undefined } });
  }
  if (f.verifiedWithinDays) {
    steps.push({
      label: 'Include older listings',
      next: { ...f, verifiedWithinDays: undefined },
    });
  }
  if (f.currency) {
    steps.push({ label: `Remove currency (${f.currency})`, next: { ...f, currency: undefined } });
  }
  if (f.availability === 'any') {
    // Widening, not narrowing — no step.
  }
  if (f.department) {
    steps.push({
      label: 'Search all departments',
      next: { ...f, department: undefined, subcategory: undefined },
    });
  }
  return steps.slice(0, 5);
}
