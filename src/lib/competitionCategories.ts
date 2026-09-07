/**
 * The six comparable types, and the ONE place their routes, labels and blurbs
 * are defined.
 *
 * WHY THESE ARE SEPARATE PAGES
 *
 * `/competitions` used to list all 45 in one sortable table. Miss Gay America,
 * International Mr. Leather and Drag Race UK are not comparable: a
 * female-impersonation pageant, a leather title attached to a multi-day
 * convention, and a licensed television format with an episode grid. Sorting
 * them together by "entrants" or "first aired" produces a ranking that means
 * nothing, and one filter list implies a peer relationship that does not exist.
 * Comparison is only meaningful WITHIN a type, so each type gets its page.
 *
 * ROUTES ARE STATIC TWO-SEGMENT PATHS, NEVER `/competitions/:category`.
 * A param in the second position ties with `/:locale/<X>` and resolves into
 * LocaleRouter's unknown-locale -> NotFound branch (src/routes.tsx). Each slug
 * below is registered as its own literal Route.
 */

export type CompetitionCategory =
  'drag_series' | 'drag_pageant' | 'trans_pageant' | 'gay_title' | 'leather_title' | 'drag_king';

export interface CategoryDef {
  id: CompetitionCategory;
  /** Second path segment. Static — see the header. */
  slug: string;
  labelKey: string;
  label: string;
  blurbKey: string;
  blurb: string;
  /** Meta title/description for routeMeta.ts, kept next to the copy it mirrors. */
  metaTitle: string;
  metaDescription: string;
  /**
   * Whether editions in this type carry an episode grid. Drives whether the
   * page offers the grid view at all — a title contest decided in one night
   * has no episodes, and offering an empty grid is an invitation to a dead end.
   */
  hasGrid: boolean;
}

export const COMPETITION_CATEGORIES: readonly CategoryDef[] = [
  {
    id: 'drag_series',
    slug: 'drag-series',
    labelKey: 'competitions.category.dragSeries',
    label: 'Drag competition series',
    blurbKey: 'competitions.category.dragSeriesBlurb',
    blurb:
      'Episodic television: the Drag Race franchises alongside independent shows like Dragula, La Más Draga and Drag Den. Each season carries an episode-by-episode placement grid.',
    metaTitle: 'Drag Competition Series: Every Season | Queer Guide',
    metaDescription:
      'Every season of the Drag Race franchises and the independent drag competition series, with winners, runners-up and an episode-by-episode placement grid.',
    hasGrid: true,
  },
  {
    id: 'drag_king',
    slug: 'drag-kings',
    labelKey: 'competitions.category.dragKing',
    label: 'Drag king competitions',
    blurbKey: 'competitions.category.dragKingBlurb',
    blurb:
      'Competitions for drag kings. King of Drag is a television series and sits here rather than with the other series, because filed among the queen franchises it would be one row in thirty-three.',
    metaTitle: 'Drag King Competitions | Queer Guide',
    metaDescription:
      'Drag king competitions: King of Drag and the San Francisco Drag King Contest, which has run since 1994.',
    hasGrid: true,
  },
  {
    id: 'drag_pageant',
    slug: 'drag-pageants',
    labelKey: 'competitions.category.dragPageant',
    label: 'Drag pageantry',
    blurbKey: 'competitions.category.dragPageantBlurb',
    blurb:
      'Drag pageantry systems, decided at a single event rather than across a season. Miss Gay America has run since 1973 and Miss Continental since 1980, both older than the television.',
    metaTitle: 'Drag Pageantry: Miss Gay America and Miss Continental | Queer Guide',
    metaDescription:
      'Drag pageantry systems: Miss Gay America since 1973 and Miss Continental since 1980, with every titleholder by year.',
    hasGrid: false,
  },
  {
    id: 'trans_pageant',
    slug: 'trans-pageants',
    labelKey: 'competitions.category.transPageant',
    label: 'Transgender pageants',
    blurbKey: 'competitions.category.transPageantBlurb',
    blurb:
      'Beauty pageants for transgender women, including Miss International Queen, which describes itself as the world’s largest, and Miss T World.',
    metaTitle: 'Transgender Beauty Pageants | Queer Guide',
    metaDescription:
      'Transgender beauty pageants: Miss International Queen, Miss T World, Miss Star International and Miss Fabulous Thailand, with every titleholder by year.',
    hasGrid: false,
  },
  {
    id: 'gay_title',
    slug: 'gay-titles',
    labelKey: 'competitions.category.gayTitle',
    label: 'Gay titleholder contests',
    blurbKey: 'competitions.category.gayTitleBlurb',
    blurb:
      'Titleholder contests for gay men. Mr Gay World is an international final; Mr Gay Europe describes itself as a competition about LGBTQIA+ themes rather than a pageant.',
    metaTitle: 'Gay Titleholder Contests: Mr Gay World and Mr Gay Europe | Queer Guide',
    metaDescription:
      'Gay titleholder contests: Mr Gay World, Mr Gay Europe and Mr. Gay India, with every titleholder by year.',
    hasGrid: false,
  },
  {
    id: 'leather_title',
    slug: 'leather-titles',
    labelKey: 'competitions.category.leatherTitle',
    label: 'Leather & fetish titles',
    blurbKey: 'competitions.category.leatherTitleBlurb',
    blurb:
      'Leather and fetish title contests, both run as multi-day conventions. International Mr. Leather has been held since 1979 and calls itself a convention and competition, not a pageant.',
    metaTitle: 'Leather and Fetish Titles: IML and MIR | Queer Guide',
    metaDescription:
      'Leather and fetish title contests: International Mr. Leather since 1979 and Mister International Rubber, with every titleholder by year.',
    hasGrid: false,
  },
];

export function categoryBySlug(slug: string): CategoryDef | undefined {
  return COMPETITION_CATEGORIES.find((c) => c.slug === slug);
}

export function categoryById(id: string): CategoryDef | undefined {
  return COMPETITION_CATEGORIES.find((c) => c.id === id);
}

/** Path for a category page. Kept here so no caller hand-builds one. */
export function categoryPath(c: CategoryDef): string {
  return `/competitions/${c.slug}`;
}
