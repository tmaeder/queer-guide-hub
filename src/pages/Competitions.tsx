import { Suspense, lazy, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';

import { PageContainer } from '@/components/layout/PageContainer';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Button } from '@/components/ui/button';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useMeta } from '@/hooks/useMeta';
import {
  useCompetitionGrid,
  useCompetitionOverview,
  useCompetitionRoster,
} from '@/hooks/useCompetitions';
import { CompetitionSeasonTable } from '@/components/competitions/CompetitionSeasonTable';
import { CompetitionRoster } from '@/components/competitions/CompetitionRoster';
import { CompetitionGrid } from '@/components/competitions/CompetitionGrid';
import { CompetitionCharts } from '@/components/competitions/CompetitionCharts';

/**
 * MUST stay lazy. `scripts/check-bundle-shape.mjs` treats the `maplibre-` chunk
 * as HEAVY_UNREACHABLE — it may not be statically reachable from the entry, and
 * a plain import here would fail the build. Same reason `/personalities` lazies
 * its map.
 */
const CompetitionMap = lazy(() => import('@/components/competitions/CompetitionMap'));

/**
 * /competitions — the Drag Race franchises and the titleholder pageant circuit,
 * as one browsable dataset.
 *
 * FOUR VIEWS OVER ONE FETCH
 *
 * The overview and the roster are fetched whole (22 competitions / 88 editions /
 * ~1,019 entrants) and filtered client-side, which is the house strategy for a
 * data-dense public page here — `/tags/interactions` and `cities_directory()`
 * both do it, and 1,019 rows is well inside the proven ceiling. Only the grid is
 * per-edition, because 7,377 cells at once is a payload nobody scrolls.
 *
 * WHY THE VIEW IS A QUERY PARAM AND NOT A PATH SEGMENT
 *
 * `/competitions/:view` would tie with `/:locale/<X>` in the route table and
 * resolve into LocaleRouter's unknown-locale → NotFound branch (documented at
 * src/routes.tsx:633-748). `?view=` is unambiguous and keeps the view
 * linkable.
 */

type View = 'seasons' | 'roster' | 'grid' | 'charts';

const VIEWS: { id: View; labelKey: string; fallback: string }[] = [
  { id: 'seasons', labelKey: 'competitions.viewSeasons', fallback: 'Seasons & editions' },
  { id: 'roster', labelKey: 'competitions.viewRoster', fallback: 'Everyone who competed' },
  { id: 'grid', labelKey: 'competitions.viewGrid', fallback: 'Placement grid' },
  { id: 'charts', labelKey: 'competitions.viewCharts', fallback: 'Numbers' },
];

function isView(value: string | null): value is View {
  return !!value && VIEWS.some((v) => v.id === value);
}

export default function Competitions() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();

  const view: View = isView(params.get('view')) ? (params.get('view') as View) : 'seasons';
  const editionParam = params.get('edition') ?? undefined;

  const overview = useCompetitionOverview();
  const roster = useCompetitionRoster();

  // Memoised because the `?? []` fallback allocates a fresh array on every
  // render, which would invalidate every downstream useMemo that depends on it.
  const competitions = useMemo(
    () => overview.data?.competitions ?? [],
    [overview.data?.competitions],
  );

  // Default the grid to the most recent edition that actually has results —
  // an edition with an empty grid is a confusing first impression.
  const defaultEdition = useMemo(() => {
    const withResults = competitions
      .flatMap((c) => c.editions.map((e) => ({ ...e, competition: c.name })))
      .filter((e) => e.results > 0)
      .sort((a, b) => (b.first_aired ?? '').localeCompare(a.first_aired ?? ''));
    return withResults[0]?.slug;
  }, [competitions]);

  const editionSlug = editionParam ?? defaultEdition;
  const grid = useCompetitionGrid(view === 'grid' ? editionSlug : undefined);

  useMeta({
    title: t('competitions.metaTitle', 'Drag Race seasons, pageants and every queen who competed'),
    description: t(
      'competitions.metaDescription',
      'Every season of the Drag Race franchises and the LGBTQ+ titleholder pageant circuit: winners, runners-up, Miss Congeniality, and an episode-by-episode placement grid.',
    ),
    canonicalPath: '/competitions',
  });

  const setView = (next: View) => {
    const p = new URLSearchParams(params);
    p.set('view', next);
    setParams(p, { replace: true });
  };

  const setEdition = (slug: string) => {
    const p = new URLSearchParams(params);
    p.set('view', 'grid');
    p.set('edition', slug);
    setParams(p, { replace: true });
  };

  const loading = overview.isLoading || roster.isLoading;
  const failed = overview.isError || roster.isError;

  const totals = useMemo(() => {
    const editions = competitions.reduce((a, c) => a + c.editions.length, 0);
    const entrants = roster.data?.length ?? 0;
    const linked = (roster.data ?? []).filter((r) => r.personality_slug).length;
    return { competitions: competitions.length, editions, entrants, linked };
  }, [competitions, roster.data]);

  return (
    <PageContainer>
      <Eyebrow>{t('competitions.eyebrow', 'Drag Race & the pageant circuit')}</Eyebrow>
      <h1 className="text-display font-display">
        {t('competitions.title', 'Every season, every queen, every placement')}
      </h1>
      <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
        {t(
          'competitions.intro',
          'The Drag Race television franchises and the LGBTQ+ titleholder pageants, in one place. Season tables, the full roster, and the episode-by-episode grid.',
        )}
      </p>

      {!loading && !failed && (
        <p className="mt-2 text-13 text-muted-foreground tabular-nums">
          {t('competitions.totals', {
            defaultValue:
              '{{competitions}} competitions · {{editions}} editions · {{entrants}} entries · {{linked}} linked to a profile',
            ...totals,
          })}
        </p>
      )}

      <nav
        aria-label={t('competitions.viewNav', 'Choose a view')}
        className="mt-8 flex flex-wrap gap-2"
      >
        {VIEWS.map((v) => (
          <Button
            key={v.id}
            variant={view === v.id ? 'default' : 'outline'}
            size="sm"
            aria-current={view === v.id ? 'page' : undefined}
            onClick={() => setView(v.id)}
          >
            {t(v.labelKey, v.fallback)}
          </Button>
        ))}
      </nav>

      {loading && (
        <div className="mt-12 flex justify-center">
          <TrackLoader />
        </div>
      )}

      {failed && (
        <p className="mt-12 text-body-lg">
          {t('competitions.loadFailed', 'This data could not be loaded right now.')}
        </p>
      )}

      {!loading && !failed && (
        <div className="mt-8">
          {view === 'seasons' && <CompetitionSeasonTable competitions={competitions} />}
          {view === 'roster' && <CompetitionRoster entries={roster.data ?? []} />}
          {view === 'grid' && (
            <GridView
              competitions={competitions}
              editionSlug={editionSlug}
              onSelect={setEdition}
              grid={grid.data ?? null}
              loading={grid.isLoading}
            />
          )}
          {view === 'charts' && (
            <>
              <CompetitionCharts competitions={competitions} entries={roster.data ?? []} />
              <Suspense fallback={<div className="mt-8 h-[600px] w-full animate-pulse bg-muted" />}>
                <CompetitionMap entries={roster.data ?? []} />
              </Suspense>
            </>
          )}
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

function GridView({
  competitions,
  editionSlug,
  onSelect,
  grid,
  loading,
}: {
  competitions: import('@/types/competition').Competition[];
  editionSlug: string | undefined;
  onSelect: (slug: string) => void;
  grid: import('@/types/competition').CompetitionGrid | null;
  loading: boolean;
}) {
  const { t } = useTranslation();

  // Only editions that actually have a grid are offered. A pageant is decided in
  // one night and has no episodes at all, so listing it here would be an
  // invitation to an empty table.
  const options = useMemo(
    () =>
      competitions
        .flatMap((c) => c.editions.map((e) => ({ ...e, competition: c.name })))
        .filter((e) => e.results > 0)
        .sort(
          (a, b) => a.competition.localeCompare(b.competition) || (a.number ?? 0) - (b.number ?? 0),
        ),
    [competitions],
  );

  return (
    <div>
      <label className="block text-13 font-medium" htmlFor="competition-edition">
        {t('competitions.pickSeason', 'Season')}
      </label>
      <select
        id="competition-edition"
        className="mt-2 w-full max-w-form rounded-element border border-input bg-card px-4 py-2 text-15"
        value={editionSlug ?? ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.competition} — {o.title}
          </option>
        ))}
      </select>

      {loading && (
        <div className="mt-8 flex justify-center">
          <TrackLoader />
        </div>
      )}
      {!loading && grid && <CompetitionGrid grid={grid} />}
      {!loading && !grid && (
        <p className="mt-8 text-body-lg">
          {t('competitions.noGrid', 'No placement grid is recorded for this season.')}
        </p>
      )}
    </div>
  );
}
