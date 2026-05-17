import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { ResumeTripStrip } from '@/components/travel/ResumeTripStrip';
import { StartTripHero } from '@/components/travel/StartTripHero';
import { PrideScroller } from '@/components/travel/PrideScroller';
import { InspirationGrid } from '@/components/travel/InspirationGrid';
import { BookNowAccordion } from '@/components/travel/BookNowAccordion';
import { TravelModeSwitcher, type TravelMode } from '@/components/travel/TravelModeSwitcher';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useRecommendations } from '@/hooks/useRecommendations';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import { Calendar, MapPin } from 'lucide-react';
import { resolveTripTitle } from '@/components/trips/tripTitle';
import { PlanModeInventory } from '@/components/travel/PlanModeInventory';
import { PlanGapsSidebar } from '@/components/travel/PlanGapsSidebar';
import {
  BrowseVisitedToolbar,
  readStoredVisitedFilter,
  writeVisitedFilter,
  type VisitedFilter,
} from '@/components/travel/BrowseVisitedToolbar';

const MODE_STORAGE_KEY = 'qg.travelMode';

function readStoredMode(): TravelMode | null {
  try {
    const v = localStorage.getItem(MODE_STORAGE_KEY);
    return v === 'browse' || v === 'plan' ? v : null;
  } catch {
    return null;
  }
}

function writeStoredMode(mode: TravelMode) {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export default function Travel() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const intentBook = searchParams.get('intent') === 'book';
  const { activeTrip } = useActiveTrip();

  const mode: TravelMode = useMemo(() => {
    const urlMode = searchParams.get('mode');
    if (urlMode === 'plan' || urlMode === 'browse') return urlMode;
    const stored = readStoredMode();
    if (stored) return stored;
    return activeTrip ? 'plan' : 'browse';
  }, [searchParams, activeTrip]);

  const setMode = (next: TravelMode) => {
    writeStoredMode(next);
    setSearchParams(
      (prev) => {
        prev.set('mode', next);
        return prev;
      },
      { replace: true },
    );
  };

  const { track } = useTrackEvent();
  const { data: recs } = useRecommendations({ recType: 'destination', limit: 20 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flagKey = 'qg_exp_travel_perso_v1_logged';
    if (sessionStorage.getItem(flagKey)) return;
    const sessionId = sessionStorage.getItem('qg_session_id') ?? '';
    const group =
      parseInt(sessionId.slice(-2) || '0', 16) % 2 === 0 ? 'personalized' : 'control';
    track({
      eventType: 'page_view',
      metadata: {
        page: 'travel',
        mode,
        experiment: 'travel_personalization_v1',
        group,
        recs_available: (recs?.length ?? 0) > 0,
      },
    });
    sessionStorage.setItem(flagKey, '1');
  }, [track, recs, mode]);

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-screen-xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          {t('pages.travel.title', 'Travel')}
        </h1>
        <TravelModeSwitcher current={mode} onChange={setMode} />
      </div>

      {mode === 'plan' ? <PlanMode /> : <BrowseMode intentBook={intentBook} />}
    </div>
  );
}

function BrowseMode({ intentBook }: { intentBook: boolean }) {
  const { t } = useTranslation();
  const [visitedFilter, setVisitedFilter] = useState<VisitedFilter>(() =>
    readStoredVisitedFilter(),
  );
  const onChange = (next: VisitedFilter) => {
    setVisitedFilter(next);
    writeVisitedFilter(next);
  };
  return (
    <>
      <ResumeTripStrip />
      {!intentBook && <StartTripHero />}
      <PrideScroller />
      <div className="flex items-center justify-end mb-3">
        <BrowseVisitedToolbar value={visitedFilter} onChange={onChange} />
      </div>
      <InspirationGrid visitedFilter={visitedFilter} />
      <BookNowAccordion defaultOpen={intentBook} />
      <div className="border border-border bg-background text-center py-6 px-6 rounded">
        <p className="font-semibold mb-2">
          {t('pages.travel.exploreCta', 'LGBTQ+ friendly destinations')}
        </p>
        <p className="text-muted-foreground text-sm mb-4">
          {t(
            'pages.travel.exploreDescription',
            'Browse cities and countries with detailed safety information and travel guides.',
          )}
        </p>
        <LocalizedLink to="/places">
          <Button variant="outline">{t('pages.travel.browseDestinations', 'Browse destinations')}</Button>
        </LocalizedLink>
      </div>
    </>
  );
}

function PlanMode() {
  const { t } = useTranslation();
  const { activeTrip, candidateTrips, setActiveTripId } = useActiveTrip();
  const [focusSection, setFocusSection] = useState<
    'hotels' | 'venues' | 'events' | null
  >(null);

  if (!activeTrip) {
    return (
      <div className="border border-border bg-background p-8 text-center rounded">
        <h2 className="text-lg font-semibold mb-2">
          {t('pages.travel.plan.noTrip.title', 'No active trip')}
        </h2>
        <p className="text-muted-foreground mb-4">
          {t(
            'pages.travel.plan.noTrip.description',
            'Start a trip to see inventory tailored to your destination and dates.',
          )}
        </p>
        <LocalizedLink to="/trips">
          <Button variant="brand">{t('pages.travel.plan.noTrip.cta', 'Start a trip')}</Button>
        </LocalizedLink>
      </div>
    );
  }

  const title = resolveTripTitle(
    { title: activeTrip.title, primary_city_name: activeTrip.primary_city_name ?? null },
    t,
  );

  return (
    <>
      <section className="border border-border bg-background p-4 mb-6 rounded flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {t('pages.travel.plan.activeTrip', 'Active trip')}
          </div>
          <LocalizedLink
            to={`/trips/${activeTrip.id}`}
            className="font-semibold text-lg truncate inline-block"
            style={{ textDecoration: 'none' }}
          >
            {title}
          </LocalizedLink>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            {activeTrip.start_date && (
              <span className="inline-flex items-center gap-1">
                <Calendar size={14} />
                {new Date(activeTrip.start_date).toLocaleDateString()}
              </span>
            )}
            {activeTrip.primary_city_name && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={14} />
                {activeTrip.primary_city_name}
              </span>
            )}
          </div>
        </div>
        {candidateTrips.length > 1 && (
          <select
            value={activeTrip.id}
            onChange={(e) => setActiveTripId(e.target.value)}
            className="border border-border bg-background px-3 py-2 text-sm"
            aria-label={t('pages.travel.plan.switchTrip', 'Switch active trip')}
          >
            {candidateTrips.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {resolveTripTitle(
                  { title: tr.title, primary_city_name: tr.primary_city_name ?? null },
                  t,
                )}
              </option>
            ))}
          </select>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="min-w-0">
          <PlanModeInventory trip={activeTrip} highlightSection={focusSection} />
        </div>
        <div className="lg:order-last">
          <PlanGapsSidebar
            tripId={activeTrip.id}
            onFocusSection={(s) => {
              setFocusSection(s);
              // Re-trigger scroll on repeated clicks by clearing then setting.
              setTimeout(() => setFocusSection((cur) => (cur === s ? null : cur)), 1500);
            }}
          />
        </div>
      </div>
    </>
  );
}
