/**
 * Category color system — each content type gets a unique vibrant color
 * via CSS custom properties defined in index.css.
 *
 * Inspired by LABASAD's discipline color system where colors flow through
 * nav, cards, buttons, and hover states.
 */

export const CATEGORY_KEYS = [
  'venues',
  'events',
  'marketplace',
  'places',
  'hotels',
  'travel',
  'news',
  'community',
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/** Returns `hsl(var(--cat-{key}))` for use in inline styles or sx props. */
export function categoryColor(key: CategoryKey): string {
  return `hsl(var(--cat-${key}))`;
}

/** Returns the CSS variable reference `var(--cat-{key})` (HSL triplet without hsl()). */
export function categoryVar(key: CategoryKey): string {
  return `var(--cat-${key})`;
}

/** Returns a subtle background tint for the category. */
export function categoryBg(key: CategoryKey, isDark: boolean): string {
  return isDark
    ? `hsl(var(--cat-${key}) / 0.1)`
    : `hsl(var(--cat-${key}) / 0.08)`;
}

/** Maps route-related keys to a CategoryKey. */
const ROUTE_MAP: Record<string, CategoryKey> = {
  venues: 'venues',
  events: 'events',
  marketplace: 'marketplace',
  places: 'places',
  hotels: 'hotels',
  travel: 'travel',
  news: 'news',
  community: 'community',
  groups: 'community',
  feed: 'community',
  members: 'community',
  resources: 'news',
};

/** Resolve a route segment or feature key to a CategoryKey (fallback: 'venues'). */
export function resolveCategoryKey(key: string): CategoryKey {
  return ROUTE_MAP[key] ?? 'venues';
}
