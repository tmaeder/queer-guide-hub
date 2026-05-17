import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Hotel as HotelIcon, MapPin, Calendar } from 'lucide-react';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useHotels } from '@/hooks/useHotels';
import { VenueCard } from '@/components/venues/VenueCard';
import { HotelCard } from '@/components/hotels/HotelCard';
import { EventCard } from '@/components/events/EventCard';
import { Skeleton } from '@/components/ui/skeleton';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { TripListItem } from '@/hooks/useTrips';

interface Props {
  trip: TripListItem;
  /** Which section to scroll to when user activates a gap CTA. */
  highlightSection?: 'hotels' | 'venues' | 'events' | null;
}

const LIMIT = 6;

export function PlanModeInventory({ trip, highlightSection }: Props) {
  const { t } = useTranslation();
  const cityName = trip.primary_city_name ?? '';

  const { venues, loading: venuesLoading, fetchVenues } = useVenues(false);
  const { events, loading: eventsLoading, fetchEvents } = useEvents(false);
  const { hotels, loading: hotelsLoading, fetchHotels } = useHotels(false);

  useEffect(() => {
    if (!cityName) return;
    void fetchVenues({ city: cityName }, undefined, LIMIT);
    void fetchHotels({ city: cityName }, undefined, LIMIT);
    void fetchEvents(
      {
        city: cityName,
        dateRange:
          trip.start_date && trip.end_date
            ? { from: trip.start_date, to: trip.end_date }
            : undefined,
      },
      undefined,
      LIMIT,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityName, trip.start_date, trip.end_date]);

  useEffect(() => {
    if (!highlightSection) return;
    const el = document.getElementById(`plan-section-${highlightSection}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [highlightSection]);

  if (!cityName) {
    return (
      <p className="text-sm text-muted-foreground">
        {t(
          'pages.travel.plan.noCity',
          'Add a destination to your trip to see contextual inventory here.',
        )}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <Section
        id="hotels"
        icon={HotelIcon}
        title={t('pages.travel.plan.hotelsIn', 'Hotels in {{city}}', { city: cityName })}
        viewAllHref={`/hotels?city=${encodeURIComponent(cityName)}`}
        viewAllLabel={t('pages.travel.plan.viewAllHotels', 'All hotels')}
        loading={hotelsLoading}
        empty={hotels.length === 0}
        highlight={highlightSection === 'hotels'}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {hotels.slice(0, LIMIT).map((hotel) => (
            <HotelCard key={hotel.id} hotel={hotel} />
          ))}
        </div>
      </Section>

      <Section
        id="venues"
        icon={MapPin}
        title={t('pages.travel.plan.venuesIn', 'Venues in {{city}}', { city: cityName })}
        viewAllHref={`/venues?city=${encodeURIComponent(cityName)}`}
        viewAllLabel={t('pages.travel.plan.viewAllVenues', 'All venues')}
        loading={venuesLoading}
        empty={venues.length === 0}
        highlight={highlightSection === 'venues'}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {venues.slice(0, LIMIT).map((venue) => (
            <VenueCard key={venue.id} venue={venue} />
          ))}
        </div>
      </Section>

      <Section
        id="events"
        icon={Calendar}
        title={t(
          'pages.travel.plan.eventsDuring',
          trip.start_date && trip.end_date
            ? 'Events during your trip'
            : 'Events in {{city}}',
          { city: cityName },
        )}
        viewAllHref={`/events?city=${encodeURIComponent(cityName)}`}
        viewAllLabel={t('pages.travel.plan.viewAllEvents', 'All events')}
        loading={eventsLoading}
        empty={events.length === 0}
        highlight={highlightSection === 'events'}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.slice(0, LIMIT).map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </Section>
    </div>
  );
}

interface SectionProps {
  id: string;
  icon: typeof HotelIcon;
  title: string;
  viewAllHref: string;
  viewAllLabel: string;
  loading: boolean;
  empty: boolean;
  highlight: boolean;
  children: React.ReactNode;
}

function Section({
  id,
  icon: Icon,
  title,
  viewAllHref,
  viewAllLabel,
  loading,
  empty,
  highlight,
  children,
}: SectionProps) {
  const { t } = useTranslation();
  return (
    <section
      id={`plan-section-${id}`}
      className={
        'scroll-mt-24 transition-colors ' +
        (highlight ? 'ring-2 ring-foreground/40 ring-offset-4 ring-offset-background' : '')
      }
    >
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-lg font-bold tracking-tight inline-flex items-center gap-2">
          <Icon className="h-5 w-5" aria-hidden />
          {title}
        </h3>
        <LocalizedLink to={viewAllHref} className="text-sm text-muted-foreground">
          {viewAllLabel}
        </LocalizedLink>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : empty ? (
        <p className="text-sm text-muted-foreground">
          {t('pages.travel.plan.empty', 'Nothing here yet for this destination.')}
        </p>
      ) : (
        children
      )}
    </section>
  );
}
