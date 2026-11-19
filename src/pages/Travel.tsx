import { Compass, Flag, MapPin, Plane, Sparkles } from '@/components/icons';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { PageIntro } from '@/components/layout/PageIntro';
import { Button } from '@/components/ui/button';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { PrideScroller } from '@/components/travel/PrideScroller';
import { BookNowAccordion } from '@/components/travel/BookNowAccordion';
import { TripCockpit } from '@/components/travel/TripCockpit';
import { StartTripHero } from '@/components/travel/StartTripHero';
import { VillagesRail } from '@/components/travel/VillagesRail';
import { DiscoverableTripsRail } from '@/components/travel/DiscoverableTripsRail';
import { BrowseVisitedToolbar } from '@/components/travel/BrowseVisitedToolbar';
import { TravelCoverStory } from '@/components/travel/TravelCoverStory';
import { GoNowRail } from '@/components/travel/GoNowRail';
import { DestinationGrid } from '@/components/travel/DestinationGrid';
import { GuidesRail } from '@/components/guides/GuidesRail';
import { TrendingStrip } from '@/components/discovery/TrendingStrip';
import { PersonalisedTripPackages } from '@/components/travel/PersonalisedTripPackages';
import { TravelJourneyNav } from '@/components/travel/TravelJourneyNav';
import { useAuth } from '@/hooks/useAuth';
import { useOptionalActiveTrip } from '@/hooks/useActiveTrip';
import { AMBIENT_TRIP_CONTEXT_ENABLED } from '@/lib/trips/ambientTripFlags';
import { useTripBookingContext } from '@/hooks/useTripBookingContext';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import {
  readStoredVisitedFilter,
  writeVisitedFilter,
  type VisitedFilter,
} from '@/components/travel/visitedFilter';
import type { SectionDef } from '@/components/entity/editorial';

/**
 * `/travel` — the Travelling intent, inspiration-first.
 *
 * Rebuilt at its existing path rather than given a new one: `/travel` already
 * has STATIC_ROUTE_META and STATIC_ROUTE_BODY entries and existing rankings, so
 * keeping the URL means this redesign cannibalises nothing.
 *
 * The page opens with a destination, then exposes personalised packages and
 * the full planner. Active trips and booking links retain their own paths.
 * Safety
 * data (250/250 countries covered) stays on-page as "Know before you go" and
 * in full depth inside each trip's safety briefing.
 */
export default function Travel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const ambientTrip = useOptionalActiveTrip()?.activeTrip ?? null;
  const activeTrip = AMBIENT_TRIP_CONTEXT_ENABLED ? ambientTrip : null;
  const { track } = useTrackEvent();
  const [params] = useSearchParams();
  // Any booking deep link (?intent=book from nav CTAs, ?tab/?city from
  // TripBookingAssistant + CityTravelHub) should land on the booking section
  // with the accordion open.
  const bookIntent = params.get('intent') === 'book' || !!params.get('tab') || !!params.get('city');

  const [visitedFilter, setVisitedFilter] = useState<VisitedFilter>(() =>
    readStoredVisitedFilter(),
  );
  const onVisitedChange = (next: VisitedFilter) => {
    setVisitedFilter(next);
    writeVisitedFilter(next);
  };

  const tripBookingContext = useTripBookingContext();

  useEffect(() => {
    // No entityType: 'intent' is not a member of EntityType, and inventing one
    // would feed a synthetic type into the personalization bias vector.
    track({
      eventType: 'page_view',
      metadata: { intent: 'travelling', layout: 'destination-led' },
    });
  }, [track]);

  // Booking deep links scroll to the book section. EditorialDetailLayout's own
  // initial-scroll only reads ?section= and has already run by the time this
  // parent effect fires, so scroll directly; its persist effect then writes
  // ?section=book once the section becomes active.
  useEffect(() => {
    if (!bookIntent || params.get('section')) return;
    queueMicrotask(() => document.getElementById('book')?.scrollIntoView?.({ block: 'start' }));
    // One-shot on mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMeta({
    title: 'Plan LGBTQ+ Trips — Queer Travel Planner | Queer Guide',
    description:
      'Discover personalised queer trip packages with real events, venues, stays and transport, then shape every day of the itinerary.',
    canonicalPath: '/travel',
  });

  const sections: SectionDef[] = [
    {
      id: 'plan',
      icon: Sparkles,
      label: t('pages.travel.packages.section', 'Find your escape'),
      content: (
        <div>
          <PersonalisedTripPackages />
          <div className="mt-12">{user ? <TripCockpit /> : <StartTripHero />}</div>
          <div className="mt-12">
            <DiscoverableTripsRail />
          </div>
        </div>
      ),
    },
    {
      id: 'inspiration',
      icon: Compass,
      label: t('pages.travel.sections.inspiration', 'Where to go'),
      content: (
        <div>
          <GoNowRail />
          <div className="mb-6 flex flex-wrap items-center justify-end">
            <BrowseVisitedToolbar value={visitedFilter} onChange={onVisitedChange} />
          </div>
          <DestinationGrid visitedFilter={visitedFilter} />
          <GuidesRail
            title={t('pages.travel.collections', 'Collections')}
            filters={{ format: 'list' }}
          />
          <div className="mt-12">
            <TrendingStrip
              types={['city', 'event']}
              limit={10}
              title={t('pages.travel.trending', 'Trending now')}
            />
          </div>
        </div>
      ),
    },
    {
      id: 'villages',
      icon: MapPin,
      label: t('pages.travel.sections.villages', 'Neighborhoods'),
      content: <VillagesRail visitedFilter={visitedFilter} />,
    },
    {
      id: 'pride',
      icon: Flag,
      label: t('pages.travel.sections.pride', 'Pride season'),
      content: <PrideScroller />,
    },
    {
      id: 'book',
      icon: Plane,
      label: t('pages.travel.sections.book', 'Getting there'),
      content: <BookNowAccordion defaultOpen={bookIntent} tripContext={tripBookingContext} />,
    },
  ];

  const activeCity = activeTrip?.primary_city_name;
  const showCover = !activeTrip && !bookIntent;
  const title = activeCity
    ? t('pages.travel.activeTitle', 'Planning {{city}}', { city: activeCity })
    : t('pages.travel.packages.title', 'Trips made for you');
  const lede = activeCity
    ? t(
        'pages.travel.activeLede',
        'Add places and events for {{city}} directly to your active trip.',
        { city: activeCity },
      )
    : t(
        'pages.travel.packages.lede',
        'Choose a mood and start with a complete idea: a real event, queer places, a stay and every way to get there.',
      );

  return (
    <IntentPageLayout
      topNav={<TravelJourneyNav />}
      breadcrumbLabel={t('header.intents.travelling.label', 'Travelling')}
      breadcrumbHref="/travel"
      title={title}
      header={
        <header className="grid items-center gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
          <PageIntro title={title} lede={lede}>
            {activeTrip && !bookIntent ? (
              <Button asChild className="mt-6">
                <LocalizedLink to={`/trips/${activeTrip.id}`} className="no-underline">
                  {t('pages.travel.resume.title', 'Continue planning')}
                </LocalizedLink>
              </Button>
            ) : null}
          </PageIntro>
          {showCover && <TravelCoverStory />}
        </header>
      }
      sections={sections}
    />
  );
}
