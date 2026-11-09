import { BedDouble, CalendarHeart, MapPinned, Plane, WalletCards } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TripWithDetails } from '@/hooks/useTrips';
import type { Reservation } from '@/hooks/useTripReservations';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

interface Props {
  trip: TripWithDetails;
  reservations: Reservation[];
}

const TRANSPORT_TYPES = new Set([
  'flight',
  'train',
  'rail',
  'coach',
  'bus',
  'ferry',
  'car',
  'transfer',
  'transport',
]);
const STAY_TYPES = new Set([
  'hotel',
  'lodging',
  'accommodation',
  'hostel',
  'apartment',
  'bnb',
  'b&b',
]);

export function TripAtAGlance({ trip, reservations }: Props) {
  const { t } = useTranslation();
  const transportCount =
    trip.trip_places.filter((place) => Boolean(place.arrive_mode)).length +
    reservations.filter((reservation) => TRANSPORT_TYPES.has(reservation.type.toLowerCase()))
      .length;
  const stayCount =
    trip.trip_places.filter((place) => Boolean(place.hotel_id)).length +
    reservations.filter((reservation) => STAY_TYPES.has(reservation.type.toLowerCase())).length;
  const eventCount = trip.trip_places.filter((place) => Boolean(place.event_id)).length;
  const venueCount = trip.trip_places.filter((place) => Boolean(place.venue_id)).length;
  const bookedCount = reservations.filter(
    (reservation) => reservation.status === 'confirmed',
  ).length;

  const items = [
    {
      label: t('trips.glance.transport', 'Getting there'),
      value: transportCount
        ? t('trips.glance.transportCount', {
            count: transportCount,
            defaultValue: `${transportCount} routes`,
          })
        : t('trips.glance.addTransport', 'Add transport'),
      icon: Plane,
      href: `/trips/${trip.id}?view=plan&section=prepare`,
    },
    {
      label: t('trips.glance.stay', 'Where you’ll stay'),
      value: stayCount
        ? t('trips.glance.stayCount', { count: stayCount, defaultValue: `${stayCount} stays` })
        : t('trips.glance.addStay', 'Choose a stay'),
      icon: BedDouble,
      href: `/trips/${trip.id}?view=plan&section=prepare`,
    },
    {
      label: t('trips.glance.events', 'Events'),
      value: eventCount
        ? t('trips.glance.eventCount', { count: eventCount, defaultValue: `${eventCount} saved` })
        : t('trips.glance.findEvents', 'Find an event'),
      icon: CalendarHeart,
      href: `/trips/${trip.id}?view=plan&section=plan#trip-itinerary`,
    },
    {
      label: t('trips.glance.venues', 'Queer places'),
      value: venueCount
        ? t('trips.glance.venueCount', { count: venueCount, defaultValue: `${venueCount} saved` })
        : t('trips.glance.findVenues', 'Add a place'),
      icon: MapPinned,
      href: `/trips/${trip.id}?view=plan&section=plan#trip-itinerary`,
    },
    {
      label: t('trips.glance.bookings', 'Bookings'),
      value: bookedCount
        ? t('trips.glance.bookingCount', {
            count: bookedCount,
            defaultValue: `${bookedCount} confirmed`,
          })
        : t('trips.glance.reviewBookings', 'Review bookings'),
      icon: WalletCards,
      href: `/trips/${trip.id}?view=plan&section=prepare`,
    },
  ];

  return (
    <section aria-labelledby="trip-glance-heading" className="mb-8">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground">
            {t('trips.glance.eyebrow', 'YOUR TRIP')}
          </p>
          <h2 id="trip-glance-heading" className="mt-1 text-title font-bold tracking-tight">
            {t('trips.glance.title', 'At a glance')}
          </h2>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {items.map(({ label, value, icon: Icon, href }) => (
          <LocalizedLink
            key={label}
            to={href}
            className="group min-h-28 rounded-container bg-surface-container p-4 text-foreground no-underline transition-[background-color,transform] duration-normal hover:-translate-y-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon
              className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-foreground"
              strokeWidth={1.7}
              aria-hidden
            />
            <p className="mt-4 text-xs font-semibold text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-semibold">{value}</p>
          </LocalizedLink>
        ))}
      </div>
    </section>
  );
}
