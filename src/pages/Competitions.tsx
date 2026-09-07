import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { useCompetitionOverview } from '@/hooks/useCompetitions';
import { useMeta } from '@/hooks/useMeta';
import {
  COMPETITION_CATEGORIES,
  categoryPath,
  type CompetitionCategory,
} from '@/lib/competitionCategories';

/**
 * /competitions — the hub, and nothing else.
 *
 * WHY THERE IS NO TABLE HERE ANY MORE
 *
 * This page used to list all 45 competitions in one sortable table. Miss Gay
 * America, International Mr. Leather and Drag Race UK are not peers: a
 * female-impersonation pageant, a leather title attached to a multi-day
 * convention, and a licensed television format with an episode grid. Sorting
 * them together by "entrants" or "first aired" produces a ranking that means
 * nothing, and a single filter list asserts a peer relationship that does not
 * exist. Comparison is only meaningful WITHIN a type, so the tables moved to
 * the six category pages and this page routes to them.
 *
 * THE COUNTS ARE LIVE, NEVER LITERALS. A hardcoded "22 competitions" is wrong
 * the first time an edition is imported and says nothing when it is. Both
 * figures are derived from the same overview fetch the category pages use, so
 * the card and the page it opens can never disagree.
 */

interface CategoryCount {
  competitions: number;
  editions: number;
}

export default function Competitions() {
  const { t } = useTranslation();
  const overview = useCompetitionOverview();

  useMeta({
    title: t(
      'competitions.metaTitle',
      'Drag competitions, pageants and title contests | Queer Guide',
    ),
    description: t(
      'competitions.metaDescription',
      'The drag competition series, the drag and transgender pageant systems, and the gay and leather title contests. Six types, each with every edition and everyone who competed.',
    ),
    canonicalPath: '/competitions',
  });

  const counts = useMemo(() => {
    const byCategory = new Map<CompetitionCategory, CategoryCount>();
    for (const c of overview.data?.competitions ?? []) {
      const current = byCategory.get(c.category) ?? { competitions: 0, editions: 0 };
      current.competitions += 1;
      current.editions += c.editions.length;
      byCategory.set(c.category, current);
    }
    return byCategory;
  }, [overview.data?.competitions]);

  const loading = overview.isLoading;
  const failed = overview.isError;

  return (
    <PageContainer>
      <Eyebrow>{t('competitions.eyebrow', 'Competitions')}</Eyebrow>
      <h1 className="text-display font-display">
        {t('competitions.title', 'Six kinds of competition, six sets of records')}
      </h1>
      <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
        {t(
          'competitions.intro',
          'Television series run as episodes and carry a placement grid. A pageant is decided in one night. A leather title is awarded at a convention. Each type keeps its own page, because a table that ranks them against each other answers no question anyone has.',
        )}
      </p>

      {failed && (
        <p className="mt-12 text-body-lg">
          {t('competitions.loadFailed', 'This data could not be loaded right now.')}
        </p>
      )}

      <ul className="mt-10 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
        {COMPETITION_CATEGORIES.map((c) => {
          const count = counts.get(c.id);
          return (
            <li key={c.id}>
              <LocalizedLink
                to={categoryPath(c)}
                className="card-lift flex h-full flex-col rounded-container bg-card p-6 no-underline shadow-soft"
              >
                <span className="text-title font-bold leading-tight text-balance">
                  {t(c.labelKey, c.label)}
                </span>
                <span className="mt-2 text-15 text-muted-foreground">{t(c.blurbKey, c.blurb)}</span>
                <span className="mt-4 text-2xs uppercase tracking-label tabular-nums text-muted-foreground">
                  {/*
                   * "Counting" means LOADING and nothing else. A loaded-but-empty
                   * category must say zero: if the frontend ever ships ahead of the
                   * migration that adds `category`, every row groups under undefined
                   * and all six cards would otherwise sit at "Counting" forever,
                   * which reads as a slow page rather than as missing data.
                   */}
                  {loading
                    ? t('competitions.hubCountsPending', 'Counting')
                    : t('competitions.hubCounts', {
                        defaultValue: '{{competitions}} competitions, {{editions}} editions',
                        competitions: count?.competitions ?? 0,
                        editions: count?.editions ?? 0,
                      })}
                </span>
              </LocalizedLink>
            </li>
          );
        })}
      </ul>

      {loading && (
        <div className="mt-12 flex justify-center">
          <TrackLoader />
        </div>
      )}

      <p className="mt-16 text-13 text-muted-foreground">
        {t(
          'competitions.credit',
          'Season, contestant and placement data from Wikipedia, published under CC BY-SA.',
        )}
      </p>
    </PageContainer>
  );
}
