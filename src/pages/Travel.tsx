import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plane, Hotel, Ticket, TrendingUp, X } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
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
import { useTranslation } from 'react-i18next';
import { TravelPrefsPrompt } from '@/components/personalization/TravelPrefsPrompt';
import { useRecommendations } from '@/hooks/useRecommendations';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { SpecialOffersSection } from '@/components/travel/SpecialOffersSection';
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
}

export default function Travel() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
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
        }
      : null,
  );

  const { originIata, originCity, loading: originLoading } = useVisitorOrigin();

  const { data: popularDeals, isLoading: flightsLoading } = useTravelDeals({
    origin: originIata || undefined,
    type: 'popular_routes',
    limit: 9,
    enabled: !!originIata && activeTab === 'flights',
  });

  const { data: hotelResults, isLoading: hotelsLoading } = useHotelSearch({
    city: hotelSearch?.city,
    checkIn: hotelSearch?.checkIn,
    checkOut: hotelSearch?.checkOut,
    guests: hotelSearch?.guests,
    hotelType: hotelSearch?.hotelType,
    priceMin: hotelSearch?.priceMin,
    priceMax: hotelSearch?.priceMax,
    enabled: activeTab === 'hotels' && !!hotelSearch?.city,
  });

  const [activityCity, setActivityCity] = useState(initialCity || '');
  const { data: activityResults, isLoading: activitiesLoading } = useActivitySearch({
    city: activityCity || undefined,
    limit: 9,
    enabled: activeTab === 'activities' && !!activityCity,
  });

  // Personalized ranking: boost deals matching recommended destinations
  const { data: recs } = useRecommendations({ recType: 'destination', limit: 20 });
  const { _track } = useTrackEvent();

  const recCityIds = new Set((recs || []).map((r) => r.entity_id));
  const usePersonalized = recCityIds.size > 0;

  // A/B: 50% of sessions see personalized ranking (when recs available)
  const abGroup = typeof window !== 'undefined'
    ? (parseInt(sessionStorage.getItem('qg_session_id')?.slice(-2) || '0', 16) % 2 === 0 ? 'personalized' : 'control')
    : 'control';

  const rankResults = <T extends BookingResult>(results: T[]): T[] => {
    if (!usePersonalized || abGroup !== 'personalized') return results;
    return [...results].sort((a, b) => {
      const aBoost = a.providerData?.cityId && recCityIds.has(a.providerData.cityId as string) ? 10 : 0;
      const bBoost = b.providerData?.cityId && recCityIds.has(b.providerData.cityId as string) ? 10 : 0;
      return (bBoost - aBoost) || (a.price - b.price);
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
      return prev;
    });
  };

  const handleHotelSearch = (params: HotelSearchParams) => {
    setHotelSearch(params);
    syncHotelParamsToUrl(params);
  };

  const clearHotelFilter = (key: 'hotelType' | 'priceMin' | 'priceMax') => {
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
      hotelSearch.priceMax !== undefined);

  return (
    <div className="container mx-auto px-4 py-12 md:py-20 max-w-screen-xl">
      <TravelPrefsPrompt />
      <SpecialOffersSection />

      {/* Hero */}
      <div className="border border-border bg-background p-6 sm:p-8 mb-8 text-center rounded">
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">
          {t('pages.travel.title', 'Book Travel')}
        </h1>
        <p className="text-muted-foreground max-w-[480px] mx-auto">
          {t('pages.travel.subtitle', 'Find flights, hotels, and activities for LGBTQ+ friendly destinations')}
        </p>
      </div>

      {/* Tabs */}
      <div className="border border-border bg-background mb-8 rounded">
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
          {/* Flights Tab */}
          {activeTab === 'flights' && (
            <FlightSearchForm initialDestination={initialTo} />
          )}

          {/* Hotels Tab */}
          {activeTab === 'hotels' && (
            <HotelSearchForm
              initialCity={initialCity}
              initialCheckIn={initialCheckIn}
              initialCheckOut={initialCheckOut}
              initialGuests={initialGuests}
              initialHotelType={initialHotelType}
              initialPriceMin={initialPriceMin}
              initialPriceMax={initialPriceMax}
              onSearch={handleHotelSearch}
            />
          )}

          {/* Activities Tab */}
          {activeTab === 'activities' && (
            <form
              onSubmit={(e) => { e.preventDefault(); }}
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
      </div>

      {/* Results */}
      {activeTab === 'flights' && (
        <div className="border border-border bg-background p-6 mb-8 rounded">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp style={{ height: 20, width: 20, color: 'hsl(var(--brand))' }} />
            <h2 className="text-xl font-bold tracking-tight">
              {originCity ? `Popular Deals from ${originCity}` : 'Popular Flight Deals'}
            </h2>
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
        <div className="border border-border bg-background p-6 mb-8 rounded">
          <div className="flex items-center gap-2 mb-4">
            <Hotel style={{ height: 20, width: 20, color: 'hsl(var(--brand))' }} />
            <h2 className="text-xl font-bold tracking-tight">
              {hotelSearch?.city ? `Hotels in ${hotelSearch.city}` : 'Search for Hotels'}
            </h2>
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
                <span>{t('pages.travel.hotels.noResultsWithFilters', 'No hotels match your filters in {{city}}.', { city: hotelSearch.city })}</span>
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
        <div className="border border-border bg-background p-6 mb-8 rounded">
          <div className="flex items-center gap-2 mb-4">
            <Ticket style={{ height: 20, width: 20, color: 'hsl(var(--brand))' }} />
            <h2 className="text-xl font-bold tracking-tight">
              {activityCity ? `Activities in ${activityCity}` : 'Search for Activities'}
            </h2>
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

      {/* CTA */}
      <div className="border border-border bg-background text-center py-6 px-6 rounded">
        <p className="font-semibold mb-2">
          {t('pages.travel.exploreCta', 'Explore LGBTQ+ Friendly Destinations')}
        </p>
        <p className="text-muted-foreground text-sm mb-4">
          {t('pages.travel.exploreDescription', 'Discover cities and countries with detailed safety information and travel guides')}
        </p>
        <LocalizedLink to="/places">
          <Button variant="outline">{t('pages.travel.browseDestinations', 'Browse Destinations')}</Button>
        </LocalizedLink>
      </div>
    </div>
  );
}

function ResultsGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center py-8 bg-muted rounded-md">
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}
