import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { VenueCard } from '@/components/venues/VenueCard';
import { UpcomingEvents } from '@/components/intent/UpcomingEvents';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import { GatedContentNotice } from '@/components/safety/GatedContentNotice';
import { CityLandmarksRail } from '@/components/geo/CityLandmarksRail';
import { useCityLandmarks } from '@/hooks/useGeoPlaces';
import {
  useNightlifeVenues,
  useEventsWithFallback,
  useDestinationCities,
} from '@/hooks/useIntentData';
import type { SectionDef } from '@/components/entity/editorial';
import { CityNetwork } from '@/components/home/subway/CityNetwork';
import { hasCityNetwork } from '@/components/home/subway/cityNetworkGeometry';

/**
 * `/going-out` — bars, clubs and what is actually on.
 *
 * Venue-led by necessity, not by preference. The corpus holds 315 future events
 * in total and 18 within the next seven days across 130 cities, so the median
 * city has nothing on tonight; a calendar-led page would render an empty grid
 * almost everywhere. It leads with 7,015 nightlife venues instead and treats
 * events as a bonus, labelled with the time window they actually came from.
 *
 * "Open now" is deliberately absent as a filter: opening hours exist on 609 of
 * 23,484 venues (2.6%), so filtering on them would discard 97% of the catalogue
 * on arrival.
 */

export default function GoingOut() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const citySlug = params.get('city');
  const {
    cityId,
    cityName,
    citySlug: resolvedSlug,
    loading: locLoading,
  } = useIntentLocation(citySlug);

  const { data: venues, isLoading: venuesLoading } = useNightlifeVenues(cityId, 12);
  const { data: eventsResult } = useEventsWithFallback(cityId, 6);
  const { data: cities } = useDestinationCities(8);
  // Same query CityLandmarksRail runs; react-query dedupes it. Used only to
  // decide whether the "Scenes" section should exist at all.
  const { data: landmarks } = useCityLandmarks(cityId ?? undefined);

  const where = cityName ?? 'your area';

  useMeta({
    title: 'Going out — LGBTQ+ bars, clubs and nightlife',
    description:
      'Where to go out tonight: queer bars, clubs, cafés and saunas, plus what is actually on, wherever you are.',
    canonicalPath: '/going-out',
  });

  const sections: SectionDef[] = [
    {
      id: 'plan',
      label: 'Where to go',
      kicker: cityName ? `Nightlife in ${cityName}` : 'Nightlife near you',
      content:
        venuesLoading || locLoading ? (
          <p className="text-muted-foreground">Finding places…</p>
        ) : venues && venues.length > 0 ? (
          // VenueCard, not a hand-typed <li>. The row already carries images,
          // hours, tags and verification — this page fetched them and rendered
          // none of them, which is why "going out" read as a directory listing
          // instead of somewhere you might actually go tonight.
          <ul className="list-none p-0 m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {venues.map((v) => (
              <li key={v.id}>
                <VenueCard venue={v as unknown as Parameters<typeof VenueCard>[0]['venue']} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            No nightlife listed for {where} yet.{' '}
            <LocalizedLink to="/submit" className="underline underline-offset-4">
              Add a place
            </LocalizedLink>
            .
          </p>
        ),
      action: (
        <LocalizedLink
          to={cityName ? `/venues?city=${encodeURIComponent(cityName)}` : '/venues'}
          className="text-13 no-underline hover:underline"
        >
          All venues
        </LocalizedLink>
      ),
    },
    {
      id: 'whats-on',
      label: "What's on",
      content: <UpcomingEvents eventsResult={eventsResult} cityName={cityName} />,
      action: (
        <LocalizedLink to="/events" className="text-13 no-underline hover:underline">
          All events
        </LocalizedLink>
      ),
    },
    {
      id: 'scenes',
      label: 'Scenes',
      kicker: 'Neighborhoods with their own gravity',
      // "Self-hiding" was only ever true of the RAIL, not the SECTION.
      // CityLandmarksRail returns null with no landmarks — the common case
      // outside the deepest 71 cities — but EditorialSection still emitted the
      // kicker, the <h2> and a live nav anchor over an empty div. Verified in
      // production in Zürich. `hidden` uses the same hook the rail does, so the
      // two cannot disagree; the query is deduped by react-query.
      hidden: !landmarks || landmarks.length === 0,
      content: cityId ? <CityLandmarksRail cityId={cityId} /> : null,
    },
    {
      id: 'safety',
      label: 'Before you go',
      content: (
        <div>
          {/* Anon-safe: gated_count_for_location returns COUNTS only, never rows,
              so this can tell a signed-out reader that content exists in a
              criminalising country without exposing any of it. */}
          <GatedContentNotice cityId={cityId ?? undefined} />
          <p className="max-w-prose mb-4">
            Laws differ sharply by country, and going out is where that bites. Check the legal
            position before the night starts, not after.
          </p>
          <LocalizedLink
            to="/rights"
            className="border-2 border-foreground px-6 py-2 font-medium no-underline rounded-element inline-block"
          >
            LGBTQ+ rights by country
          </LocalizedLink>
        </div>
      ),
    },
    {
      id: 'elsewhere',
      label: 'Elsewhere',
      kicker: 'Cities worth the trip',
      content: (
        <ul className="list-none p-0 m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(cities ?? []).map((c) => (
            <li key={c.id} className="border-2 border-foreground p-4 rounded-container">
              <h3 className="text-title font-bold">
                {c.slug ? (
                  <LocalizedLink to={`/city/${c.slug}`} className="no-underline hover:underline">
                    {c.name}
                  </LocalizedLink>
                ) : (
                  c.name
                )}
              </h3>
              {c.countries?.name ? (
                <p className="text-13 text-muted-foreground">{c.countries.name}</p>
              ) : null}
              {hasCityNetwork(c.slug) && (
                <CityNetwork slug={c.slug} variant="thumb" className="mt-4 h-16" />
              )}
            </li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <IntentPageLayout
      breadcrumbLabel={t('header.intents.goingOut.label', 'Going out')}
      breadcrumbHref="/going-out"
      eyebrow={cityName ? `In ${cityName}` : 'Tonight'}
      title={cityName ? `Going out in ${cityName}` : 'Going out'}
      lede="Bars, clubs, cafés and saunas from the community, plus whatever is actually on while you are there."
      sections={sections}
      footer={
        resolvedSlug ? (
          <LocalizedLink
            to={`/city/${resolvedSlug}`}
            className="font-medium underline underline-offset-4"
          >
            Full guide to {cityName}
          </LocalizedLink>
        ) : null
      }
    />
  );
}
