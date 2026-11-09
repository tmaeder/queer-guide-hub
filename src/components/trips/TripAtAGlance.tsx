import { useId } from 'react';
import { BedDouble, CalendarDays, Check, MapPinned, Plane, Wallet } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import type { TripWithDetails } from '@/hooks/useTrips';
import type { Reservation } from '@/hooks/useReservations';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cn } from '@/lib/utils';

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

const DESKTOP_OFFSETS = [
  'xl:translate-y-1',
  'xl:translate-y-8',
  'xl:-translate-y-1',
  'xl:translate-y-9',
  'xl:translate-y-2',
];

export function TripAtAGlance({ trip, reservations }: Props) {
  const { t } = useTranslation();
  const routeClipId = useId().replaceAll(':', '');
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
      complete: transportCount > 0,
    },
    {
      label: t('trips.glance.stay', 'Where you’ll stay'),
      value: stayCount
        ? t('trips.glance.stayCount', { count: stayCount, defaultValue: `${stayCount} stays` })
        : t('trips.glance.addStay', 'Choose a stay'),
      icon: BedDouble,
      href: `/trips/${trip.id}?view=plan&section=prepare`,
      complete: stayCount > 0,
    },
    {
      label: t('trips.glance.events', 'Events'),
      value: eventCount
        ? t('trips.glance.eventCount', { count: eventCount, defaultValue: `${eventCount} saved` })
        : t('trips.glance.findEvents', 'Find an event'),
      icon: CalendarDays,
      href: `/trips/${trip.id}?view=plan&section=plan#trip-itinerary`,
      complete: eventCount > 0,
    },
    {
      label: t('trips.glance.venues', 'Queer places'),
      value: venueCount
        ? t('trips.glance.venueCount', { count: venueCount, defaultValue: `${venueCount} saved` })
        : t('trips.glance.findVenues', 'Add a place'),
      icon: MapPinned,
      href: `/trips/${trip.id}?view=plan&section=plan#trip-itinerary`,
      complete: venueCount > 0,
    },
    {
      label: t('trips.glance.bookings', 'Bookings'),
      value: bookedCount
        ? t('trips.glance.bookingCount', {
            count: bookedCount,
            defaultValue: `${bookedCount} confirmed`,
          })
        : t('trips.glance.reviewBookings', 'Review bookings'),
      icon: Wallet,
      href: `/trips/${trip.id}?view=plan&section=prepare`,
      complete: bookedCount > 0,
    },
  ];
  const currentIndex = items.findIndex((item) => !item.complete);
  const routeProgress = currentIndex < 0 ? 100 : (currentIndex / (items.length - 1)) * 100;

  return (
    <section aria-labelledby="trip-glance-heading" className="mb-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 id="trip-glance-heading" className="text-title font-bold tracking-tight">
          {t('trips.glance.title', 'At a glance')}
        </h2>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          {items.filter((item) => item.complete).length}/{items.length}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-container bg-surface-container px-4 py-6 sm:px-6 xl:min-h-64 xl:px-8 xl:py-8">
        <div
          aria-hidden="true"
          className="absolute bottom-10 left-[2.15rem] top-10 w-1 rounded-full bg-border xl:hidden"
        >
          <span
            className="route-draw route-draw-y block w-full rounded-full bg-track-pink"
            style={{ height: `${routeProgress}%` }}
          />
        </div>

        <svg
          aria-hidden="true"
          className="route-draw absolute inset-x-8 top-11 hidden h-28 w-[calc(100%-4rem)] overflow-visible xl:block"
          viewBox="0 0 1000 140"
          preserveAspectRatio="none"
        >
          <defs>
            <clipPath id={routeClipId}>
              <rect width={`${routeProgress}%`} height="140" />
            </clipPath>
          </defs>
          <path
            d="M 80 54 C 155 54 205 92 280 92 S 410 38 500 38 S 630 98 720 98 S 845 58 920 58"
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="7"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M 80 54 C 155 54 205 92 280 92 S 410 38 500 38 S 630 98 720 98 S 845 58 920 58"
            fill="none"
            stroke="hsl(var(--track-pink))"
            strokeWidth="7"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            clipPath={`url(#${routeClipId})`}
          />
        </svg>

        <ol className="relative grid gap-4 xl:grid-cols-5 xl:gap-6">
          {items.map(({ label, value, icon: Icon, href, complete }, index) => {
            const current = index === currentIndex;
            return (
              <li key={label} className={cn('min-w-0', DESKTOP_OFFSETS[index])}>
                <LocalizedLink
                  to={href}
                  aria-current={current ? 'step' : undefined}
                  className="group flex min-h-24 items-center gap-4 rounded-element bg-background p-4 text-foreground no-underline transition-[transform,box-shadow] duration-normal hover:-translate-y-1 hover:shadow-[0_12px_28px_hsl(var(--foreground)/0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:min-h-36 xl:flex-col xl:items-start"
                >
                  <span
                    className={cn(
                      'relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[4px] border-track-ring transition-transform duration-normal group-hover:rotate-[-4deg] group-hover:scale-105',
                      complete
                        ? 'bg-foreground text-background'
                        : current
                          ? 'bg-track-pink text-track-ring'
                          : 'bg-background text-muted-foreground',
                    )}
                  >
                    {complete ? (
                      <Check className="h-5 w-5" strokeWidth={2.4} aria-hidden />
                    ) : (
                      <Icon className="h-6 w-6" strokeWidth={1.7} aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 xl:mt-auto">
                    <span className="block text-xs font-semibold text-muted-foreground">
                      {label}
                    </span>
                    <span className="mt-1 block text-sm font-bold leading-snug">{value}</span>
                  </span>
                </LocalizedLink>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
