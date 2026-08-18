/**
 * Transit identity for the ten taxonomy parents.
 *
 * **Monochrome on purpose — the lines carry icons, not track colours.**
 *
 * Cycling ten parents through four tracks was considered and rejected. Three
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

/** Name → line. Slugs match migration 20260411160001_resources_taxonomy_v2.sql. */
export const CATEGORY_LINES: Record<string, CategoryLine> = {
  'Identity & Expression': {
    name: 'Identity & Expression',
    slug: 'identity-expression',
    icon: 'profile',
  },
  'Sexuality & Kink': { name: 'Sexuality & Kink', slug: 'sexuality-kink', icon: 'consent' },
  'Relationships & Connection': {
    name: 'Relationships & Connection',
    slug: 'relationships-connection',
    icon: 'community',
  },
  'Health & Wellness': { name: 'Health & Wellness', slug: 'health-wellness', icon: 'health' },
  'Safety & Practices': { name: 'Safety & Practices', slug: 'safety-practices', icon: 'alerts' },
  'Community & Culture': {
    name: 'Community & Culture',
    slug: 'community-culture',
    icon: 'meetups',
  },
  'History & Heritage': { name: 'History & Heritage', slug: 'history-heritage', icon: 'library' },
  'Rights & Activism': { name: 'Rights & Activism', slug: 'rights-activism', icon: 'march' },
  'Places & Travel': { name: 'Places & Travel', slug: 'places-travel', icon: 'compass' },
  'Support & News': { name: 'Support & News', slug: 'support-news', icon: 'helpline' },
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
