/**
 * The curated activity vocabulary offered on /people.
 *
 * WHY A CURATED LIST AND NOT "POPULAR TAGS".
 * Ranking `unified_tags` by assignment count puts Silicone (4,197), Spandex,
 * Bold and Everyday at the top — marketplace attribute tags, because the
 * catalogue has ~57k listings. A "popular interests" picker would offer people
 * *Silicone*. Category filtering alone does not rescue it either: the
 * activity-ish categories also contain Chalkboards, Marble, Frescoes,
 * Good-For-A-Quick-Meal and Gay-Owned. So the list is hand-picked.
 *
 * WHY ACTIVITIES AND NOT IDENTITY — THE LOAD-BEARING RULE.
 * The interest-appropriate tags with the highest usage are identity tags: Gay,
 * Transgender, Sexual Orientation And Gender Identity. `profiles.interests`
 * feeds people-matching, and a match is SHOWN TO ANOTHER USER. Turning identity
 * into the matching key would make "people who share your interests" a
 * mechanism for inferring someone's identity from a profile that never states
 * it. On this product that is an outing surface, so these categories are
 * excluded by rule, not by oversight:
 *
 *   Sexual Orientation · Gender Identity · Expression & Presentation ·
 *   Questioning & Labels
 *
 * Also excluded: Fetishes & Interests, BDSM & Power Exchange, Practices & Play,
 * Sexual Health, Substances & Harm Reduction. Matching strangers on those is a
 * different consent question than "we both like board games", and the dating
 * surface already handles kink overlap behind its own opt-in.
 *
 * `sober` is the one deliberate inclusion from Substances & Harm Reduction: it
 * describes how someone wants to socialise, and sober queer social life is a
 * thing people actively seek out rather than something inferred about them.
 *
 * EVERY SLUG HERE EXISTS IN `unified_tags` and was verified non-sensitive at
 * the time of writing. Six obvious candidates were dropped for not existing
 * rather than invented: cooking, crafts, cycling, outdoors, running,
 * volunteering. The picker resolves slugs at runtime and silently drops any
 * that no longer resolve, so a rename degrades to a shorter list, never a chip
 * that cannot be followed.
 */

export interface InterestGroup {
  /** Display heading. */
  label: string;
  /** `unified_tags.slug` values — resolved to ids at runtime. */
  slugs: readonly string[];
}

export const INTEREST_GROUPS: readonly InterestGroup[] = [
  {
    label: 'Going out',
    slugs: ['nightlife', 'dancing', 'live-music', 'drag', 'karaoke', 'comedy'],
  },
  {
    label: 'Quieter',
    slugs: ['coffee', 'brunch', 'dining', 'books', 'board-games', 'sober'],
  },
  {
    label: 'Culture',
    slugs: ['art', 'film', 'cinema', 'theatre', 'music', 'museums', 'photography'],
  },
  {
    label: 'Active',
    slugs: ['hiking', 'swimming', 'yoga', 'fitness', 'sports'],
  },
  {
    label: 'Out in the world',
    slugs: ['travel', 'gaming', 'activism'],
  },
];

/** Flat slug list, in display order. */
export const INTEREST_SLUGS: readonly string[] = INTEREST_GROUPS.flatMap((g) => g.slugs);
