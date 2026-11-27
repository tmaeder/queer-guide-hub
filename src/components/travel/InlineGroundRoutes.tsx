import { format } from 'date-fns';
import { ArrowUpRight, Bus, Car, Map as MapIcon, Ship, Train } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/hooks/useDebounce';
import { useGroundConnections, type GroundConnection } from '@/hooks/useGroundConnections';
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
 * Train and coach modes also list real connections for the first trip day
 * (open-data timetables via Transitous); the booking partners give us no
 * timetables, so each row opens the partner with that day and time filled in.
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
  const timetableMode = mode === 'rail' ? 'rail' : mode === 'transit' ? 'coach' : null;
  const debouncedFrom = useDebounce(from, 600);
  const outbound = useGroundConnections({
    from: debouncedFrom,
    to: city,
    date: dates?.start,
    mode: timetableMode ?? 'rail',
    enabled: !!timetableMode,
  });
  const inbound = useGroundConnections({
    from: city,
    to: debouncedFrom,
    date: dates?.end,
    mode: timetableMode ?? 'rail',
    enabled: !!timetableMode,
  });
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
      {timetableMode && from.length >= 2 && dates && (
        <div className="flex flex-col gap-6">
          {(
            [
              { key: 'out', label: 'Out', date: dates.start, query: outbound, a: from, b: city },
              { key: 'back', label: 'Back', date: dates.end, query: inbound, a: city, b: from },
            ] as const
          ).map((leg) => (
            <Connections
              key={leg.key}
              label={`${leg.label} · ${format(new Date(leg.date), 'EEE d MMM')}`}
              query={leg.query}
              provider={timetableMode === 'rail' ? 'Trainline' : 'FlixBus'}
              linkFor={(c) =>
                timetableMode === 'rail'
                  ? buildTrainlineUrl({
                      origin: leg.a,
                      destination: leg.b,
                      departDate: leg.date,
                      departTime: localTime(c.departure, c.departureTz),
                      adults: travellers,
                    })
                  : buildFlixbusUrl({
                      origin: leg.a,
                      destination: leg.b,
                      departDate: leg.date,
                      adults: travellers,
                    })
              }
            />
          ))}
          {!(outbound.isError && inbound.isError) && (
            <p className="text-xs text-muted-foreground">
              Timetables from Transitous (open data). Prices and booking at{' '}
              {timetableMode === 'rail' ? 'Trainline' : 'FlixBus'}.
            </p>
          )}
        </div>
      )}
      {timetableMode ? (
        cards.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-13">
            <span className="text-muted-foreground">More options</span>
            {cards.map((card) => (
              <a
                key={card.key}
                href={card.href}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="inline-flex items-center gap-1 font-bold no-underline hover:underline"
              >
                {card.title}
                <ArrowUpRight size={14} aria-hidden />
              </a>
            ))}
          </p>
        )
      ) : (
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
      )}
      {from.length < 2 && mode !== 'drive' && (
        <p className="text-13 text-muted-foreground">Add where you start to see routes.</p>
      )}
    </div>
  );
}

function localTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso));
}

function localDay(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));
}

function duration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

/** Real departures for one day; silent when the timetable service is down. */
function Connections({
  label,
  query,
  linkFor,
  provider,
}: {
  label: string;
  query: ReturnType<typeof useGroundConnections>;
  linkFor: (connection: GroundConnection) => string;
  provider: string;
}) {
  if (query.isError) return null;
  if (query.isLoading || query.isFetching) {
    return (
      <div className="flex flex-col gap-2" aria-busy>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" className="h-16 rounded-element" />
        ))}
      </div>
    );
  }
  const list = query.data ?? [];
  return (
    <div className="flex flex-col gap-2">
      <h5 className="text-2xs font-bold uppercase tracking-label text-muted-foreground">{label}</h5>
      {list.length === 0 ? (
        <p className="text-13 text-muted-foreground">No timetable found for this day.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {list.map((c) => {
            const nextDay = localDay(c.arrival, c.arrivalTz) > localDay(c.departure, c.departureTz);
            return (
              <li key={`${c.departure}-${c.lines.join('+')}`}>
                <a
                  href={linkFor(c)}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="card-lift grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-element bg-card p-4 text-foreground no-underline shadow-soft"
                >
                  <span className="flex flex-wrap items-baseline gap-x-2 text-title font-bold tabular-nums">
                    {localTime(c.departure, c.departureTz)} → {localTime(c.arrival, c.arrivalTz)}
                    {nextDay && (
                      <span className="text-13 font-bold text-muted-foreground">+1 day</span>
                    )}
                  </span>
                  <span className="row-span-2 inline-flex items-center gap-1 text-13 font-bold">
                    <span className="sr-only sm:not-sr-only">{provider}</span>
                    <ArrowUpRight size={16} aria-hidden />
                  </span>
                  <span className="min-w-0 text-13 text-muted-foreground">
                    {duration(c.durationMinutes)} ·{' '}
                    {c.transfers === 0
                      ? 'direct'
                      : `${c.transfers} ${c.transfers === 1 ? 'change' : 'changes'}`}{' '}
                    · <span className="font-semibold text-foreground">{c.lines.join(' · ')}</span>
                    <span className="block truncate">
                      {c.fromStop} → {c.toStop}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
