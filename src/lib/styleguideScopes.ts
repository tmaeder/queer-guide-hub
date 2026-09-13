/**
 * The controlled vocabulary for `styleguide_rules.applies_to`.
 *
 * Mirrors `public.styleguide_scope_values()` and the
 * `styleguide_rules_applies_to_known` CHECK. Drift-tested against the migration
 * by `src/lib/__tests__/styleguideScopes.test.ts`.
 *
 * It shipped as free text — only a cardinality bound and a lowercase-slug
 * regex — which meant `venue` and `venues` both validated and silently meant
 * different things, and a typo made a rule invisible to the surface it was
 * written for with nothing reporting it. Same shape as `venues.category`
 * (DB CHECK + drift-tested TS) and for the same reason.
 *
 * `glossary` was retired in favour of `tag`: both were in use on the seeded
 * rules, two spellings of one surface. `tag` wins because it is what the table
 * (`unified_tags`), the route (`/tags/:slug`) and the consuming edge function
 * (`tag-enrichment-sweep`) are all called — a caller has to spell a scope the
 * way its own code spells it.
 */

/** `all` means every surface; the rest are content/page scopes. */
export const STYLEGUIDE_SCOPES = [
  'all',
  'venue',
  'event',
  'city',
  'country',
  'village',
  'landmark',
  'hotel',
  'marketplace',
  'news',
  'tag',
  'personality',
  'guide',
  'rights',
  'safety',
] as const;

export type StyleguideScope = (typeof STYLEGUIDE_SCOPES)[number];

const SCOPE_SET: ReadonlySet<string> = new Set(STYLEGUIDE_SCOPES);

export function isStyleguideScope(value: string): value is StyleguideScope {
  return SCOPE_SET.has(value);
}

/** Human labels for the admin editor. Absent keys fall back to the slug. */
export const SCOPE_LABELS: Record<StyleguideScope, string> = {
  all: 'All surfaces',
  venue: 'Venues',
  event: 'Events',
  city: 'Cities',
  country: 'Countries',
  village: 'Queer villages',
  landmark: 'Landmarks',
  hotel: 'Hotels',
  marketplace: 'Marketplace',
  news: 'News',
  tag: 'Glossary / tags',
  personality: 'Personalities',
  guide: 'Guides',
  rights: 'Rights pages',
  safety: 'Safety pages',
};
