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

export interface FilterFacet {
  /** Noun phrase — what the filter IS. For the active-filter row. */
  noun: string;
  /** Imperative — what dropping it DOES. For the zero-result rescue. */
  relaxLabel: string;
  /** The filter set with this dimension removed. */
  next: MarketplaceFiltersInput;
}

/**
 * Every active filter dimension, most restrictive first, described twice.
 *
 * Two surfaces need the same list in different voices: the active-filter row
 * in the control band wants nouns ("Under $50 ×") and the zero-result rescue
 * wants imperatives ("Remove price limit ($0 – $50)"). Deriving both from one
 * list is what stops them disagreeing about what a filter is called or, worse,
 * about which dimensions exist — a facet added to one and forgotten in the
 * other is invisible in exactly the state where it matters.
 *
 * `search` is deliberately absent: it is not a chip, it is the text sitting in
 * the search field directly above, and rendering it twice invites the reader
 * to clear it in the place where they cannot see what they cleared. It still
 * counts toward `countActiveFilters`, so the "All filters" badge can legitimately
 * read one higher than the number of chips.
 */
export function describeActiveFilters(f: MarketplaceFiltersInput): FilterFacet[] {
  const facets: FilterFacet[] = [];
  if (f.priceRange) {
    const range =
      f.priceRange.max < 100000
        ? `$${f.priceRange.min} – ${f.priceRange.max}`
        : `$${f.priceRange.min}+`;
    facets.push({
      noun: range,
      relaxLabel: `Remove price limit (${range})`,
      next: { ...f, priceRange: undefined },
    });
  }
  for (const tag of f.tags ?? []) {
    const pretty = tag.replace(/^(mat|occ|vibe)-/, '').replace(/-/g, ' ');
    facets.push({
      noun: pretty,
      relaxLabel: `Remove tag "${pretty}"`,
      next: { ...f, tags: f.tags!.filter((t) => t !== tag) },
    });
  }
  if (f.communityOwned && f.communityOwned.length > 0) {
    facets.push({
      noun: f.communityOwned.map((v) => COMMUNITY_OWNED_LABELS[v] ?? v).join(' / '),
      relaxLabel: 'Remove ownership filter',
      next: { ...f, communityOwned: undefined },
    });
  }
  if (f.subcategory) {
    const pretty = f.subcategory.replace(/_/g, ' ');
    facets.push({
      noun: pretty,
      relaxLabel: `Show all ${pretty} alternatives`,
      next: { ...f, subcategory: undefined },
    });
  }
  if (f.location) {
    facets.push({
      noun: f.location,
      relaxLabel: `Remove location (${f.location})`,
      next: { ...f, location: undefined },
    });
  }
  if (f.verifiedWithinDays) {
    facets.push({
      noun: 'Recently verified',
      relaxLabel: 'Include older listings',
      next: { ...f, verifiedWithinDays: undefined },
    });
  }
  if (f.currency) {
    facets.push({
      noun: f.currency,
      relaxLabel: `Remove currency (${f.currency})`,
      next: { ...f, currency: undefined },
    });
  }
  // `availability: 'any'` widens rather than narrows — nothing to drop.
  if (f.department) {
    facets.push({
      noun: f.department.replace(/_/g, ' '),
      relaxLabel: 'Search all departments',
      next: { ...f, department: undefined, subcategory: undefined },
    });
  }
  return facets;
}

/**
 * One actionable "Remove {facet}" chip per active dimension, most
 * restrictive first — each applies the filter set minus that dimension.
 *
 * Capped at 5 because this renders inside an empty state, where the job is to
 * suggest a way out rather than enumerate. The active-filter row uses
 * `describeActiveFilters` directly and is deliberately NOT capped: a chip row
 * that silently hides the sixth filter tells the reader they have five.
 */
export function buildRelaxationSteps(f: MarketplaceFiltersInput): RelaxationStep[] {
  return describeActiveFilters(f)
    .slice(0, 5)
    .map(({ relaxLabel, next }) => ({ label: relaxLabel, next }));
}
