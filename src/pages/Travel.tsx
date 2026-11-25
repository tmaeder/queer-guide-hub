import { Compass, Flag, MapPin, Sparkles } from '@/components/icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { PageIntro } from '@/components/layout/PageIntro';
import { Button } from '@/components/ui/button';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { PrideScroller } from '@/components/travel/PrideScroller';
import { VillagesRail } from '@/components/travel/VillagesRail';
import { DiscoverableTripsRail } from '@/components/travel/DiscoverableTripsRail';
import { TravelCoverStory } from '@/components/travel/TravelCoverStory';
import { GoNowRail } from '@/components/travel/GoNowRail';
import { PersonalisedTripPackages } from '@/components/travel/PersonalisedTripPackages';
import { TravelJourneyNav } from '@/components/travel/TravelJourneyNav';
import { useOptionalActiveTrip } from '@/hooks/useActiveTrip';
import { AMBIENT_TRIP_CONTEXT_ENABLED } from '@/lib/trips/ambientTripFlags';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useLegacyTravelParams } from '@/hooks/useLegacyTravelParams';
import { Skeleton } from '@/components/ui/skeleton';
import { readStoredVisitedFilter, type VisitedFilter } from '@/components/travel/visitedFilter';
import type { SectionDef } from '@/components/entity/editorial';

/**
 * `/travel` — the Travelling intent, inspiration-first.
 *
 * Rebuilt at its existing path rather than given a new one: `/travel` already
 * has STATIC_ROUTE_META and STATIC_ROUTE_BODY entries and existing rankings, so
 * keeping the URL means this redesign cannibalises nothing.
 *
 * The page opens with a destination, then the trip finder: "Inspire me" or
 * "I know where I'm going", ending in every booking link. /travel/book and
 * /travel/plan redirect here; old booking query keys are translated by
 * useLegacyTravelParams. Safety
 * data (250/250 countries covered) stays on-page as "Know before you go" and
 * in full depth inside each trip's safety briefing.
 */
export default function Travel() {
  const { t } = useTranslation();
  const ambientTrip = useOptionalActiveTrip()?.activeTrip ?? null;
  const activeTrip = AMBIENT_TRIP_CONTEXT_ENABLED ? ambientTrip : null;
  const { track } = useTrackEvent();
  // Old /travel/book links (?tab, ?city, ?to, ?intent=book) become the finder's
  // second door; hold the finder back until that rewrite lands.
  const translatingLegacyLink = useLegacyTravelParams();

  const [visitedFilter] = useState<VisitedFilter>(() => readStoredVisitedFilter());

  useEffect(() => {
    // No entityType: 'intent' is not a member of EntityType, and inventing one
    // would feed a synthetic type into the personalization bias vector.
    track({
      eventType: 'page_view',
      metadata: { intent: 'travelling', layout: 'destination-led' },
    });
  }, [track]);

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
          {translatingLegacyLink ? (
            <Skeleton variant="rectangular" className="h-[640px] rounded-container" />
          ) : (
            <PersonalisedTripPackages />
          )}
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
  ];

  const activeCity = activeTrip?.primary_city_name;
  const showCover = !activeTrip;
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
            {activeTrip ? (
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
