/**
 * Short display names for the taxonomy.
 *
 * The per-category lucide icon that used to live here went with the resource
 * hub: the glossary is a TransitIcon surface (a surface never mixes the two
 * icon sets), and the ten parents' transit identity is in
 * src/lib/tags/categoryIdentity.ts. Deleting it took a 54-icon lucide import
 * off every page that only wanted a short name.
 */
type CategoryInfo = { short: string };

// Taxonomy v2 — 10 parents × ~5 children. Matches slugs seeded in migration
// 20260411160000_resources_taxonomy_v2.sql.
const categoryMeta: Record<string, CategoryInfo> = {
  // Parents
  'Identity & Expression': { short: 'Identity' },
  'Sexuality & Kink': { short: 'Sex & Kink' },
  'Relationships & Connection': { short: 'Relationships' },
  'Health & Wellness': { short: 'Health' },
  'Safety & Practices': { short: 'Safety' },
  'Community & Culture': { short: 'Community' },
  'History & Heritage': { short: 'History' },
  'Rights & Activism': { short: 'Rights' },
  'Places & Travel': { short: 'Places' },
  'Support & News': { short: 'Support' },

  // Identity & Expression
  'Sexual Orientation': { short: 'Orientation' },
  'Gender Identity': { short: 'Gender' },
  'Expression & Presentation': { short: 'Expression' },
  'Intersex & Bodies': { short: 'Intersex' },
  'Questioning & Labels': { short: 'Questioning' },

  // Sexuality & Kink
  'Sexual Roles': { short: 'Roles' },
  'BDSM & Power Exchange': { short: 'BDSM' },
  'Fetishes & Interests': { short: 'Fetishes' },
  'Practices & Play': { short: 'Play' },
  'Gear & Aesthetics': { short: 'Gear' },
  'Body Types & Archetypes': { short: 'Archetypes' },

  // Relationships & Connection
  'Relationship Structures': { short: 'Structures' },
  'Dating & Courtship': { short: 'Dating' },
  'Family & Chosen Family': { short: 'Family' },
  'Friendship & Community': { short: 'Friendship' },

  // Health & Wellness
  'Sexual Health': { short: 'Sexual' },
  'Mental Health': { short: 'Mental' },
  'Physical & Reproductive': { short: 'Physical' },
  'Substances & Harm Reduction': { short: 'Substances' },
  'Care Access': { short: 'Care' },

  // Safety & Practices
  'Consent & Negotiation': { short: 'Consent' },
  'Safer Sex': { short: 'Safer Sex' },
  'Physical & Digital Safety': { short: 'Safety' },
  'Risk-Aware Play': { short: 'RACK' },

  // Community & Culture
  'Slang & Terminology': { short: 'Slang' },
  'Media, Film & Music': { short: 'Media' },
  'Art, Literature & Zines': { short: 'Art' },
  'Events & Scene': { short: 'Events' },
  Subcultures: { short: 'Scenes' },

  // History & Heritage
  'Movements & Milestones': { short: 'Movements' },
  'Figures & Icons': { short: 'Figures' },
  'Queer History by Region': { short: 'Regional' },
  'Symbols & Flags': { short: 'Symbols' },

  // Rights & Activism
  'Legal Rights': { short: 'Legal' },
  'Political Activism': { short: 'Activism' },
  'Workplace, Education & Policy': { short: 'Workplace' },
  'Global & Regional Rights': { short: 'Global' },

  // Places & Travel
  'Venues & Nightlife': { short: 'Venues' },
  'Travel & Destinations': { short: 'Travel' },
  'Safe Spaces': { short: 'Safe' },
  Accommodation: { short: 'Stays' },

  // Support & News
  'Helplines & Hotlines': { short: 'Helplines' },
  'Support Services & NGOs': { short: 'Services' },
  'Current Affairs': { short: 'News' },
  'Professions & Allies': { short: 'Professions' },
};

// Stable display order for parents — used by Overview and the filter bar.
export const parentOrder: string[] = [
  'Identity & Expression',
  'Sexuality & Kink',
  'Relationships & Connection',
  'Health & Wellness',
  'Safety & Practices',
  'Community & Culture',
  'History & Heritage',
  'Rights & Activism',
  'Places & Travel',
  'Support & News',
];

/**
 * P2-1 — single source of truth for the adult-content category list.
 * Both the parent "Sexuality & Kink" and every leaf under it are gated
 * behind the age affirmation modal + Safe mode in SafeModeProvider.
 *
 * These are v2 taxonomy names, held in `tag_categories` and reached through
 * `tag_category_assignments`. That is the right axis for the age gate and the
 * noindex rule, which both read `selectedTag.categories`.
 *
 * It is the WRONG axis anywhere the category arrives as `unified_tags.category`
 * — the legacy free-text column, whose values ('Kink & Fetish', 'Power
 * Exchange', 'BDSM', 'Fetish Practices', …) appear in none of these names, and
 * which is NULL entirely for a third of active tags. Prefer `isAdultTag()`
 * below, which trusts the `is_adult` flag first.
 */
export const ADULT_CATEGORY_NAMES: ReadonlySet<string> = new Set([
  'Sexuality & Kink',
  'Sexual Roles',
  'BDSM & Power Exchange',
  'Fetishes & Interests',
  'Practices & Play',
  'Gear & Aesthetics',
  'Body Types & Archetypes',
  // Incoming taxonomy (2026-08-29 recategorization program, PR B renames the
  // kink line + stops). The union must be live BEFORE any tag is re-filed,
  // or a re-filed kink tag stops matching and loses its age gate. The SQL
  // twin lives in unified_tags_recompute_is_adult() (20261006090100); PR E
  // trims the outgoing names once the old tree is deleted.
  'Sex & Kink',
  'Dynamics & Roles',
  'Fetishes',
  'Gear',
  'Kink Community & Scenes',
]);

export function isAdultCategoryName(name: string | null | undefined): boolean {
  return !!name && ADULT_CATEGORY_NAMES.has(name);
}

/**
 * Whether a tag is adult content, for Safe mode filtering.
 *
 * `unified_tags.is_adult` is the real axis and is checked first; the category
 * name is kept as a fallback so a tag that is categorised but not yet flagged
 * still gets hidden. Erring toward hiding is deliberate — under-moderation is
 * the worse failure here.
 */
export function isAdultTag(tag: { is_adult?: boolean | null; category?: string | null }): boolean {
  return tag.is_adult === true || isAdultCategoryName(tag.category);
}

export function getCategoryShortName(category: string): string {
  return categoryMeta[category]?.short || category;
}
