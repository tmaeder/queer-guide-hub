import { format } from 'date-fns';
import { Bus, Car, Map as MapIcon, Ship, Train } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { CarRentalSection } from '@/components/travel/CarRentalSection';
import { TravelLinkCard } from '@/components/travel/TravelLinkCard';
import { buildFlixbusUrl } from '@/utils/transport/flixbusUrl';
import { buildOmioUrl } from '@/utils/transport/omioUrl';
import { buildTrainlineUrl } from '@/utils/transport/trainlineUrl';

export type GroundMode = 'rail' | 'transit' | 'ferry' | 'drive';

function mapsRoute(origin: string, destination: string, travelmode: 'transit' | 'driving') {
  const params = new URLSearchParams({ api: '1', origin, destination, travelmode });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Ground routes to the package city, inline. The starting point is prefilled
 * from the visitor's city and editable in place; every card already carries
 * the route, trip dates and party size, so there is no separate search step.
 * No provider exposes timetables to us, so the cards open the provider's
 * results rather than listing departures.
 */
export function InlineGroundRoutes({
  mode,
  city,
  origin,
  onOriginChange,
  dates,
  travellers,
}: {
  mode: GroundMode;
  city: string;
  origin: string;
  onOriginChange: (value: string) => void;
  dates: { start: string; end: string } | null;
  travellers: number;
}) {
  const from = origin.trim();
  const when = dates
    ? `${format(new Date(dates.start), 'EEE d MMM')} – ${format(new Date(dates.end), 'EEE d MMM')}`
    : null;
  const note = [when, `${travellers} ${travellers === 1 ? 'person' : 'people'}`]
    .filter(Boolean)
    .join(' · ');
  const route = `${from} → ${city}`;
  const trip = {
    origin: from,
    destination: city,
    departDate: dates?.start,
    returnDate: dates?.end,
    adults: travellers,
  };

  const cards =
    from.length < 2
      ? []
      : mode === 'rail'
        ? [
            {
              key: 'trainline',
              icon: Train,
              title: 'Trainline',
              cta: 'See trains',
              href: buildTrainlineUrl(trip),
            },
            {
              key: 'omio',
              icon: Train,
              title: 'Omio',
              cta: 'Compare trains',
              href: buildOmioUrl({ ...trip, mode: 'trains' }),
            },
          ]
        : mode === 'transit'
          ? [
              {
                key: 'flixbus',
                icon: Bus,
                title: 'FlixBus',
                cta: 'See coaches',
                href: buildFlixbusUrl(trip),
              },
              {
                key: 'omio',
                icon: Bus,
                title: 'Omio',
                cta: 'Compare coaches',
                href: buildOmioUrl({ ...trip, mode: 'buses' }),
              },
            ]
          : mode === 'ferry'
            ? [
                {
                  key: 'omio',
                  icon: Ship,
                  title: 'Omio',
                  cta: 'Ferries, trains and buses',
                  href: buildOmioUrl(trip),
                },
                {
                  key: 'maps',
                  icon: MapIcon,
                  title: 'Google Maps',
                  cta: 'Route with crossings',
                  href: mapsRoute(from, city, 'transit'),
                },
              ]
            : [
                {
                  key: 'maps',
                  icon: Car,
                  title: 'Google Maps',
                  cta: 'Driving route',
                  href: mapsRoute(from, city, 'driving'),
                },
              ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-sm flex-col gap-1.5">
        <label htmlFor="package-origin" className="text-sm font-medium">
          {mode === 'drive' ? 'Driving from' : 'Travelling from'}
        </label>
        <Input
          id="package-origin"
          value={origin}
          onChange={(event) => onOriginChange(event.target.value)}
          placeholder="Your city"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <TravelLinkCard
            key={card.key}
            icon={card.icon}
            title={card.title}
            note={
              <>
                <span className="block font-semibold text-foreground">{route}</span>
                {note}
              </>
            }
            cta={card.cta}
            href={card.href}
          />
        ))}
        {mode === 'drive' && (
          <CarRentalSection city={city} checkIn={dates?.start} checkOut={dates?.end} compact />
        )}
      </div>
      {from.length < 2 && mode !== 'drive' && (
        <p className="text-13 text-muted-foreground">Add where you start to see routes.</p>
      )}
    </div>
  );
}
