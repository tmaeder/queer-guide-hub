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

// Taxonomy v3 — 8 lines × ~5 stops. Matches migration
// 20261006140000_tag_taxonomy_v3_tree.sql. The v2 names further down stay
// until PR E of the recategorization program deletes the old tree — a
// leftover tag can still carry one during the coexistence window.
const categoryMeta: Record<string, CategoryInfo> = {
  // v3 lines
  Identity: { short: 'Identity' },
  'Sex & Kink': { short: 'Sex & Kink' },
  'Relationships & Family': { short: 'Relationships' },
  Health: { short: 'Health' },
  'Safety & Consent': { short: 'Safety' },
  'Culture & Community': { short: 'Culture' },
  'History & Rights': { short: 'History' },
  'Places & Scene': { short: 'Places' },

  // v3 stops (renamed or new; unchanged names — Sexual Health, Mental
  // Health, Practices & Play, Consent & Negotiation, Movements & Milestones,
  // Intersex & Bodies, Relationship Structures, Symbols & Flags — are
  // already listed in the v2 block below)
  Orientation: { short: 'Orientation' },
  Gender: { short: 'Gender' },
  'Umbrella Terms & Labels': { short: 'Umbrella terms' },
  'Expression & Style': { short: 'Expression' },
  'Dynamics & Roles': { short: 'Dynamics' },
  Fetishes: { short: 'Fetishes' },
  Gear: { short: 'Gear' },
  'Kink Community & Scenes': { short: 'Kink scene' },
  'Dating & Connection': { short: 'Dating' },
  'Marriage & Partnership': { short: 'Marriage' },
  'Family & Parenting': { short: 'Family' },
  'Trans Health & Gender-Affirming Care': { short: 'Trans health' },
  'Body & Reproductive Health': { short: 'Body' },
  'Substances & Recovery': { short: 'Substances' },
  'Safer Sex Practices': { short: 'Safer sex' },
  'Violence & Hate': { short: 'Violence' },
  'Digital & Travel Safety': { short: 'Safety' },
  'Slang & Language': { short: 'Slang' },
  'Drag & Performance': { short: 'Drag' },
  'Subcultures & Scenes': { short: 'Scenes' },
  'Media & Entertainment': { short: 'Media' },
  'Arts & Literature': { short: 'Arts' },
  'Sports & Recreation': { short: 'Sports' },
  'People & Icons': { short: 'People' },
  'Laws & Legal Rights': { short: 'Legal' },
  'Politics & Activism': { short: 'Activism' },
  'Work, School & Institutions': { short: 'Institutions' },
  'Religion & Belief': { short: 'Religion' },
  'Venue Types': { short: 'Venues' },
  'Venue Features & Policies': { short: 'Features' },
  'Vibe & Crowd': { short: 'Vibe' },
  Audiences: { short: 'Audiences' },
  'Events & Parties': { short: 'Events' },
  Stays: { short: 'Stays' },
  Destinations: { short: 'Destinations' },
  'Community Life & Support': { short: 'Community life' },
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

// Stable display order for the lines — used by Overview and the filter bar.
// Taxonomy v3 (20261006140000): 8 lines. The rail/graph render ONLY these
// names, which is what keeps the old tree invisible during the swap's
// coexistence window.
export const parentOrder: string[] = [
  'Identity',
  'Sex & Kink',
  'Relationships & Family',
  'Health',
  'Safety & Consent',
  'Culture & Community',
  'History & Rights',
  'Places & Scene',
];

/**
 * P2-1 — single source of truth for the adult-content category list.
 * Both the parent "Sexuality & Kink" and every leaf under it are gated
 * behind the age affirmation modal + Safe mode in SafeModeProvider.
 *
 * These are v3 taxonomy names, held in `tag_categories` and reached through
 * `tag_category_assignments`. That is the right axis for the age gate and the
 * noindex rule, which both read `selectedTag.categories`. The SQL twin is
 * `unified_tags_recompute_is_adult()` (20261006150000) — renaming a kink stop
 * means editing BOTH, and the union in between is how the v2→v3 swap avoided
 * a window where a re-filed tag matched neither.
 *
 * It is the WRONG axis anywhere the category arrives as `unified_tags.category`
 * — the legacy free-text column, whose values ('Kink & Fetish', 'Power
 * Exchange', 'BDSM', 'Fetish Practices', …) appear in none of these names, and
 * which is NULL entirely for a third of active tags. Prefer `isAdultTag()`
 * below, which trusts the `is_adult` flag first.
 */
export const ADULT_CATEGORY_NAMES: ReadonlySet<string> = new Set([
  'Sex & Kink',
  'Practices & Play',
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
