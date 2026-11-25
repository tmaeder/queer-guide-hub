import { useSearchParams } from 'react-router';
import { buildAviasalesUrl } from '@/utils/aviasalesUrl';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useState, useEffect, useRef } from 'react';
import { Search, ArrowRightLeft } from '@/components/icons';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AirportAutocomplete } from './AirportAutocomplete';
import { TravelDealCard } from './TravelDealCard';
import { useTravelDeals } from '@/hooks/useTravelDeals';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';
import { BookingSearchError } from '@/components/booking/BookingSearchError';
import { trackTravelEvent } from '@/utils/travelAnalytics';

interface FlightSearchFormProps {
  active?: boolean;
  initialDestination?: string;
  initialDestinationLabel?: string;
  /** Seed dates (e.g. from the active trip). Initial values only — remount
   *  with a `key` to re-seed. */
  initialDepartureDate?: string;
  initialReturnDate?: string;
}

type FlightSearch = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  originLabel: string;
  destinationLabel: string;
};
const FLIGHT_PARAMS = ['from', 'to', 'departureDate', 'returnDate', 'flightSearch'];
const validDate = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(date)) &&
  new Date(date).toISOString().slice(0, 10) === date;

export function FlightSearchForm(props: FlightSearchFormProps) {
  const [params, setParams] = useSearchParams();
  const from = /^[A-Z]{3}$/.test(params.get('from') || '') ? params.get('from')! : '';
  const to = /^[A-Z]{3}$/.test(params.get('to') || '') ? params.get('to')! : '';
  const departure = params.get('departureDate') || '';
  const returning = params.get('returnDate') || '';
  const validDates =
    (!departure || validDate(departure)) &&
    (!returning || (validDate(returning) && !!departure && returning >= departure));
  const restored: FlightSearch | null =
    params.get('flightSearch') === '1' &&
    (!departure || departure >= format(new Date(), 'yyyy-MM-dd')) &&
    from &&
    (!params.get('to') || to) &&
    validDates
      ? {
          origin: from,
          destination: to,
          departureDate: departure,
          returnDate: returning,
          originLabel: from,
          destinationLabel: to,
        }
      : null;
  return (
    <FlightSearchFields
      key={JSON.stringify(FLIGHT_PARAMS.map((key) => params.get(key)))}
      {...props}
      initialOrigin={from}
      restoredSearch={restored}
      initialDestination={to || props.initialDestination}
      initialDestinationLabel={to ? undefined : props.initialDestinationLabel}
      initialDepartureDate={validDate(departure) ? departure : props.initialDepartureDate}
      initialReturnDate={validDates && returning ? returning : props.initialReturnDate}
      onSearch={(search) =>
        setParams((previous) => {
          const next = new URLSearchParams(previous);
          next.set('tab', 'flights');
          next.set('flightSearch', '1');
          next.set('from', search.origin);
          for (const [key, value] of [
            ['to', search.destination],
            ['departureDate', search.departureDate],
            ['returnDate', search.returnDate],
          ]) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        })
      }
    />
  );
}

function FlightSearchFields({
  active = true,
  initialOrigin,
  initialDestination,
  initialDestinationLabel,
  initialDepartureDate,
  initialReturnDate,
  restoredSearch,
  onSearch,
}: FlightSearchFormProps & {
  initialOrigin: string;
  restoredSearch: FlightSearch | null;
  onSearch: (search: FlightSearch) => void;
}) {
  const { t } = useTranslation();
  const { originIata, originCity, loading: originLoading } = useVisitorOrigin();

  const [origin, setOrigin] = useState(initialOrigin);
  const [originLabel, setOriginLabel] = useState('');
  const [destination, setDestination] = useState(initialDestination || '');
  const [destinationLabel, setDestinationLabel] = useState(initialDestinationLabel || '');
  const [departureDate, setDepartureDate] = useState(initialDepartureDate || '');
  const [returnDate, setReturnDate] = useState(initialReturnDate || '');
  const submittedSearch = restoredSearch;
  const destinationPending = !destination && !!destinationLabel.trim();
  const validRoute =
    /^[A-Z]{3}$/.test(origin) &&
    (!destination || /^[A-Z]{3}$/.test(destination)) &&
    !destinationPending &&
    origin !== destination;
  const today = format(new Date(), 'yyyy-MM-dd');
  const originInitializedRef = useRef(!!initialOrigin);

  // Auto-set origin when visitor origin resolves
  useEffect(() => {
    if (originIata && originCity && !originInitializedRef.current) {
      originInitializedRef.current = true;
      setOrigin(originIata);
      setOriginLabel(`${originCity} (${originIata})`);
    }
  }, [originIata, originCity]);

  const {
    data: deals,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useTravelDeals({
    origin: submittedSearch?.origin,
    destination: submittedSearch?.destination || undefined,
    departureDate: submittedSearch?.departureDate || undefined,
    returnDate: submittedSearch?.returnDate || undefined,
    type: 'flights',
    limit: 10,
    enabled: active && !!submittedSearch?.origin,
  });

  const handleSearch = () => {
    if (validRoute) {
      trackTravelEvent('search_submitted', {
        origin,
        destination: destination || 'any',
        has_departure: !!departureDate,
        has_return: !!returnDate,
      });
      if (
        submittedSearch &&
        origin === submittedSearch.origin &&
        destination === submittedSearch.destination &&
        departureDate === submittedSearch.departureDate &&
        returnDate === submittedSearch.returnDate
      ) {
        void refetch();
      } else {
        onSearch({
          origin,
          destination,
          departureDate,
          returnDate,
          originLabel,
          destinationLabel,
        });
      }
    }
  };

  const handleSwap = () => {
    const tmpCode = origin;
    const tmpLabel = originLabel;
    setOrigin(destination);
    setOriginLabel(destinationLabel);
    setDestination(tmpCode);
    setDestinationLabel(tmpLabel);
  };

  const partnerSearch = submittedSearch?.destination
    ? buildAviasalesUrl({
        origin: submittedSearch.origin,
        destination: submittedSearch.destination,
        departDate: submittedSearch.departureDate,
        returnDate: submittedSearch.returnDate,
      })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="p-4 md:p-6">
          <form
            aria-label="Flight search"
            onSubmit={(event) => {
              event.preventDefault();
              handleSearch();
            }}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
              <AirportAutocomplete
                value={origin}
                displayLabel={originLabel}
                onChange={(iata, label) => {
                  originInitializedRef.current = true;
                  setOrigin(iata);
                  setOriginLabel(label);
                }}
                placeholder={originLoading ? 'Detecting location...' : 'From...'}
                label="From"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleSwap}
                disabled={!origin || !destination}
                aria-label="Swap origin and destination"
                className="justify-self-center rounded-full bg-muted hover:bg-foreground hover:text-background"
              >
                <ArrowRightLeft size={16} />
              </Button>
              <AirportAutocomplete
                value={destination}
                displayLabel={destinationLabel}
                onChange={(iata, label) => {
                  setDestination(iata);
                  setDestinationLabel(label);
                }}
                placeholder="To..."
                label="To"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
              <div>
                <label htmlFor="flight-departure-date" className="text-sm font-medium mb-1 block">
                  Departure
                </label>
                <Input
                  id="flight-departure-date"
                  type="date"
                  value={departureDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDepartureDate(next);
                    if (!next || (returnDate && returnDate < next)) setReturnDate('');
                  }}
                  min={today}
                />
              </div>
              <div>
                <label htmlFor="flight-return-date" className="text-sm font-medium mb-1 block">
                  Return (optional)
                </label>
                <Input
                  id="flight-return-date"
                  type="date"
                  value={returnDate}
                  disabled={!departureDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  min={departureDate || today}
                />
              </div>
              <Button
                type="submit"
                disabled={!validRoute || isFetching}
                className="w-full sm:w-auto"
              >
                <Search size={16} />
                {origin ? 'Search flights' : 'Pick a departure airport'}
              </Button>
            </div>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            {t(
              'pages.travel.book.fareFreshness',
              'Recent fares found by travellers. Availability and final prices are confirmed by the booking partner.',
            )}
          </p>
        </CardContent>
      </Card>

      {submittedSearch && (
        <div>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Searching for deals...</p>
            </div>
          ) : isError ? (
            <BookingSearchError
              message={t(
                'pages.travel.book.flightSearchError',
                'Flight search is unavailable right now. Try again.',
              )}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          ) : deals && deals.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {deals.map((deal, i) => (
                <TravelDealCard
                  key={`${deal.origin}-${deal.destination}-${deal.departure_date}-${i}`}
                  deal={deal}
                  originCity={submittedSearch.originLabel.split(' (')[0] || originCity || undefined}
                  destinationCity={submittedSearch.destinationLabel.split(' (')[0] || undefined}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {t(
                  'pages.travel.book.noCachedFares',
                  'No recent fares match this search. Check availability with the booking partner, or try other dates.',
                )}
              </p>
              {partnerSearch?.valid && partnerSearch.url && (
                <Button asChild className="mt-4">
                  <a href={partnerSearch.url} target="_blank" rel="noopener noreferrer sponsored">
                    {t('pages.travel.book.partnerSearch', 'Search this route on Aviasales')}
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
