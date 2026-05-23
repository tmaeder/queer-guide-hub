/**
 * Maps internal venue category / subtype enum codes to human-readable labels
 * used in <title>, <meta name="description">, and bot-body copy.
 *
 * The DB function normalize_venue_category() collapses raw input to a fixed
 * code set ('bar', 'club', 'restaurant', 'hotel', 'sauna', 'theater',
 * 'community_center', 'organization', 'event-venue', 'gallery', 'other').
 * Subtype is freer-form and may contain spaces ("queer bookshop", "drag bar")
 * — we treat it as best-effort, normalising to lowercase and looking up.
 *
 * "other" must NEVER reach a user-facing string. It collapses to the generic
 * "space" so descriptions read naturally ("LGBTQ+ space in Berlin") rather
 * than ("LGBTQ+ other on Queer Guide").
 */

const CATEGORY_LABELS: Record<string, string> = {
  bar: 'bar',
  pub: 'bar',
  'bar/club': 'bar',
  'bar / club': 'bar',
  club: 'nightclub',
  nightclub: 'nightclub',
  sexclub: 'nightclub',
  restaurant: 'restaurant',
  cafe: 'café',
  'café': 'café',
  coffee: 'café',
  coffeeshop: 'café',
  'coffee shop': 'café',
  hotel: 'hotel',
  hostel: 'hostel',
  accommodation: 'accommodation',
  sauna: 'sauna',
  spa: 'spa',
  theater: 'theatre',
  theatre: 'theatre',
  cinema: 'cinema',
  community_center: 'community space',
  'community center': 'community space',
  'community-center': 'community space',
  organization: 'organisation',
  'non-profit': 'organisation',
  'event-venue': 'event venue',
  'event venue': 'event venue',
  gallery: 'gallery',
  museum: 'museum',
  shop: 'shop',
  store: 'shop',
  boutique: 'boutique',
  bookshop: 'bookshop',
  bookstore: 'bookshop',
  cruising: 'cruising space',
};

/**
 * Returns a user-facing label for the venue category, never the bare word
 * "other". Subtype takes precedence over the coarse category; both are looked
 * up against the same table. If neither matches anything informative, returns
 * 'space' (a neutral catch-all suitable for descriptions).
 */
export function categoryLabel(subtype?: string | null, category?: string | null): string {
  const candidates = [subtype, category].filter((s): s is string => typeof s === 'string' && s.length > 0);
  for (const raw of candidates) {
    const norm = raw.trim().toLowerCase();
    if (norm && norm !== 'other' && CATEGORY_LABELS[norm]) {
      return CATEGORY_LABELS[norm];
    }
  }
  return 'space';
}

/**
 * Title-Case version, e.g. for use mid-sentence at the start of a clause.
 */
export function categoryLabelTitle(subtype?: string | null, category?: string | null): string {
  const label = categoryLabel(subtype, category);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
