import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Plane, Hotel, Ticket, TrendingUp, X, ChevronDown } from 'lucide-react';
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
import { UnifiedBookingCard } from '@/components/booking/UnifiedBookingCard';
import { useTravelDeals } from '@/hooks/useTravelDeals';
import { useHotelSearch } from '@/hooks/useHotelSearch';
import { useActivitySearch } from '@/hooks/useActivitySearch';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';
import { useRecommendations } from '@/hooks/useRecommendations';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import type { BookingResult } from '@/lib/booking/types';

type BookingTab = 'flights' | 'hotels' | 'activities';

const TAB_CONFIG: { value: BookingTab; label: string; icon: typeof Plane }[] = [
  { value: 'flights', label: 'Flights', icon: Plane },
  { value: 'hotels', label: 'Hotels', icon: Hotel },
  { value: 'activities', label: 'Activities', icon: Ticket },
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
}

export function BookNowAccordion({ defaultOpen = false }: Props) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(defaultOpen);

  const initialTab = (searchParams.get('tab') as BookingTab) || 'flights';
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

  const [activeTab, setActiveTab] = useState<BookingTab>(initialTab);
  const [hotelSearch, setHotelSearch] = useState<HotelSearchState | null>(
    initialCity
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
      : null,
  );

  const { originIata, originCity, loading: originLoading } = useVisitorOrigin();

  const { data: popularDeals, isLoading: flightsLoading } = useTravelDeals({
    origin: originIata || undefined,
    type: 'popular_routes',
    limit: 9,
    enabled: open && !!originIata && activeTab === 'flights',
  });

  const { data: hotelResults, isLoading: hotelsLoading } = useHotelSearch({
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

  const [activityCity, setActivityCity] = useState(initialCity || '');
  const { data: activityResults, isLoading: activitiesLoading } = useActivitySearch({
    city: activityCity || undefined,
    limit: 9,
    enabled: open && activeTab === 'activities' && !!activityCity,
  });

  const { data: recs } = useRecommendations({ recType: 'destination', limit: 20 });
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
      const aBoost = a.providerData?.cityId && recCityIds.has(a.providerData.cityId as string) ? 10 : 0;
      const bBoost = b.providerData?.cityId && recCityIds.has(b.providerData.cityId as string) ? 10 : 0;
      return bBoost - aBoost || a.price - b.price;
    });
  };

  const handleTabChange = (value: BookingTab) => {
    setActiveTab(value);
    setSearchParams((prev) => {
      prev.set('tab', value);
      return prev;
    });
  };

  const syncHotelParamsToUrl = (params: HotelSearchParams) => {
    setSearchParams((prev) => {
      prev.set('tab', 'hotels');
      prev.set('city', params.city);
      if (params.checkIn) prev.set('checkIn', params.checkIn); else prev.delete('checkIn');
      if (params.checkOut) prev.set('checkOut', params.checkOut); else prev.delete('checkOut');
      prev.set('guests', String(params.guests));
      if (params.hotelType) prev.set('type', params.hotelType); else prev.delete('type');
      if (params.priceMin !== undefined) prev.set('priceMin', String(params.priceMin)); else prev.delete('priceMin');
      if (params.priceMax !== undefined) prev.set('priceMax', String(params.priceMax)); else prev.delete('priceMax');
      if (params.lgbtqFriendlyOnly) prev.set('lgbtqOnly', '1'); else prev.delete('lgbtqOnly');
      return prev;
    });
  };

  const handleHotelSearch = (params: HotelSearchParams) => {
    setHotelSearch(params);
    syncHotelParamsToUrl(params);
    track({ eventType: 'search', metadata: { surface: 'travel_book_now', vertical: 'hotel', city: params.city } });
  };

  const clearHotelFilter = (key: 'hotelType' | 'priceMin' | 'priceMax' | 'lgbtqFriendlyOnly') => {
    if (!hotelSearch) return;
    const next: HotelSearchState = { ...hotelSearch, [key]: undefined };
    setHotelSearch(next);
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
    setHotelSearch(next);
    syncHotelParamsToUrl(next);
  };

  const hasActiveHotelFilters =
    !!hotelSearch &&
    (hotelSearch.hotelType !== undefined ||
      hotelSearch.priceMin !== undefined ||
      hotelSearch.priceMax !== undefined ||
      hotelSearch.lgbtqFriendlyOnly === true);

  return (
    <section className="border border-border bg-background mb-8 rounded" data-testid="book-now-section">
      <button
        type="button"
        className="w-full flex items-center justify-between p-6 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          <span className="block text-lg font-bold tracking-tight">
            {t('pages.travel.bookNow.title', 'Book now')}
          </span>
          <span className="block text-sm text-muted-foreground mt-1">
            {t(
              'pages.travel.bookNow.subtitle',
              'Search flights, hotels, and activities directly — no trip required.',
            )}
          </span>
        </span>
        <ChevronDown
          size={20}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
        />
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="flex border-b border-border">
            {TAB_CONFIG.map(({ value, label, icon: Icon }) => {
              const active = activeTab === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleTabChange(value)}
                  className={`flex-1 px-4 py-3 inline-flex items-center justify-center gap-2 text-sm font-medium border-b-2 ${active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  <Icon style={{ height: 18, width: 18 }} />
                  {label}
                </button>
              );
            })}
          </div>

          <div className="p-6">
            {activeTab === 'flights' && <FlightSearchForm initialDestination={initialTo} />}
            {activeTab === 'hotels' && (
              <HotelSearchForm
                initialCity={initialCity}
                initialCheckIn={initialCheckIn}
                initialCheckOut={initialCheckOut}
                initialGuests={initialGuests}
                initialHotelType={initialHotelType}
                initialPriceMin={initialPriceMin}
                initialPriceMax={initialPriceMax}
                initialLgbtqFriendlyOnly={initialLgbtqOnly}
                onSearch={handleHotelSearch}
              />
            )}
            {activeTab === 'activities' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                }}
                className="flex gap-3 items-end"
              >
                <div className="flex-1 flex flex-col gap-1">
                  <Label htmlFor="travel-city">City</Label>
                  <Input
                    id="travel-city"
                    value={activityCity}
                    onChange={(e) => setActivityCity(e.target.value)}
                    placeholder="Barcelona, Berlin, Bangkok..."
                  />
                </div>
                <Button type="submit" size="sm" onClick={() => setActivityCity(activityCity.trim())}>
                  <Ticket style={{ height: 16, width: 16, marginRight: 6 }} />
                  Search Activities
                </Button>
              </form>
            )}
          </div>

          {activeTab === 'flights' && (
            <div className="border-t border-border p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp style={{ height: 20, width: 20 }} />
                <h3 className="text-base font-bold tracking-tight">
                  {originCity ? `Popular deals from ${originCity}` : 'Popular flight deals'}
                </h3>
              </div>
              {originLoading || flightsLoading ? (
                <ResultsGrid>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-[140px] rounded" />
                  ))}
                </ResultsGrid>
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
                <EmptyState>
                  {originIata
                    ? 'No popular deals available right now. Try searching for a specific route above.'
                    : 'Enable location services to see personalized deals, or search for a route above.'}
                </EmptyState>
              )}
            </div>
          )}

          {activeTab === 'hotels' && (
            <div className="border-t border-border p-6">
              <div className="flex items-center gap-2 mb-4">
                <Hotel style={{ height: 20, width: 20 }} />
                <h3 className="text-base font-bold tracking-tight">
                  {hotelSearch?.city ? `Hotels in ${hotelSearch.city}` : 'Search for hotels'}
                </h3>
              </div>

              {hasActiveHotelFilters && hotelSearch && (
                <div className="flex flex-wrap gap-2 mb-4 items-center">
                  {hotelSearch.hotelType && (
                    <Badge variant="secondary" className="inline-flex items-center gap-1">
                      {`${t('pages.travel.hotels.typeLabel', 'Type')}: ${t(`pages.travel.hotels.type.${hotelSearch.hotelType}`, HOTEL_TYPE_LABEL_FALLBACK[hotelSearch.hotelType])}`}
                      <button type="button" onClick={() => clearHotelFilter('hotelType')} aria-label="Clear">
                        <X size={12} />
                      </button>
                    </Badge>
                  )}
                  {hotelSearch.priceMin !== undefined && (
                    <Badge variant="secondary" className="inline-flex items-center gap-1">
                      {`≥ €${hotelSearch.priceMin}`}
                      <button type="button" onClick={() => clearHotelFilter('priceMin')} aria-label="Clear">
                        <X size={12} />
                      </button>
                    </Badge>
                  )}
                  {hotelSearch.priceMax !== undefined && (
                    <Badge variant="secondary" className="inline-flex items-center gap-1">
                      {`≤ €${hotelSearch.priceMax}`}
                      <button type="button" onClick={() => clearHotelFilter('priceMax')} aria-label="Clear">
                        <X size={12} />
                      </button>
                    </Badge>
                  )}
                  {hotelSearch.lgbtqFriendlyOnly && (
                    <Badge variant="secondary" className="inline-flex items-center gap-1">
                      LGBTQ+ friendly
                      <button type="button" onClick={() => clearHotelFilter('lgbtqFriendlyOnly')} aria-label="Clear">
                        <X size={12} />
                      </button>
                    </Badge>
                  )}
                  <Button size="sm" variant="outline" onClick={clearAllHotelFilters}>
                    {t('pages.travel.hotels.clearFilters', 'Clear filters')}
                  </Button>
                </div>
              )}

              {hotelsLoading ? (
                <ResultsGrid>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-[240px] rounded" />
                  ))}
                </ResultsGrid>
              ) : hotelResults && hotelResults.length > 0 ? (
                <ResultsGrid>
                  {rankResults(hotelResults).map((hotel) => (
                    <UnifiedBookingCard key={hotel.id} result={hotel} />
                  ))}
                </ResultsGrid>
              ) : hotelSearch && hasActiveHotelFilters ? (
                <EmptyState>
                  <div className="flex flex-col items-center gap-3">
                    <span>
                      {t('pages.travel.hotels.noResultsWithFilters', 'No hotels match your filters in {{city}}.', {
                        city: hotelSearch.city,
                      })}
                    </span>
                    <Button size="sm" variant="outline" onClick={clearAllHotelFilters}>
                      Clear filters
                    </Button>
                  </div>
                </EmptyState>
              ) : hotelSearch ? (
                <EmptyState>No hotels found in {hotelSearch.city}. Try a different city.</EmptyState>
              ) : (
                <EmptyState>Search for a city above to find hotels.</EmptyState>
              )}
            </div>
          )}

          {activeTab === 'activities' && (
            <div className="border-t border-border p-6">
              <div className="flex items-center gap-2 mb-4">
                <Ticket style={{ height: 20, width: 20 }} />
                <h3 className="text-base font-bold tracking-tight">
                  {activityCity ? `Activities in ${activityCity}` : 'Search for activities'}
                </h3>
              </div>
              {activitiesLoading ? (
                <ResultsGrid>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-[200px] rounded" />
                  ))}
                </ResultsGrid>
              ) : activityResults && activityResults.length > 0 ? (
                <ResultsGrid>
                  {rankResults(activityResults).map((activity) => (
                    <UnifiedBookingCard key={activity.id} result={activity} />
                  ))}
                </ResultsGrid>
              ) : activityCity ? (
                <EmptyState>No activities found in {activityCity}. Try a different city.</EmptyState>
              ) : (
                <EmptyState>Search for a city above to find activities and tours.</EmptyState>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ResultsGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center py-8 bg-muted rounded-md">
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}
