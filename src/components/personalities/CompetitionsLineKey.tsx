import { useTranslation } from 'react-i18next';

import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import {
  useCompetedInOptions,
  useCompetitionCategoryCounts,
  useCompetitionCategoryPeople,
} from '@/hooks/useCompetitions';
import { useReferenceTaxonomy } from '@/hooks/useReferenceTaxonomy';
import { COMPETITION_CATEGORIES, categoryPath } from '@/lib/competitionCategories';
import { topCompetitionsForCategory } from '@/lib/competedInFilter';
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
 * EACH ROW ALSO NAMES ITS COMPETITIONS: the three with the most linked people,
 * each linking to `/personalities?competed=<slug>`, then "+N more" to the
 * type's page.
 *
 * EACH ROW'S HEADER IS TWO LINKS: the type's page, and `/personalities?competed=<type>`
 * — the directory filtered to the people who competed in it. For a type with
 * no linked public personality (drag kings today) the row still shows, and the
 * second cell reads "People 0" as plain text instead of linking to an empty
 * grid.
 *
 * Counts come from `useCompetitionCategoryCounts`, the same hook the hub uses,
 * so this block and the page it opens cannot disagree. "Counting" means
 * loading and nothing else; a loaded category with no rows says zero.
 */
/** Competitions named per row. Drag series links 31 today; naming all of them
 *  would make one tile tower over the five beside it. */
const COMPETITIONS_PER_ROW = 3;

export function CompetitionsLineKey() {
  useReferenceTaxonomy('competition_category');
  const { t, i18n } = useTranslation();
  const { counts, isLoading, isError } = useCompetitionCategoryCounts();
  const { data: people } = useCompetitionCategoryPeople();
  // Shared cache with the "Competed in" select: one request for both.
  const { data: competitionOptions = [] } = useCompetedInOptions();
  const filterPath = (competed_in: string) =>
    `/personalities?${serializeFilters({ competed_in }).toString()}`;

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
      {/* ONE plate, six ruled rows — a line key, not six cards. Each row reads
          left to right: the type (its own page), the competitions inside it
          (the directory filtered to each), then the people count (the
          directory filtered to the whole type). */}
      <ul className="m-0 list-none divide-y divide-border-hairline overflow-hidden rounded-container bg-card p-0 shadow-soft">
        {COMPETITION_CATEGORIES.map((c) => {
          const count = counts.get(c.id);
          const peopleCount = people?.get(c.id) ?? 0;
          const { shown, more } = topCompetitionsForCategory(
            competitionOptions,
            c.id,
            COMPETITIONS_PER_ROW,
            i18n.language,
          );
          return (
            <li
              key={c.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto]"
            >
              {/* Two sibling links, never one nested in the other (axe
                nested-interactive): the type's own page, and the directory
                filtered to the people who competed in it. */}
              <LocalizedLink
                to={categoryPath(c)}
                className="-mx-2 flex min-w-0 items-center gap-2 rounded-element px-2 py-1 no-underline transition-colors hover:bg-surface-container"
              >
                <RouteBullet
                  type={c.id}
                  icon={c.icon}
                  track={c.bullet.track}
                  size={24}
                  decorative
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-13 font-bold leading-tight">
                    {t(c.labelKey, c.label)}
                  </span>
                  {!isError && (
                    <span className="block truncate text-2xs tabular-nums text-muted-foreground">
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
              {people != null && peopleCount === 0 ? (
                // role="img": aria-label is not permitted on a role-less span
                // (axe aria-prohibited-attr). The cell is one labelled item
                // whose visible parts are aria-hidden, which is what img says.
                <span
                  role="img"
                  className="col-start-2 row-start-1 shrink-0 text-right text-13 text-muted-foreground md:col-start-3"
                  aria-label={t('pages.personalities.competitions.peopleNone', {
                    defaultValue: 'No linked people yet in: {{type}}',
                    type: t(c.labelKey, c.label),
                  })}
                >
                  <span aria-hidden className="tabular-nums">
                    {(0).toLocaleString()}
                  </span>{' '}
                  <span aria-hidden>{t('pages.personalities.competitions.people', 'People')}</span>
                </span>
              ) : (
                // No aria-label: an override that omits the visible "423
                // People" fails WCAG 2.5.3 (axe label-content-name-mismatch).
                // The type is appended for screen readers instead.
                <LocalizedLink
                  to={filterPath(c.id)}
                  className="col-start-2 row-start-1 inline-flex shrink-0 items-center gap-1 justify-self-end rounded-badge text-13 font-bold no-underline hover:underline md:col-start-3"
                >
                  {people != null && (
                    <span className="tabular-nums">{peopleCount.toLocaleString()}</span>
                  )}
                  <span className="font-normal text-muted-foreground">
                    {t('pages.personalities.competitions.people', 'People')}
                  </span>
                  <span aria-hidden>→</span>
                  <span className="sr-only">, {t(c.labelKey, c.label)}</span>
                </LocalizedLink>
              )}
              {/*
               * The competitions inside this type, each linking to the
               * directory filtered to that one competition. Only competitions
               * with linked people are offered, so none is a dead end.
               * `rounded-badge` is load-bearing: index.css gives every <a> a
               * 44px min-height, and `a.rounded-badge` is the sanctioned 24px
               * floor for compact inline links (WCAG 2.5.8 AA).
               */}
              {shown.length > 0 && (
                <ul className="col-span-2 m-0 flex min-w-0 list-none flex-wrap gap-1.5 p-0 pl-8 md:col-span-1 md:col-start-2 md:row-start-1 md:pl-0">
                  {shown.map((o) => (
                    <li key={o.slug} className="min-w-0">
                      <LocalizedLink
                        to={filterPath(o.slug)}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-badge bg-muted px-2 py-1 text-13 no-underline hover:bg-foreground hover:text-background"
                      >
                        <span className="truncate">{o.name}</span>
                        <span className="shrink-0 text-2xs tabular-nums opacity-70">
                          {o.people.toLocaleString()}
                        </span>
                      </LocalizedLink>
                    </li>
                  ))}
                  {more > 0 && (
                    <li>
                      <LocalizedLink
                        to={categoryPath(c)}
                        className="inline-flex items-center rounded-badge px-2 py-1 text-13 font-bold no-underline hover:underline"
                      >
                        {t('pages.personalities.competitions.more', {
                          defaultValue: '+{{count}} more',
                          count: more,
                        })}
                      </LocalizedLink>
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
