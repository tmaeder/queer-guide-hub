import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { ResumeTripStrip } from '@/components/travel/ResumeTripStrip';
import { useHasMeaningfulActiveTrip } from '@/hooks/useMeaningfulTrips';
import { PrideScroller } from '@/components/travel/PrideScroller';
import { InspirationGrid } from '@/components/travel/InspirationGrid';
import { BookNowAccordion } from '@/components/travel/BookNowAccordion';
import { TripCockpit } from '@/components/travel/TripCockpit';
import { VillagesRail } from '@/components/travel/VillagesRail';
import { DiscoverableTripsRail } from '@/components/travel/DiscoverableTripsRail';
import { BrowseVisitedToolbar } from '@/components/travel/BrowseVisitedToolbar';
import { useAuth } from '@/hooks/useAuth';
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
 * `/travel` — the Travelling intent, rebuilt in place.
 *
 * Rebuilt at its existing path rather than given a new one: `/travel` already
 * has STATIC_ROUTE_META and STATIC_ROUTE_BODY entries and existing rankings, so
 * keeping the URL means this redesign cannibalises nothing.
 *
 * The reordering is the point. This page used to open on a trip cockpit serving
 * a population of 8 trips. It now opens on "is it safe for me?", because that is
 * the question a queer traveller actually asks first and it is the one question
 * our data can answer completely — 250 of 250 countries carry a criminalisation
 * status. Trips are demoted to a self-hiding section for signed-in users.
 */
export default function Travel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { track } = useTrackEvent();
  const [params] = useSearchParams();
  const intentBook = params.get('intent') === 'book';

  const hasActiveTrip = useHasMeaningfulActiveTrip();
  const [visitedFilter, setVisitedFilter] = useState<VisitedFilter>(() =>
    readStoredVisitedFilter(),
  );
  const onVisitedChange = (next: VisitedFilter) => {
    setVisitedFilter(next);
    writeVisitedFilter(next);
  };

  const { countryCode } = useIntentLocation();
  const { data: countries } = useAllCountriesRights();

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
    track({ eventType: 'page_view', metadata: { intent: 'travelling' } });
  }, [track]);

  useMeta({
    title: 'LGBTQ+ Travel Guide — Safe Destinations | Queer Guide',
    description:
      'Plan safer queer travel. Country safety ratings, city guides, and trusted local recommendations.',
    canonicalPath: '/travel',
  });

  const criminalizingCount = useMemo(
    () => (countries ?? []).filter((c) => hasAnyCriminalizationSignal(c.lgbti_criminalization)).length,
    [countries],
  );

  const sections: SectionDef[] = [
    {
      id: 'safety',
      label: 'Is it safe?',
      kicker: 'Before you book',
      content: (
        <div>
          <CoverageNote>
            We hold the legal position for all {countries?.length ?? 250} countries and territories.{' '}
            {criminalizingCount} of them criminalise same-sex acts. This is the most complete data
            on the site — everything else here is thinner.
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
    {
      id: 'where',
      label: 'Where to go',
      kicker: 'Destinations',
      content: (
        <div>
          <div className="mb-6 flex flex-wrap items-center justify-end">
            <BrowseVisitedToolbar value={visitedFilter} onChange={onVisitedChange} />
          </div>
          <InspirationGrid visitedFilter={visitedFilter} />
        </div>
      ),
    },
    {
      id: 'villages',
      label: 'Neighborhoods',
      kicker: 'Queer villages worldwide',
      content: <VillagesRail visitedFilter={visitedFilter} />,
    },
    {
      id: 'pride',
      label: 'Pride season',
      content: <PrideScroller />,
    },
    {
      id: 'stay',
      label: 'Getting there',
      kicker: 'Flights and stays',
      content: <BookNowAccordion defaultOpen={intentBook} />,
    },
    // Self-hiding: 8 trips exist in the entire database, so this is a personal
    // tool for signed-in users, not a public destination.
    ...(user
      ? [
          {
            id: 'your-trips',
            label: 'Your trips',
            content: (
              <div>
                {hasActiveTrip ? <ResumeTripStrip /> : null}
                <TripCockpit />
                <DiscoverableTripsRail />
              </div>
            ),
          } satisfies SectionDef,
        ]
      : []),
  ];

  return (
    <IntentPageLayout
      breadcrumbLabel={t('header.intents.travelling.label', 'Travelling')}
      breadcrumbHref="/travel"
      eyebrow="Travelling"
      title={t('pages.travel.title', 'Where are you going?')}
      lede="Check the law before you book, then find the places, neighborhoods and stays worth the trip."
      sections={sections}
    />
  );
}
