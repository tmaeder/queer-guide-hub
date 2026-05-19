import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { ResumeTripStrip } from '@/components/travel/ResumeTripStrip';
import { useHasMeaningfulActiveTrip } from '@/hooks/useMeaningfulTrips';
import { StartTripHero } from '@/components/travel/StartTripHero';
import { PrideScroller } from '@/components/travel/PrideScroller';
import { InspirationGrid } from '@/components/travel/InspirationGrid';
import { BookNowAccordion } from '@/components/travel/BookNowAccordion';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useRecommendations } from '@/hooks/useRecommendations';
import {
  BrowseVisitedToolbar,
  readStoredVisitedFilter,
  writeVisitedFilter,
  type VisitedFilter,
} from '@/components/travel/BrowseVisitedToolbar';

export default function Travel() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useLocalizedNavigate();
  const intentBook = searchParams.get('intent') === 'book';
  const { activeTrip } = useActiveTrip();
  const hasActiveTrip = useHasMeaningfulActiveTrip();

  // Legacy ?mode=plan support: send active-trip users to /trips/:id (the real
  // plan view). Otherwise drop the param so we render a clean URL.
  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode !== 'plan' && mode !== 'browse') return;
    if (mode === 'plan' && activeTrip) {
      navigate(`/trips/${activeTrip.id}`, { replace: true });
      return;
    }
    setSearchParams(
      (prev) => {
        prev.delete('mode');
        return prev;
      },
      { replace: true },
    );
  }, [searchParams, activeTrip, navigate, setSearchParams]);

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
        mode: hasActiveTrip ? 'active_trip' : 'no_trip',
        intent_book: intentBook,
        experiment: 'travel_personalization_v1',
        group,
        recs_available: (recs?.length ?? 0) > 0,
      },
    });
    sessionStorage.setItem(flagKey, '1');
  }, [track, recs, hasActiveTrip, intentBook]);

  const [visitedFilter, setVisitedFilter] = useState<VisitedFilter>(() =>
    readStoredVisitedFilter(),
  );
  const onVisitedChange = (next: VisitedFilter) => {
    setVisitedFilter(next);
    writeVisitedFilter(next);
  };

  return (
    <div className="container mx-auto px-4 py-8 md:py-12 max-w-screen-xl">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-6">
        {t('pages.travel.title', 'Travel')}
      </h1>

      {/* Hero — three states:
          A. has active trip → ResumeTripStrip card (link to /trips/:id)
          B. no active trip, no booking intent → StartTripHero form
          C. ?intent=book → skip hero entirely; BookNowAccordion below opens */}
      {hasActiveTrip && <ResumeTripStrip />}
      {!hasActiveTrip && !intentBook && <StartTripHero />}

      {/* Booking: collapsed by default but moved above inspiration. Auto-open
          in STATE C (?intent=book). */}
      <BookNowAccordion defaultOpen={intentBook} />

      <PrideScroller />

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-xl font-bold tracking-tight">
          {t('pages.travel.inspiration.heading', 'Inspiration')}
        </h2>
        <BrowseVisitedToolbar value={visitedFilter} onChange={onVisitedChange} />
      </div>
      <InspirationGrid visitedFilter={visitedFilter} />
    </div>
  );
}
