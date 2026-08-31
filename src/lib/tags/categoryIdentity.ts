/**
 * Transit identity for the taxonomy lines (v3: eight).
 *
 * **Monochrome on purpose — the lines carry icons, not track colours.**
 *
 * Cycling the parents through four tracks was considered and rejected. Three
 * parents would share pink with nothing to tell them apart: `policyLines.ts`
 * gets away with duplicate hues only because each of its lines also carries a
 * distinct letter (`T`/`P`/`C`/`©`), and a taxonomy parent has no such
 * disambiguator. Worse, `ROUTE_BULLET_MAP.tag` is `{ letter: '#', track:
 * 'pink' }` and every tag chip on the site already renders it — so recolouring
 * a tag by its category means a reader who clicked a pink `#` chip lands on a
 * green page, and the mapping table stops being a mapping.
 *
 * So pink `#` stays the page's one accent, and a parent is identified by its
 * icon plus an ink station ring. That also survives the taxonomy growing past
 * ten parents, which a four-colour scheme does not.
 *
 * Keyed by category NAME because that is what `tag_categories.name`,
 * `parentOrder` and `TagCategoryInfo.parent_name` all speak. `slug` is carried
 * alongside for `/tags/c/:categorySlug` hrefs.
 */

import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { parentOrder } from '@/components/resources/categoryMeta';

export interface CategoryLine {
  /** `tag_categories.name` — the join key across the taxonomy. */
  name: string;
  /** `tag_categories.slug` — the URL segment. */
  slug: string;
  icon: TransitIconName;
}

/** Name → line. Slugs match migration 20261006140000_tag_taxonomy_v3_tree.sql. */
export const CATEGORY_LINES: Record<string, CategoryLine> = {
  Identity: { name: 'Identity', slug: 'identity', icon: 'profile' },
  'Sex & Kink': { name: 'Sex & Kink', slug: 'sex-kink', icon: 'consent' },
  'Relationships & Family': {
    name: 'Relationships & Family',
    slug: 'relationships-family',
    icon: 'community',
  },
  Health: { name: 'Health', slug: 'health', icon: 'health' },
  'Safety & Consent': { name: 'Safety & Consent', slug: 'safety-consent', icon: 'alerts' },
  'Culture & Community': {
    name: 'Culture & Community',
    slug: 'culture-community',
    icon: 'meetups',
  },
  'History & Rights': { name: 'History & Rights', slug: 'history-rights', icon: 'march' },
  'Places & Scene': { name: 'Places & Scene', slug: 'places-scene', icon: 'compass' },
};

/** Ordered lines, following the canonical `parentOrder`. */
export const CATEGORY_LINE_ORDER: CategoryLine[] = parentOrder
  .map((name) => CATEGORY_LINES[name])
  .filter(Boolean);

/** Fallback for a child category or an unmapped parent. */
export const DEFAULT_CATEGORY_ICON: TransitIconName = 'library';

export function lineForCategory(nameOrSlug: string | null | undefined): CategoryLine | undefined {
  if (!nameOrSlug) return undefined;
  return (
    CATEGORY_LINES[nameOrSlug] ??
    CATEGORY_LINE_ORDER.find((l) => l.slug === nameOrSlug.toLowerCase())
  );
}
