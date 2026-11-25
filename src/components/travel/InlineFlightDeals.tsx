import { useState } from 'react';
import { format } from 'date-fns';
import { AirportAutocomplete } from '@/components/travel/AirportAutocomplete';
import { ArrowUpRight } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveBookingUrl } from '@/utils/aviasalesUrl';
import { trackTravelEvent } from '@/utils/travelAnalytics';
import { useCityAirport } from '@/hooks/useCityAirport';
import { useTravelDeals, type TravelDeal } from '@/hooks/useTravelDeals';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';

/**
 * Live fares for the trip's own days, inline: the way out on the first day and
 * the way back on the last. The departure airport starts at the visitor's
 * nearest one (when location is shared) and can be changed in place.
 *
 * Fares are cached prices travellers found recently, so a given day can have
 * none; that is said plainly rather than filled with fares for other dates.
 */
export function InlineFlightDeals({
  cityId,
  city,
  dates,
}: {
  cityId: string;
  city: string;
  dates?: { start: string; end: string } | null;
}) {
  const { originIata, originCity, loading: originLoading } = useVisitorOrigin();
  const [picked, setPicked] = useState<{ iata: string; label: string } | null>(null);
  const origin = picked?.iata || originIata || '';
  const originLabel =
    picked?.label || (originIata && originCity ? `${originCity} (${originIata})` : '');
  const originName = picked ? picked.label.split(' (')[0] : originCity || undefined;

  const { data: destIata, isLoading: destLoading } = useCityAirport(cityId);
  const ready = !!origin && !!destIata && origin !== destIata;
  const out = useTravelDeals({
    origin: origin || undefined,
    destination: destIata || undefined,
    departureDate: dates?.start,
    limit: 3,
    enabled: ready,
  });
  const back = useTravelDeals({
    origin: destIata || undefined,
    destination: origin || undefined,
    departureDate: dates?.end,
    limit: 3,
    enabled: ready && !!dates,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-sm">
        <AirportAutocomplete
          value={origin}
          displayLabel={originLabel}
          onChange={(iata, label) => setPicked({ iata, label })}
          placeholder={originLoading ? 'Detecting location…' : 'Your airport'}
          label="Flying from"
        />
      </div>
      {!origin ? null : destLoading ? (
        <Loading />
      ) : !destIata ? (
        <p className="text-13 text-muted-foreground">No airport listed for {city} yet.</p>
      ) : (
        <>
          <Leg
            label={dates ? `Out · ${format(new Date(dates.start), 'EEE d MMM')}` : 'Out'}
            query={out}
            from={originName || origin}
            to={city}
          />
          {dates && (
            <Leg
              label={`Back · ${format(new Date(dates.end), 'EEE d MMM')}`}
              query={back}
              from={city}
              to={originName || origin}
            />
          )}
          <p className="text-xs text-muted-foreground">
            The cheapest fare travellers found recently for each day. Every flight that day, with
            final prices, at Aviasales.
          </p>
        </>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-2" aria-busy>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} variant="rectangular" className="h-16 rounded-element" />
      ))}
    </div>
  );
}

// ponytail: a fixed bar, not relative to the route's direct time (which the
// fare cache does not give us); 6 h flags e.g. ZRH-BER via a 9 h stopover.
const LONG_LAYOVER_MINUTES = 360;

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

function duration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

/** One fare as a connection row: departure time is local to the departure airport. */
function FlightRow({ deal }: { deal: TravelDeal }) {
  const time = deal.departure_date?.slice(11, 16);
  const flight = deal.airline
    ? `${deal.airline}${deal.flight_number ? ` ${deal.flight_number}` : ''}`
    : null;
  const href = resolveBookingUrl(deal);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      onClick={() =>
        trackTravelEvent('booking_click', {
          origin: deal.origin,
          destination: deal.destination,
          price: deal.price,
          currency: deal.currency,
          url_valid: href.includes('/') && !href.endsWith('/?marker='),
        })
      }
      className="card-lift grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-element bg-card p-4 text-foreground no-underline shadow-soft"
    >
      <span className="flex flex-wrap items-baseline gap-x-2 text-title font-bold tabular-nums">
        {time && <span>{time}</span>}
        <span>
          {deal.origin} → {deal.destination}
        </span>
      </span>
      <span className="row-span-2 flex flex-col items-end gap-0.5">
        <span className="text-title font-bold tabular-nums">
          {money(deal.price, deal.currency)}
        </span>
        <span className="inline-flex items-center gap-1 text-13 font-bold">
          <span className="sr-only sm:not-sr-only">Aviasales</span>
          <ArrowUpRight size={16} aria-hidden />
        </span>
      </span>
      <span className="min-w-0 text-13 text-muted-foreground">
        {[
          deal.duration ? duration(deal.duration) : null,
          deal.stops === 0 ? 'direct' : `${deal.stops} ${deal.stops === 1 ? 'stop' : 'stops'}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        {flight && (
          <>
            {' · '}
            <span className="font-semibold text-foreground">{flight}</span>
          </>
        )}
        {deal.stops > 0 && (deal.duration ?? 0) > LONG_LAYOVER_MINUTES && (
          <span className="ms-2 rounded-badge bg-muted px-1.5 py-0.5 text-2xs font-bold uppercase text-foreground">
            Long layover
          </span>
        )}
      </span>
    </a>
  );
}

function Leg({
  label,
  query,
  from,
  to,
}: {
  label: string;
  query: ReturnType<typeof useTravelDeals>;
  from: string;
  to: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h5 className="text-2xs font-bold uppercase tracking-label text-muted-foreground">{label}</h5>
      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <p className="text-13 text-muted-foreground">
          Fares are unavailable right now. Try again later.
        </p>
      ) : !query.data || query.data.length === 0 ? (
        <p className="text-13 text-muted-foreground">
          No recent fares from {from} to {to} on this day.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {query.data.map((deal, i) => (
            <li key={`${deal.origin}-${deal.destination}-${deal.departure_date}-${i}`}>
              <FlightRow deal={deal} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
