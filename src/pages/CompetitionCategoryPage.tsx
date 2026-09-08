import { Suspense, lazy, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';

import { CompetitionCharts } from '@/components/competitions/CompetitionCharts';
import { CompetitionGrid } from '@/components/competitions/CompetitionGrid';
import { CompetitionRoster } from '@/components/competitions/CompetitionRoster';
import { CompetitionSeasonTable } from '@/components/competitions/CompetitionSeasonTable';
import { CompetitionWinnersRail } from '@/components/competitions/CompetitionWinnersRail';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { DetailMasthead } from '@/components/transit/DetailMasthead';
import { StationRing } from '@/components/transit/StationRing';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { Track } from '@/components/transit/routeBulletMap';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { Button } from '@/components/ui/button';
import {
  useCompetitionGrid,
  useCompetitionOverview,
  useCompetitionRoster,
} from '@/hooks/useCompetitions';
import { useMeta } from '@/hooks/useMeta';
import { categoryById, categoryPath, type CompetitionCategory } from '@/lib/competitionCategories';
import type { Competition, CompetitionGrid as CompetitionGridData } from '@/types/competition';

/**
 * MUST stay lazy. `scripts/check-bundle-shape.mjs` treats the `maplibre-` chunk
 * as HEAVY_UNREACHABLE — it may not be statically reachable from the entry, and
 * a plain import here would fail the build. Same reason `/personalities` lazies
 * its map.
 */
const CompetitionMap = lazy(() => import('@/components/competitions/CompetitionMap'));

/**
 * One of the six competition types, with every edition and everyone who
 * competed in it.
 *
 * ONE FETCH, FILTERED CLIENT-SIDE. The overview and the roster are fetched
 * whole and narrowed to this category here, which is the house strategy for a
 * data-dense public page (`/tags/interactions` and `cities_directory()` both do
 * it) and means moving between the six pages costs no request at all. Only the
 * grid is per-edition, because a season's cells are a payload nobody scrolls
 * twice.
 *
 * THE GRID VIEW IS NOT OFFERED WHERE THERE ARE NO EPISODES. A pageant is
 * decided at a single event, so `hasGrid` is false for four of the six types
 * and the tab is absent rather than present-and-empty. A `?view=grid` link
 * carried over from another page falls back to the seasons view instead of
 * rendering a dead end.
 *
 * WHY THE VIEW IS A QUERY PARAM AND NOT A PATH SEGMENT
 *
 * `/competitions/<slug>/:view` would put a param where LocaleRouter expects a
 * locale and resolve into its unknown-locale -> NotFound branch (documented at
 * src/routes.tsx). `?view=` is unambiguous and keeps every view linkable.
 */

type View = 'seasons' | 'roster' | 'grid' | 'charts';

const VIEWS: { id: View; labelKey: string; fallback: string }[] = [
  { id: 'seasons', labelKey: 'competitions.viewSeasons', fallback: 'Seasons & editions' },
  { id: 'roster', labelKey: 'competitions.viewRoster', fallback: 'Everyone who competed' },
  { id: 'grid', labelKey: 'competitions.viewGrid', fallback: 'Placement grid' },
  { id: 'charts', labelKey: 'competitions.viewCharts', fallback: 'Numbers' },
];

export default function CompetitionCategoryPage({ category }: { category: CompetitionCategory }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();

  const def = categoryById(category);
  const hasGrid = def?.hasGrid ?? false;

  // Not memoised: four entries, and nothing downstream depends on its identity.
  // Wrapping it in useMemo made the React Compiler bail on the whole component.
  const views = VIEWS.filter((v) => v.id !== 'grid' || hasGrid);

  const requested = params.get('view');
  const view: View = views.some((v) => v.id === requested) ? (requested as View) : 'seasons';
  const editionParam = params.get('edition') ?? undefined;

  const overview = useCompetitionOverview();
  const roster = useCompetitionRoster();

  // Memoised because a fresh array on every render would invalidate every
  // downstream useMemo that depends on it.
  const competitions = useMemo(
    () => (overview.data?.competitions ?? []).filter((c) => c.category === category),
    [overview.data?.competitions, category],
  );

  const entries = useMemo(
    () => (roster.data ?? []).filter((r) => r.category === category),
    [roster.data, category],
  );

  // Default the grid to the most recent edition that actually has results. An
  // edition with an empty grid is a confusing first impression.
  const defaultEdition = useMemo(() => {
    const withResults = competitions
      .flatMap((c) => c.editions)
      .filter((e) => e.results > 0)
      .sort((a, b) => (b.first_aired ?? '').localeCompare(a.first_aired ?? ''));
    return withResults[0]?.slug;
  }, [competitions]);

  const editionSlug = editionParam ?? defaultEdition;
  const grid = useCompetitionGrid(view === 'grid' ? editionSlug : undefined);

  useMeta({
    title: t(`${def?.labelKey ?? 'competitions.category'}MetaTitle`, def?.metaTitle ?? ''),
    description: t(
      `${def?.labelKey ?? 'competitions.category'}MetaDescription`,
      def?.metaDescription ?? '',
    ),
    canonicalPath: def ? categoryPath(def) : '/competitions',
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
    const linked = entries.filter((r) => r.personality_slug).length;
    return { competitions: competitions.length, editions, entrants: entries.length, linked };
  }, [competitions, entries]);

  return (
    <PageContainer>
      <LocalizedLink to="/competitions" className="text-13 no-underline hover:underline">
        {t('competitions.backToHub', 'Back to all competitions')}
      </LocalizedLink>

      {/*
       * ONE ACCENT PER PAGE. The hub is the legend and carries all six lines;
       * a category page is a single line, so its bullet, its stat stations and
       * nothing else take `def.bullet.track`. The glyph beside the eyebrow is a
       * `TransitIcon`, which is ink on paper and never takes a track colour.
       */}
      <DetailMasthead
        className="mt-6"
        type={def?.id ?? 'competition'}
        letter={def?.bullet.letter}
        track={def?.bullet.track}
        bulletLabel={def ? t(def.labelKey, def.label) : undefined}
        eyebrow={t('competitions.eyebrow', 'Competitions')}
        title={def ? t(def.labelKey, def.label) : t('competitions.title', 'Competitions')}
        lead={def ? t(def.blurbKey, def.blurb) : undefined}
      />

      {!loading && !failed && def && (
        <StatStations track={def.bullet.track} icon={def.icon} totals={totals} />
      )}

      {/*
       * Renders on ONE of the six pages, and that is the design. See
       * CompetitionWinnersRail's header for the measured coverage: three
       * categories hold no entrant photograph at all, so those pages open on
       * the views instead of on a row of placeholders standing in for people
       * we have no picture of.
       */}
      {!loading && !failed && <CompetitionWinnersRail entries={entries} />}

      <nav
        aria-label={t('competitions.viewNav', 'Choose a view')}
        className="mt-8 flex flex-wrap gap-2"
      >
        {views.map((v) => (
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
          {view === 'roster' && <CompetitionRoster entries={entries} />}
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
              <CompetitionCharts competitions={competitions} entries={entries} />
              <Suspense fallback={<div className="mt-8 h-[600px] w-full animate-pulse bg-muted" />}>
                <CompetitionMap entries={entries} />
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

/**
 * The four totals as stops on this category's line.
 *
 * It replaces one run-on sentence of middot-separated numbers, which asked the
 * reader to parse "45 competitions · 348 editions · 1814 entries · 743 linked
 * to a profile" as four facts. Four stations is the same information with the
 * grouping done for them.
 *
 * NO CONNECTOR IS DRAWN BETWEEN THE RINGS. A single illustrative transit line
 * always bends (hard rule 1), and a bending connector between four items that
 * wrap onto two rows at narrow widths cannot be drawn honestly — the geometry
 * would break at exactly the breakpoint it is meant to survive. The rings alone
 * carry the vocabulary.
 *
 * Every ring is the SAME fill, because the four are peers. A track colour here
 * would be encoding a rank if they differed, and this system does not let
 * colour mean a state.
 */
function StatStations({
  track,
  icon,
  totals,
}: {
  track: Track;
  icon: TransitIconName;
  totals: { competitions: number; editions: number; entrants: number; linked: number };
}) {
  const { t } = useTranslation();

  const stops: { key: string; value: number; label: string }[] = [
    {
      key: 'competitions',
      value: totals.competitions,
      label: t('competitions.stat.competitions', 'Competitions'),
    },
    { key: 'editions', value: totals.editions, label: t('competitions.stat.editions', 'Editions') },
    { key: 'entrants', value: totals.entrants, label: t('competitions.stat.entrants', 'Entries') },
    {
      key: 'linked',
      value: totals.linked,
      label: t('competitions.stat.linked', 'Linked to a profile'),
    },
  ];

  return (
    /*
     * `data-testid` because the e2e probe has to find these WITHOUT depending
     * on their copy. It used to match the run-on sentence these stations
     * replaced; when the copy went, the regex could never match, so every data
     * test waited out its full 45s timeout three times over and the whole
     * Critical paths job blew its 20-minute budget — reported as `cancelled`,
     * which reads like a concurrency cancellation and is not one.
     */
    <dl
      className="m-0 mt-6 flex flex-wrap items-start gap-x-8 gap-y-4"
      data-testid="competition-totals"
    >
      {stops.map((s) => (
        <div key={s.key} className="flex items-start gap-2" data-stat={s.key}>
          <StationRing state="typed" track={track} className="mt-1" />
          <div>
            <dt className="text-2xs uppercase tracking-label text-muted-foreground">{s.label}</dt>
            <dd className="m-0 text-title font-bold tabular-nums leading-tight">{s.value}</dd>
          </div>
        </div>
      ))}
      <TransitIcon name={icon} size={32} className="ms-auto hidden self-center sm:block" />
    </dl>
  );
}

function GridView({
  competitions,
  editionSlug,
  onSelect,
  grid,
  loading,
}: {
  competitions: Competition[];
  editionSlug: string | undefined;
  onSelect: (slug: string) => void;
  grid: CompetitionGridData | null;
  loading: boolean;
}) {
  const { t } = useTranslation();

  // Only editions that actually have a grid are offered. Listing one that has
  // no recorded results is an invitation to an empty table.
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
            {o.competition}: {o.title}
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
