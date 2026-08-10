import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { PrideScroller } from '@/components/travel/PrideScroller';
import { BookNowAccordion } from '@/components/travel/BookNowAccordion';
import { TripCockpit } from '@/components/travel/TripCockpit';
import { StartTripHero } from '@/components/travel/StartTripHero';
import { VillagesRail } from '@/components/travel/VillagesRail';
import { DiscoverableTripsRail } from '@/components/travel/DiscoverableTripsRail';
import { BrowseVisitedToolbar } from '@/components/travel/BrowseVisitedToolbar';
import { TravelDiscoveryMap } from '@/components/travel/TravelDiscoveryMap';
import { TravelCoverStory } from '@/components/travel/TravelCoverStory';
import { GoNowRail } from '@/components/travel/GoNowRail';
import { DestinationGrid } from '@/components/travel/DestinationGrid';
import { GuidesRail } from '@/components/guides/GuidesRail';
import { TrendingStrip } from '@/components/discovery/TrendingStrip';
import { TripTemplates } from '@/components/trips/TripTemplates';
import { useAuth } from '@/hooks/useAuth';
import { useTripBookingContext } from '@/hooks/useTripBookingContext';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import { useAllCountriesRights } from '@/hooks/useIntentData';
import { hasAnyCriminalizationSignal, hasDeathPenalty } from '@/utils/equalityScore';
import {
  readStoredVisitedFilter,
  writeVisitedFilter,
  type VisitedFilter,
} from '@/components/travel/visitedFilter';
import type { SectionDef } from '@/components/entity/editorial';

/**
 * `/travel` — the Travelling intent, planner-first.
 *
 * Rebuilt at its existing path rather than given a new one: `/travel` already
 * has STATIC_ROUTE_META and STATIC_ROUTE_BODY entries and existing rankings, so
 * keeping the URL means this redesign cannibalises nothing.
 *
 * The page opens on the trip planner — plan, then book, with the legal picture
 * as a compact briefing near the end instead of the lead. The planner is the
 * most built-out system on the site and this page is its front door; safety
 * data (250/250 countries covered) stays on-page as "Know before you go" and
 * in full depth inside each trip's safety briefing.
 */
export default function Travel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { track } = useTrackEvent();
  const [params] = useSearchParams();
  // Any booking deep link (?intent=book from nav CTAs, ?tab/?city from
  // TripBookingAssistant + CityTravelHub) should land on the booking section
  // with the accordion open.
  const bookIntent =
    params.get('intent') === 'book' || !!params.get('tab') || !!params.get('city');

  const [visitedFilter, setVisitedFilter] = useState<VisitedFilter>(() =>
    readStoredVisitedFilter(),
  );
  const onVisitedChange = (next: VisitedFilter) => {
    setVisitedFilter(next);
    writeVisitedFilter(next);
  };

  const { countryCode } = useIntentLocation();
  const { data: countries } = useAllCountriesRights();
  const tripBookingContext = useTripBookingContext();

  const home = useMemo(
    () =>
      countryCode && countries
        ? (countries.find((c) => c.code?.toLowerCase() === countryCode.toLowerCase()) ?? null)
        : null,
    [countries, countryCode],
  );

  useEffect(() => {
    // No entityType: 'intent' is not a member of EntityType, and inventing one
    // would feed a synthetic type into the personalization bias vector.
    track({ eventType: 'page_view', metadata: { intent: 'travelling', layout: 'planner-first' } });
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
      'Build a queer trip in one place: pick a destination on the map, plan the days, and book flights, stays and activities — with the legal picture built in.',
    canonicalPath: '/travel',
  });

  const criminalizingCount = useMemo(
    () => (countries ?? []).filter((c) => hasAnyCriminalizationSignal(c.lgbti_criminalization)).length,
    [countries],
  );

  const sections: SectionDef[] = [
    {
      id: 'plan',
      label: t('pages.travel.sections.plan', 'Plan your trip'),
      kicker: t('pages.travel.sections.planKicker', 'The planner'),
      content: (
        <div>
          {user ? <TripCockpit /> : <StartTripHero />}
          <TripTemplates />
          <div className="mt-12">
            <DiscoverableTripsRail />
          </div>
        </div>
      ),
    },
    {
      id: 'inspiration',
      label: t('pages.travel.sections.inspiration', 'Where to go'),
      kicker: t('pages.travel.sections.inspirationKicker', 'Destinations'),
      content: (
        <div>
          <TravelCoverStory />
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
      id: 'map',
      label: t('pages.travel.sections.map', 'See the map'),
      kicker: t('pages.travel.sections.mapKicker', 'Destinations at a glance'),
      // Moved out from between 'plan' and 'inspiration'. The map is a tool, and
      // sitting second it split the two things this page is for — the planner
      // and the reasons to use it — with a full-width utility surface. It now
      // follows the inspiration cluster it belongs to thematically ("where to
      // go", seen at a glance) instead of interrupting it.
      content: <TravelDiscoveryMap />,
    },
    {
      id: 'villages',
      label: t('pages.travel.sections.villages', 'Neighborhoods'),
      kicker: t('pages.travel.sections.villagesKicker', 'Queer villages worldwide'),
      content: <VillagesRail visitedFilter={visitedFilter} />,
    },
    {
      id: 'pride',
      label: t('pages.travel.sections.pride', 'Pride season'),
      content: <PrideScroller />,
    },
    {
      id: 'book',
      label: t('pages.travel.sections.book', 'Getting there'),
      kicker: t('pages.travel.sections.bookKicker', 'Flights and stays'),
      content: <BookNowAccordion defaultOpen={bookIntent} tripContext={tripBookingContext} />,
    },
    {
      id: 'safety',
      label: t('pages.travel.sections.safety', 'Know before you go'),
      kicker: t('pages.travel.sections.safetyKicker', 'The legal picture'),
      content: (
        <div>
          <CoverageNote>
            We hold the legal position for all {countries?.length ?? 250} countries and
            territories. {criminalizingCount} of them criminalise same-sex acts.
          </CoverageNote>
          {home ? (
            <p className="text-body-lg mb-4">
              You appear to be in <strong>{home.name}</strong>.{' '}
              {hasDeathPenalty(home.lgbti_criminalization)
                ? 'Same-sex acts can carry the death penalty here.'
                : hasAnyCriminalizationSignal(home.lgbti_criminalization)
                  ? 'Same-sex acts are criminalised here.'
                  : 'Same-sex acts are not criminalised here.'}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-4">
            <LocalizedLink
              to="/rights"
              className="border-2 border-foreground px-6 py-2 font-medium no-underline rounded-element"
            >
              Check any country
            </LocalizedLink>
            <LocalizedLink
              to="/city/compare"
              className="border-2 border-foreground px-6 py-2 font-medium no-underline rounded-element"
            >
              Compare two places
            </LocalizedLink>
          </div>
        </div>
      ),
    },
  ];

  return (
    <IntentPageLayout
      breadcrumbLabel={t('header.intents.travelling.label', 'Travelling')}
      breadcrumbHref="/travel"
      eyebrow="Travelling"
      title={t('pages.travel.title', 'Where are you going?')}
      lede={t(
        'pages.travel.lede',
        'Pick a place, build the trip, book the pieces — with the legal picture built in.',
      )}
      sections={sections}
    />
  );
}
