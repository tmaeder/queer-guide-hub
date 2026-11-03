import { useTranslation } from 'react-i18next';

import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { useCompetitionCategoryCounts } from '@/hooks/useCompetitions';
import { useReferenceTaxonomy } from '@/hooks/useReferenceTaxonomy';
import { COMPETITION_CATEGORIES, categoryPath } from '@/lib/competitionCategories';

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
 * Counts come from `useCompetitionCategoryCounts`, the same hook the hub uses,
 * so this block and the page it opens cannot disagree. "Counting" means
 * loading and nothing else; a loaded category with no rows says zero.
 */
export function CompetitionsLineKey() {
  useReferenceTaxonomy('competition_category');
  const { t } = useTranslation();
  const { counts, isLoading, isError } = useCompetitionCategoryCounts();

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
            <li key={c.id}>
              <LocalizedLink
                to={categoryPath(c)}
                className="flex h-full items-center gap-4 rounded-element bg-card px-4 py-2 no-underline shadow-soft transition-colors hover:bg-surface-container"
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}
