import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Plane, Hotel, Ticket, TrendingUp, X, Train, Bus, ArrowRight } from '@/components/icons';
import { useQuery } from '@tanstack/react-query';
import { fetchHotelsPage } from '@/hooks/useHotels';
import { HotelCard } from '@/components/hotels/HotelCard';
import { FilterChip } from '@/components/transit/FilterChip';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { buildTrainlineUrl } from '@/utils/transport/trainlineUrl';
import { buildFlixbusUrl } from '@/utils/transport/flixbusUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FlightSearchForm } from '@/components/travel/FlightSearchForm';
import {
  HotelSearchForm,
  HOTEL_TYPE_OPTIONS,
  type HotelSearchParams,
  type HotelTypeOption,
} from '@/components/booking/HotelSearchForm';
import { TravelDealCard } from '@/components/travel/TravelDealCard';
import { BookingSearchError } from '@/components/booking/BookingSearchError';
import { UnifiedBookingCard } from '@/components/booking/UnifiedBookingCard';
import { useTravelDeals } from '@/hooks/useTravelDeals';
import { useHotelSearch } from '@/hooks/useHotelSearch';
import { useActivitySearch } from '@/hooks/useActivitySearch';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';
import { useRecommendations } from '@/hooks/useRecommendations';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { formatEventDateLabel } from '@/hooks/useGoNowDestinations';
import type { TripBookingContext } from '@/hooks/useTripBookingContext';
import type { BookingResult } from '@/lib/booking/types';

type BookingTab = 'flights' | 'hotels' | 'activities';

const TAB_CONFIG: { value: BookingTab; label: string; hint: string; icon: typeof Plane }[] = [
  { value: 'flights', label: 'Flights', hint: 'Live fares and deals', icon: Plane },
  { value: 'hotels', label: 'Hotels', hint: 'Stays with queer-friendly filter', icon: Hotel },
  { value: 'activities', label: 'Activities', hint: 'Tours and tickets by city', icon: Ticket },
];

const HOTEL_TYPE_LABEL_FALLBACK: Record<HotelTypeOption, string> = {
  all: 'Any type',
  hotel: 'Hotel',
  boutique: 'Boutique Hotel',
  bnb: 'B&B',
  hostel: 'Hostel',
  guesthouse: 'Guesthouse',
  apartment: 'Apartment',
  resort: 'Resort',
};

function parseUrlType(raw: string | null): HotelTypeOption | undefined {
  if (!raw) return undefined;
  return (HOTEL_TYPE_OPTIONS as readonly string[]).includes(raw)
    ? (raw as HotelTypeOption)
    : undefined;
}

function parseUrlBound(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

interface HotelSearchState {
  city: string;
  checkIn?: string;
  checkOut?: string;
  guests: number;
  hotelType?: HotelTypeOption;
  priceMin?: number;
  priceMax?: number;
  lgbtqFriendlyOnly?: boolean;
}

interface Props {
  /** Whether the accordion starts expanded (true when ?intent=book). */
  defaultOpen?: boolean;
  /** Active-trip context (from useTripBookingContext). Seeds the search forms
   *  when the URL carries no explicit search — URL params always win. */
  tripContext?: TripBookingContext | null;
}

export function BookNowAccordion({ defaultOpen = false, tripContext = null }: Props) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  // ?tab= / ?city= deep links (TripBookingAssistant, CityTravelHub, /travel/book)
  // must land expanded, not just seed a hidden tab.
  const [open, setOpen] = useState(
    () => defaultOpen || !!searchParams.get('tab') || !!searchParams.get('city'),
  );

  const tabParam = searchParams.get('tab');
  const activeTab: BookingTab =
    tabParam === 'hotels' || tabParam === 'activities' ? tabParam : 'flights';
  const initialTo = searchParams.get('to') || undefined;
  const initialCity = searchParams.get('city') || undefined;
  const initialCheckIn = searchParams.get('checkIn') || undefined;
  const initialCheckOut = searchParams.get('checkOut') || undefined;
  const initialGuestsParam = searchParams.get('guests');
  const initialGuests = initialGuestsParam ? parseInt(initialGuestsParam, 10) || 2 : 2;
  const initialHotelType = parseUrlType(searchParams.get('type'));
  const initialPriceMin = parseUrlBound(searchParams.get('priceMin'));
  const initialPriceMax = parseUrlBound(searchParams.get('priceMax'));
  const initialLgbtqOnly = searchParams.get('lgbtqOnly') === '1';

  // URL state is authoritative, including browser Back/Forward navigation.
  const [tripHotelSearch, setHotelSearch] = useState<HotelSearchState | null>(null);
  const hotelSearch: HotelSearchState | null = initialCity
    ? {
        city: initialCity,
        checkIn: initialCheckIn,
        checkOut: initialCheckOut,
        guests: initialGuests,
        hotelType: initialHotelType,
        priceMin: initialPriceMin,
        priceMax: initialPriceMax,
        lgbtqFriendlyOnly: initialLgbtqOnly || undefined,
      }
    : tripHotelSearch;

  // Trip-context seeding: URL params > tripContext > empty. The `change`
  // button drops the trip seed for this mount without touching the trip.
  const [ignoreTripContext, setIgnoreTripContext] = useState(false);
  const tripCtx = ignoreTripContext ? null : tripContext;
  const urlOverridesTrip = !!initialCity || !!initialTo;
  const tripSeeding = !!tripCtx?.cityName && !urlOverridesTrip;
  const tripDates = tripCtx?.checkIn ? formatEventDateLabel(tripCtx.checkIn, tripCtx.checkOut) : '';

  const { originIata, originCity, loading: originLoading } = useVisitorOrigin();

  const {
    data: popularDeals,
    isLoading: flightsLoading,
    isError: flightsError,
    refetch: retryFlights,
    isFetching: flightsFetching,
  } = useTravelDeals({
    origin: originIata || undefined,
    type: 'popular_routes',
    limit: 9,
    enabled: open && !!originIata && activeTab === 'flights',
  });

  const {
    data: hotelResults,
    isLoading: hotelsLoading,
    isError: hotelsError,
    refetch: retryHotels,
    isFetching: hotelsFetching,
  } = useHotelSearch({
    city: hotelSearch?.city,
    checkIn: hotelSearch?.checkIn,
    checkOut: hotelSearch?.checkOut,
    guests: hotelSearch?.guests,
    hotelType: hotelSearch?.hotelType,
    priceMin: hotelSearch?.priceMin,
    priceMax: hotelSearch?.priceMax,
    lgbtqFriendlyOnly: hotelSearch?.lgbtqFriendlyOnly,
    enabled: open && activeTab === 'hotels' && !!hotelSearch?.city,
  });

  const [tripActivityCity, setTripActivityCity] = useState('');
  const activityCity = initialCity || tripActivityCity;

  // Trips load async — seed the not-yet-touched forms once the context lands.
  // One-shot; never overwrites URL params or user input.
  const tripSeededRef = useRef(false);
  useEffect(() => {
    if (!tripSeeding || tripSeededRef.current) return;
    tripSeededRef.current = true;
    const city = tripCtx!.cityName!;
    setHotelSearch(
      (prev) =>
        prev ?? {
          city,
          checkIn: tripCtx!.checkIn ?? undefined,
          checkOut: tripCtx!.checkOut ?? undefined,
          guests: 2,
        },
    );
    setTripActivityCity((prev) => prev || city);
  }, [tripSeeding, tripCtx]);
  const {
    data: activityResults,
    isLoading: activitiesLoading,
    isError: activitiesError,
    refetch: retryActivities,
    isFetching: activitiesFetching,
  } = useActivitySearch({
    city: activityCity || undefined,
    limit: 9,
    enabled: open && activeTab === 'activities' && !!activityCity,
  });

  const visibleResults = activeTab === 'hotels' ? hotelResults : activityResults;
  const { data: recs } = useRecommendations({
    recType: 'destination',
    limit: 20,
    enabled:
      open &&
      activeTab !== 'flights' &&
      !!visibleResults?.some((result) => result.providerData?.cityId),
  });
  const { track } = useTrackEvent();

  const recCityIds = new Set((recs || []).map((r) => r.entity_id));
  const usePersonalized = recCityIds.size > 0;
  const abGroup =
    typeof window !== 'undefined'
      ? parseInt(sessionStorage.getItem('qg_session_id')?.slice(-2) || '0', 16) % 2 === 0
        ? 'personalized'
        : 'control'
      : 'control';

  const rankResults = <T extends BookingResult>(results: T[]): T[] => {
    if (!usePersonalized || abGroup !== 'personalized') return results;
    return [...results].sort((a, b) => {
      const aBoost =
        a.providerData?.cityId && recCityIds.has(a.providerData.cityId as string) ? 10 : 0;
      const bBoost =
        b.providerData?.cityId && recCityIds.has(b.providerData.cityId as string) ? 10 : 0;
      return bBoost - aBoost || a.price - b.price;
    });
  };

  const handleTabChange = (value: BookingTab) => {
    setSearchParams((prev) => {
      prev.set('tab', value);
      return prev;
    });
  };

  const syncHotelParamsToUrl = (params: HotelSearchParams) => {
    setSearchParams((prev) => {
      prev.set('tab', 'hotels');
      prev.set('city', params.city);
      if (params.checkIn) prev.set('checkIn', params.checkIn);
      else prev.delete('checkIn');
      if (params.checkOut) prev.set('checkOut', params.checkOut);
      else prev.delete('checkOut');
      prev.set('guests', String(params.guests));
      if (params.hotelType) prev.set('type', params.hotelType);
      else prev.delete('type');
      if (params.priceMin !== undefined) prev.set('priceMin', String(params.priceMin));
      else prev.delete('priceMin');
      if (params.priceMax !== undefined) prev.set('priceMax', String(params.priceMax));
      else prev.delete('priceMax');
      if (params.lgbtqFriendlyOnly) prev.set('lgbtqOnly', '1');
      else prev.delete('lgbtqOnly');
      return prev;
    });
  };

  const handleActivitySearch = (value: string) => {
    const city = value.trim();
    if (!city) return;
    setSearchParams((prev) => {
      prev.set('tab', 'activities');
      prev.set('city', city);
      return prev;
    });
  };

  const [travelMode, setTravelMode] = useState<'flight' | 'rail' | 'coach'>('flight');
  const stayCity = hotelSearch?.city?.trim() || '';
  const {
    data: ownStays,
    isLoading: ownStaysLoading,
    isError: ownStaysError,
    refetch: retryOwnStays,
    isFetching: ownStaysFetching,
  } = useQuery({
    queryKey: ['book-own-stays', stayCity.toLowerCase()],
    enabled: open && activeTab === 'hotels' && stayCity.length > 1,
    queryFn: () => fetchHotelsPage({ city: stayCity }, { pageSize: 6 }).then((r) => r.hotels),
    retry: false,
    staleTime: 10 * 60_000,
  });
  const searchHotelCity = (city: string) =>
    handleHotelSearch({ city, guests: hotelSearch?.guests ?? initialGuests ?? 2 });

  const handleHotelSearch = (params: HotelSearchParams) => {
    syncHotelParamsToUrl(params);
    track({
      eventType: 'search',
      metadata: { surface: 'travel_book_now', vertical: 'hotel', city: params.city },
    });
  };

  const clearHotelFilter = (key: 'hotelType' | 'priceMin' | 'priceMax' | 'lgbtqFriendlyOnly') => {
    if (!hotelSearch) return;
    const next: HotelSearchState = { ...hotelSearch, [key]: undefined };
    syncHotelParamsToUrl(next);
  };

  const clearAllHotelFilters = () => {
    if (!hotelSearch) return;
    const next: HotelSearchState = {
      city: hotelSearch.city,
      checkIn: hotelSearch.checkIn,
      checkOut: hotelSearch.checkOut,
      guests: hotelSearch.guests,
    };
    syncHotelParamsToUrl(next);
  };

  const hasActiveHotelFilters =
    !!hotelSearch &&
    (hotelSearch.hotelType !== undefined ||
      hotelSearch.priceMin !== undefined ||
      hotelSearch.priceMax !== undefined ||
      hotelSearch.lgbtqFriendlyOnly === true);

  return (
    <section className=" bg-surface-container mb-8 rounded-element" data-testid="book-now-section">
      <div className="p-4 sm:p-6">
        <p className="hidden text-sm text-muted-foreground sm:block">
          {t(
            'pages.travel.bookNow.subtitle',
            'Search flights, hotels, and activities directly — no trip required.',
          )}
        </p>
        {open && tripSeeding && (
          <p className="mt-4 text-13 text-muted-foreground" data-testid="trip-context-banner">
            {t('pages.travel.bookNow.tripContext', 'Searching for your {{city}} trip', {
              city: tripCtx!.cityName,
            })}
            {tripDates ? ` · ${tripDates}` : ''}{' '}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => setIgnoreTripContext(true)}
            >
              {t('pages.travel.bookNow.tripContextChange', 'change')}
            </button>
          </p>
        )}
        <div
          role="group"
          aria-label={t('pages.travel.bookNow.title', 'Book now')}
          className="grid grid-cols-3 gap-2 sm:mt-6 sm:gap-4"
        >
          {TAB_CONFIG.map(({ value, label, hint, icon: Icon }) => {
            const active = open && activeTab === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (active) {
                    setOpen(false);
                    return;
                  }
                  setOpen(true);
                  handleTabChange(value);
                }}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-element border px-2 py-3 text-left transition-colors sm:justify-start sm:gap-4 sm:p-4 ${
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background hover:border-foreground/50'
                }`}
              >
                <span
                  className={`hidden h-11 w-11 shrink-0 place-items-center rounded-full sm:grid ${active ? 'bg-background text-foreground' : 'bg-muted'}`}
                  aria-hidden
                >
                  <Icon size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold">{label}</span>{' '}
                  <span
                    className={`sr-only text-xs sm:not-sr-only sm:block ${active ? 'text-background/70' : 'text-muted-foreground'}`}
                  >
                    {hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {open && (
        <div className="border-t border-border-hairline">
          <div className="p-4 sm:p-6">
            {activeTab === 'flights' && (
              <div
                className="mb-4 flex flex-wrap gap-2"
                role="group"
                aria-label={t('pages.travel.book.mode', 'Travel by')}
              >
                {(
                  [
                    ['flight', Plane, t('pages.travel.book.fly', 'Fly')],
                    ['rail', Train, t('pages.travel.book.train', 'Train')],
                    ['coach', Bus, t('pages.travel.book.coach', 'Coach')],
                  ] as const
                ).map(([mode, Icon, label]) => (
                  <FilterChip
                    key={mode}
                    active={travelMode === mode}
                    onClick={() => setTravelMode(mode)}
                    label={
                      <>
                        <Icon size={16} aria-hidden />
                        {label}
                      </>
                    }
                  />
                ))}
              </div>
            )}
            {activeTab === 'flights' && travelMode !== 'flight' && (
              <GroundSearch mode={travelMode} />
            )}
            {activeTab === 'flights' && travelMode === 'flight' && (
              <FlightSearchForm
                // Remount when the trip seed lands so the one-shot useState
                // initializers pick it up (URL params still win).
                key={initialTo ?? (tripSeeding ? (tripCtx!.destinationIata ?? 'trip') : 'none')}
                initialDestination={
                  initialTo ?? (tripSeeding ? (tripCtx!.destinationIata ?? undefined) : undefined)
                }
                initialDestinationLabel={
                  !initialTo && tripSeeding ? (tripCtx!.destinationLabel ?? undefined) : undefined
                }
                initialDepartureDate={
                  !initialTo && tripSeeding ? (tripCtx!.checkIn ?? undefined) : undefined
                }
                initialReturnDate={
                  !initialTo && tripSeeding ? (tripCtx!.checkOut ?? undefined) : undefined
                }
              />
            )}
            {activeTab === 'hotels' && (
              <HotelSearchForm
                key={JSON.stringify(hotelSearch)}
                initialCity={hotelSearch?.city}
                initialCheckIn={hotelSearch?.checkIn}
                initialCheckOut={hotelSearch?.checkOut}
                initialGuests={hotelSearch?.guests ?? initialGuests}
                initialHotelType={hotelSearch?.hotelType}
                initialPriceMin={hotelSearch?.priceMin}
                initialPriceMax={hotelSearch?.priceMax}
                initialLgbtqFriendlyOnly={hotelSearch?.lgbtqFriendlyOnly}
                onSearch={handleHotelSearch}
              />
            )}
            {activeTab === 'activities' && (
              <ActivitySearchForm
                key={activityCity}
                initialCity={activityCity}
                onSearch={handleActivitySearch}
              />
            )}
          </div>

          {activeTab === 'flights' && travelMode === 'flight' && (
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={20} />
                <h2 className="text-base font-bold tracking-tight">
                  {originCity ? `Popular deals from ${originCity}` : 'Popular flight deals'}
                </h2>
              </div>
              {originLoading || flightsLoading ? (
                <ResultsGrid>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-[140px]" />
                  ))}
                </ResultsGrid>
              ) : flightsError ? (
                <BookingSearchError
                  message={t(
                    'pages.travel.book.dealsError',
                    'Popular flight deals are unavailable right now. Try again.',
                  )}
                  onRetry={() => void retryFlights()}
                  retrying={flightsFetching}
                />
              ) : popularDeals && popularDeals.length > 0 ? (
                <ResultsGrid>
                  {popularDeals.map((deal, i) => (
                    <TravelDealCard
                      key={`${deal.origin}-${deal.destination}-${i}`}
                      deal={deal}
                      originCity={originCity || undefined}
                    />
                  ))}
                </ResultsGrid>
              ) : (
                <EmptyState
                  icon={Plane}
                  title={t('pages.travel.book.dealsEmptyTitle', 'Where to next?')}
                >
                  {originIata
                    ? t(
                        'pages.travel.book.dealsEmpty',
                        'No live deals right now. Pick a route above and we compare fares for you.',
                      )
                    : t(
                        'pages.travel.book.dealsEmptyNoOrigin',
                        'Pick a route above, or allow location to see deals from your nearest airport.',
                      )}
                </EmptyState>
              )}
            </div>
          )}

          {activeTab === 'hotels' && (
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Hotel size={20} />
                <h2 className="text-base font-bold tracking-tight">
                  {hotelSearch?.city ? `Stays in ${hotelSearch.city}` : 'Search for stays'}
                </h2>
              </div>

              {stayCity && (ownStaysLoading || (ownStays && ownStays.length > 0)) && (
                <div className="mb-8">
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
                        {t('pages.travel.book.ownStaysEyebrow', 'On queer.guide')}
                      </p>
                      <p className="text-15 font-bold">
                        {t(
                          'pages.travel.book.ownStaysTitle',
                          'Queer-run B&Bs, guesthouses and private stays',
                        )}
                      </p>
                    </div>
                    <LocalizedLink
                      to={`/hotels?city=${encodeURIComponent(stayCity)}`}
                      className="inline-flex shrink-0 items-center gap-1 text-13 font-bold no-underline hover:underline"
                    >
                      {t('pages.travel.book.ownStaysAll', 'See all')}
                      <ArrowRight size={14} aria-hidden />
                    </LocalizedLink>
                  </div>
                  <ResultsGrid>
                    {ownStaysLoading
                      ? [1, 2, 3].map((i) => <HotelCard key={i} loading />)
                      : ownStays!.map((h) => <HotelCard key={h.id} hotel={h} />)}
                  </ResultsGrid>
                </div>
              )}

              {hasActiveHotelFilters && hotelSearch && (
                <div className="flex flex-wrap gap-2 mb-4 items-center">
                  {hotelSearch.hotelType && (
                    <Badge variant="secondary" className="inline-flex items-center gap-1">
                      {`${t('pages.travel.hotels.typeLabel', 'Type')}: ${t(`pages.travel.hotels.type.${hotelSearch.hotelType}`, HOTEL_TYPE_LABEL_FALLBACK[hotelSearch.hotelType])}`}
                      <button
                        type="button"
                        onClick={() => clearHotelFilter('hotelType')}
                        aria-label="Clear"
                      >
                        <X size={12} />
                      </button>
                    </Badge>
                  )}
                  {hotelSearch.priceMin !== undefined && (
                    <Badge variant="secondary" className="inline-flex items-center gap-1">
                      {`≥ €${hotelSearch.priceMin}`}
                      <button
                        type="button"
                        onClick={() => clearHotelFilter('priceMin')}
                        aria-label="Clear"
                      >
                        <X size={12} />
                      </button>
                    </Badge>
                  )}
                  {hotelSearch.priceMax !== undefined && (
                    <Badge variant="secondary" className="inline-flex items-center gap-1">
                      {`≤ €${hotelSearch.priceMax}`}
                      <button
                        type="button"
                        onClick={() => clearHotelFilter('priceMax')}
                        aria-label="Clear"
                      >
                        <X size={12} />
                      </button>
                    </Badge>
                  )}
                  {hotelSearch.lgbtqFriendlyOnly && (
                    <Badge variant="secondary" className="inline-flex items-center gap-1">
                      LGBTQ+ friendly
                      <button
                        type="button"
                        onClick={() => clearHotelFilter('lgbtqFriendlyOnly')}
                        aria-label="Clear"
                      >
                        <X size={12} />
                      </button>
                    </Badge>
                  )}
                  <Button size="sm" variant="outline" onClick={clearAllHotelFilters}>
                    {t('pages.travel.hotels.clearFilters', 'Clear filters')}
                  </Button>
                </div>
              )}

              {ownStaysError && (
                <BookingSearchError
                  message={t(
                    'pages.travel.book.ownStaysError',
                    'Queer Guide stays could not be loaded. Try again.',
                  )}
                  onRetry={() => void retryOwnStays()}
                  retrying={ownStaysFetching}
                />
              )}
              {hotelsLoading ? (
                <ResultsGrid>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-[240px]" />
                  ))}
                </ResultsGrid>
              ) : hotelsError ? (
                <BookingSearchError
                  message={t(
                    'pages.travel.book.hotelsError',
                    'Partner hotel search is unavailable right now. Try again.',
                  )}
                  onRetry={() => void retryHotels()}
                  retrying={hotelsFetching}
                />
              ) : hotelResults && hotelResults.length > 0 ? (
                <ResultsGrid>
                  {rankResults(hotelResults).map((hotel) => (
                    <UnifiedBookingCard key={hotel.id} result={hotel} />
                  ))}
                </ResultsGrid>
              ) : hotelSearch && hasActiveHotelFilters ? (
                <EmptyState>
                  <div className="flex flex-col items-center gap-4">
                    <span>
                      {t(
                        'pages.travel.hotels.noResultsWithFilters',
                        'No hotels match your filters in {{city}}.',
                        {
                          city: hotelSearch.city,
                        },
                      )}
                    </span>
                    <Button size="sm" variant="outline" onClick={clearAllHotelFilters}>
                      Clear filters
                    </Button>
                  </div>
                </EmptyState>
              ) : hotelSearch ? (
                ownStays && ownStays.length > 0 ? null : (
                  <EmptyState
                    icon={Hotel}
                    title={t('pages.travel.book.staysEmptyTitle', 'Nothing bookable here yet')}
                    suggestions={SUGGESTED_CITIES.filter(
                      (c) => c.toLowerCase() !== hotelSearch.city.toLowerCase(),
                    )}
                    onSuggest={searchHotelCity}
                  >
                    {t(
                      'pages.travel.book.staysEmpty',
                      'No partner stays came back for {{city}}. Try one of these queer favourites:',
                      { city: hotelSearch.city },
                    )}
                  </EmptyState>
                )
              ) : (
                <EmptyState
                  icon={Hotel}
                  title={t('pages.travel.book.staysStartTitle', 'Where do you want to wake up?')}
                  suggestions={SUGGESTED_CITIES}
                  onSuggest={searchHotelCity}
                >
                  {t(
                    'pages.travel.book.staysStart',
                    'Search a city, or start with one of these queer favourites:',
                  )}
                </EmptyState>
              )}
            </div>
          )}

          {activeTab === 'activities' && (
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Ticket size={20} />
                <h2 className="text-base font-bold tracking-tight">
                  {activityCity ? `Activities in ${activityCity}` : 'Search for activities'}
                </h2>
              </div>
              {activitiesLoading ? (
                <ResultsGrid>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-[200px]" />
                  ))}
                </ResultsGrid>
              ) : activitiesError ? (
                <BookingSearchError
                  message={t(
                    'pages.travel.book.activitiesError',
                    'Activity search is unavailable right now. Try again.',
                  )}
                  onRetry={() => void retryActivities()}
                  retrying={activitiesFetching}
                />
              ) : activityResults && activityResults.length > 0 ? (
                <ResultsGrid>
                  {rankResults(activityResults).map((activity) => (
                    <UnifiedBookingCard key={activity.id} result={activity} />
                  ))}
                </ResultsGrid>
              ) : (
                <EmptyState
                  icon={Ticket}
                  title={
                    activityCity
                      ? t('pages.travel.book.activitiesEmptyTitle', 'Nothing listed yet')
                      : t('pages.travel.book.activitiesStartTitle', 'Tours, tickets and nights out')
                  }
                  suggestions={SUGGESTED_CITIES.filter(
                    (c) => c.toLowerCase() !== activityCity.toLowerCase(),
                  )}
                  onSuggest={handleActivitySearch}
                >
                  {activityCity
                    ? t(
                        'pages.travel.book.activitiesEmpty',
                        'No activities came back for {{city}}. Try one of these:',
                        { city: activityCity },
                      )
                    : t(
                        'pages.travel.book.activitiesStart',
                        'Search a city, or start with one of these:',
                      )}
                </EmptyState>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ActivitySearchForm({
  initialCity,
  onSearch,
}: {
  initialCity: string;
  onSearch: (city: string) => void;
}) {
  const [city, setCity] = useState(initialCity);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(city);
      }}
      className="flex flex-col gap-4 items-stretch sm:flex-row sm:items-end"
    >
      <div className="flex-1 flex flex-col gap-1">
        <Label htmlFor="travel-city">City</Label>
        <Input
          id="travel-city"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          required
          placeholder="Barcelona, Berlin, Bangkok..."
        />
      </div>
      <Button type="submit" size="sm" disabled={!city.trim()}>
        <Ticket size={16} className="mr-1.5" />
        Search Activities
      </Button>
    </form>
  );
}

function ResultsGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}

const SUGGESTED_CITIES = ['Berlin', 'Barcelona', 'Lisbon', 'Bangkok', 'Mexico City', 'Amsterdam'];

function EmptyState({
  icon: Icon,
  title,
  suggestions,
  onSuggest,
  children,
}: {
  icon?: typeof Plane;
  title?: string;
  suggestions?: string[];
  onSuggest?: (city: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-container bg-card px-6 py-10 text-center shadow-soft">
      {Icon && (
        <span className="grid size-14 place-items-center rounded-full bg-muted">
          <Icon size={24} aria-hidden />
        </span>
      )}
      {title && <p className="text-title font-bold">{title}</p>}
      <div className="max-w-md text-15 text-muted-foreground">{children}</div>
      {suggestions && onSuggest && suggestions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((city) => (
            <FilterChip key={city} active={false} onClick={() => onSuggest(city)} label={city} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Train and coach: one route, one search, opened at the partner. */
function GroundSearch({ mode }: { mode: 'rail' | 'coach' }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState('');
  const ready = from.trim().length > 1 && to.trim().length > 1;
  const href = !ready
    ? undefined
    : mode === 'rail'
      ? buildTrainlineUrl({ origin: from, destination: to, departDate: date || undefined })
      : buildFlixbusUrl({ origin: from, destination: to, departDate: date || undefined });
  const Icon = mode === 'rail' ? Train : Bus;
  return (
    <div className="grid gap-4 rounded-container bg-card p-4 shadow-soft md:grid-cols-[1fr_1fr_180px_auto] md:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ground-from">From</Label>
        <Input
          id="ground-from"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="Zürich"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ground-to">To</Label>
        <Input
          id="ground-to"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Berlin"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ground-date">Date</Label>
        <Input
          id="ground-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {href ? (
        <Button asChild>
          <a href={href} target="_blank" rel="noopener noreferrer sponsored">
            <Icon size={16} /> Search {mode === 'rail' ? 'trains' : 'coaches'}
          </a>
        </Button>
      ) : (
        <Button disabled>
          <Icon size={16} /> Search {mode === 'rail' ? 'trains' : 'coaches'}
        </Button>
      )}
    </div>
  );
}
