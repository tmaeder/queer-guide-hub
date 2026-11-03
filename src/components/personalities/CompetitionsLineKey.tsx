import { useTranslation } from 'react-i18next';

import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import {
  useCompetitionCategoryCounts,
  useCompetitionCategoryPeople,
} from '@/hooks/useCompetitions';
import { useReferenceTaxonomy } from '@/hooks/useReferenceTaxonomy';
import { COMPETITION_CATEGORIES, categoryPath } from '@/lib/competitionCategories';
import { serializeFilters } from '@/lib/personalitiesFilters';

/**
 * The six competition types, as a compact line key on /personalities.
 *
 * WHY IT LIVES HERE. Competitions are records about people: every entrant whose
 * personality row is public links straight to it, and the personality page
 * already carries a competition-history panel. But the directory never said
 * the competitions existed, so the 2,000-odd people who reached it through a
 * season roster had no way back the other direction. This block is that way
 * back — a station on the people line that interchanges onto six others.
 *
 * WHY SIX ROUTES, NOT ONE TABLE. The six types are deliberately not peers (see
 * src/lib/competitionCategories.ts): a television season, a one-night pageant
 * and a leather title at a convention answer different questions. So this
 * routes to each type's page and never ranks them against each other.
 *
 * MULTIPLE TRACKS IN ONE COMPONENT is the documented line-key exception, the
 * same one the /competitions hub and `LineKey` on the map rely on: a key that
 * names the lines has to show them. The letter and the label carry identity
 * (WCAG 1.4.1); the colour only separates neighbours.
 *
 * NO TransitIcon, on purpose. This page's chrome is lucide (the era and field
 * headings, the view tabs) and a surface never mixes the two icon sets; the
 * route bullet is a transit MARK, not a glyph, so it is the only transit
 * element drawn here.
 *
 * EACH ROW IS TWO LINKS: the type's page, and `/personalities?competed=<type>`
 * — the directory filtered to the people who competed in it. The second is
 * hidden for a type with no linked public personality (drag kings today).
 *
 * Counts come from `useCompetitionCategoryCounts`, the same hook the hub uses,
 * so this block and the page it opens cannot disagree. "Counting" means
 * loading and nothing else; a loaded category with no rows says zero.
 */
export function CompetitionsLineKey() {
  useReferenceTaxonomy('competition_category');
  const { t } = useTranslation();
  const { counts, isLoading, isError } = useCompetitionCategoryCounts();
  const { data: people } = useCompetitionCategoryPeople();

  // A failed fetch hides the counts, never the routes: the six pages work on
  // their own, and a navigation block that vanishes on a slow API reads as
  // "there are no competitions".
  return (
    <section className="mb-8" aria-labelledby="personalities-competitions-heading">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="personalities-competitions-heading"
          className="text-2xs font-bold uppercase tracking-label text-muted-foreground"
        >
          {t('pages.personalities.competitions.heading', 'Competitions & titleholders')}
        </h2>
        <LocalizedLink
          to="/competitions"
          className="text-13 font-bold text-muted-foreground no-underline hover:text-foreground"
        >
          {t('pages.personalities.competitions.all', 'All competitions →')}
        </LocalizedLink>
      </div>
      <p className="mb-4 max-w-reading text-13 text-muted-foreground">
        {t(
          'pages.personalities.competitions.lede',
          'Drag series, pageants and title contests, each with every edition and everyone who competed. Entrants link back to their entries here.',
        )}
      </p>
      <ul className="grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {COMPETITION_CATEGORIES.map((c) => {
          const count = counts.get(c.id);
          return (
            <li
              key={c.id}
              className="flex h-full items-stretch overflow-hidden rounded-element bg-card shadow-soft"
            >
              {/* Two sibling links, never one nested in the other (axe
                  nested-interactive): the type's own page, and the directory
                  filtered to the people who competed in it. */}
              <LocalizedLink
                to={categoryPath(c)}
                className="flex min-w-0 flex-1 items-center gap-4 px-4 py-2 no-underline transition-colors hover:bg-surface-container"
              >
                <RouteBullet
                  type={c.id}
                  letter={c.bullet.letter}
                  track={c.bullet.track}
                  size={30}
                  decorative
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-13 font-bold">{t(c.labelKey, c.label)}</span>
                  {!isError && (
                    <span className="block text-2xs tabular-nums text-muted-foreground">
                      {isLoading
                        ? t('competitions.hubCountsPending', 'Counting')
                        : [
                            t('competitions.hubCountCompetitions', {
                              count: count?.competitions ?? 0,
                            }),
                            t('competitions.hubCountEditions', { count: count?.editions ?? 0 }),
                          ].join(', ')}
                    </span>
                  )}
                </span>
              </LocalizedLink>
              {/*
               * Hidden only when the counts loaded AND say nobody is linked: a
               * link to an empty grid is a dead end. While the counts are
               * loading or unavailable the link stays, because the filter works
               * without them.
               */}
              {(people == null || (people.get(c.id) ?? 0) > 0) && (
                <LocalizedLink
                  to={`/personalities?${serializeFilters({ competed_in: c.id }).toString()}`}
                  aria-label={t('pages.personalities.competitions.peopleIn', {
                    defaultValue: 'People who competed in: {{type}}',
                    type: t(c.labelKey, c.label),
                  })}
                  className="flex shrink-0 flex-col items-end justify-center border-l border-border-hairline px-4 py-2 text-right no-underline transition-colors hover:bg-surface-container"
                >
                  <span className="text-13 font-bold">
                    {t('pages.personalities.competitions.people', 'People')}
                  </span>
                  {people != null && (
                    <span className="text-2xs tabular-nums text-muted-foreground">
                      {(people.get(c.id) ?? 0).toLocaleString()}
                    </span>
                  )}
                </LocalizedLink>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
