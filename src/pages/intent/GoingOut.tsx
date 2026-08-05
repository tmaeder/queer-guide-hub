import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import {
  useNightlifeVenues,
  useEventsWithFallback,
  useDestinationCities,
  type EventWindow,
} from '@/hooks/useIntentData';
import type { SectionDef } from '@/components/entity/editorial';

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

const WINDOW_LABEL: Record<EventWindow, string> = {
  tonight: 'tonight',
  'this-weekend': 'this weekend',
  'next-7-days': 'in the next 7 days',
  'next-30-days': 'in the next 30 days',
  anywhere: 'soonest anywhere',
};

export default function GoingOut() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const citySlug = params.get('city');
  const { cityId, cityName, citySlug: resolvedSlug, loading: locLoading } = useIntentLocation(citySlug);

  const { data: venues, isLoading: venuesLoading } = useNightlifeVenues(cityId, 12);
  const { data: eventsResult } = useEventsWithFallback(cityId, 6);
  const { data: cities } = useDestinationCities(8);

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
      content: venuesLoading || locLoading ? (
        <p className="text-muted-foreground">Finding places…</p>
      ) : venues && venues.length > 0 ? (
        <ul className="list-none p-0 m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((v) => (
            <li key={v.id} className="border-2 border-foreground p-4 rounded-container">
              <p className="text-2xs uppercase tracking-wider text-muted-foreground mb-2">
                {v.category}
              </p>
              <h3 className="font-display text-title mb-2">
                {v.slug ? (
                  <LocalizedLink to={`/venues/${v.slug}`} className="no-underline hover:underline">
                    {v.name}
                  </LocalizedLink>
                ) : (
                  v.name
                )}
              </h3>
              {v.description ? (
                <p className="text-13 text-muted-foreground line-clamp-3">{v.description}</p>
              ) : null}
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
      content: (
        <div>
          <CoverageNote>
            {eventsResult && eventsResult.events.length > 0
              ? `Showing events ${WINDOW_LABEL[eventsResult.window]}${
                  eventsResult.window === 'anywhere' && cityName
                    ? ` — nothing is listed in ${cityName} in the next 30 days.`
                    : '.'
                }`
              : 'No upcoming events are listed yet.'}{' '}
            Our events coverage is thin: listings come from organisers and submissions, so an empty
            week here means we have no record, not that nothing is happening.
          </CoverageNote>
          {eventsResult && eventsResult.events.length > 0 ? (
            <ul className="list-none p-0 m-0">
              {eventsResult.events.map((e) => (
                <li key={e.id} className="border-b border-border py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-medium">
                      {e.slug ? (
                        <LocalizedLink
                          to={`/events/${e.slug}`}
                          className="no-underline hover:underline"
                        >
                          {e.title}
                        </LocalizedLink>
                      ) : (
                        e.title
                      )}
                    </span>
                    <span className="text-13 text-muted-foreground whitespace-nowrap">
                      {new Date(e.start_date).toLocaleDateString()}
                      {e.city ? ` · ${e.city}` : ''}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ),
      action: (
        <LocalizedLink to="/events" className="text-13 no-underline hover:underline">
          All events
        </LocalizedLink>
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
              <h3 className="font-display text-title">
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
