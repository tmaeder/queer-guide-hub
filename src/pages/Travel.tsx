import { useState } from 'react';
import { useSearchParams } from 'react-router';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';
import { Plane, Hotel, Ticket, TrendingUp } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
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
  const theme = useTheme();
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
  const { track } = useTrackEvent();

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

  const handleTabChange = (_: unknown, value: BookingTab) => {
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
    <Container sx={{ py: { xs: 6, md: 10 } }}>
      <TravelPrefsPrompt />
      <SpecialOffersSection />

      {/* Hero */}
      <Paper
        variant="outlined"
        sx={{ p: { xs: 3, sm: 4 }, mb: 4, bgcolor: 'background.paper', textAlign: 'center' }}
      >
        <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: '-0.02em', mb: 1 }}>
          {t('pages.travel.title', 'Book Travel')}
        </Typography>
        <Typography sx={{ color: 'text.secondary', maxWidth: 480, mx: 'auto' }}>
          {t('pages.travel.subtitle', 'Find flights, hotels, and activities for LGBTQ+ friendly destinations')}
        </Typography>
      </Paper>

      {/* Tabs */}
      <Paper variant="outlined" sx={{ mb: 4, bgcolor: 'background.paper' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          {TAB_CONFIG.map(({ value, label, icon: Icon }) => (
            <Tab
              key={value}
              value={value}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Icon style={{ height: 18, width: 18 }} />
                  {label}
                </Box>
              }
            />
          ))}
        </Tabs>

        <Box sx={{ p: 3 }}>
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
            <Box
              component="form"
              onSubmit={(e: React.FormEvent) => { e.preventDefault(); }}
              sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-end' }}
            >
              <Box sx={{ flex: 1 }}>
                <TextField
                  label="City"
                  value={activityCity}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActivityCity(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder="Barcelona, Berlin, Bangkok..."
                />
              </Box>
              <Button type="submit" size="sm" onClick={() => setActivityCity(activityCity.trim())}>
                <Ticket style={{ height: 16, width: 16, marginRight: 6 }} />
                Search Activities
              </Button>
            </Box>
          )}
        </Box>
      </Paper>

      {/* Results */}
      {activeTab === 'flights' && (
        <Paper variant="outlined" sx={{ p: 3, mb: 4, bgcolor: 'background.paper' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <TrendingUp style={{ height: 20, width: 20, color: theme.palette.brand.main }} />
            <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.01em' }}>
              {originCity ? `Popular Deals from ${originCity}` : 'Popular Flight Deals'}
            </Typography>
          </Box>

          {originLoading || flightsLoading ? (
            <ResultsGrid>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} variant="rounded" height={140} />
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
        </Paper>
      )}

      {activeTab === 'hotels' && (
        <Paper variant="outlined" sx={{ p: 3, mb: 4, bgcolor: 'background.paper' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Hotel style={{ height: 20, width: 20, color: theme.palette.brand.main }} />
            <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.01em' }}>
              {hotelSearch?.city ? `Hotels in ${hotelSearch.city}` : 'Search for Hotels'}
            </Typography>
          </Box>

          {hasActiveHotelFilters && hotelSearch && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, alignItems: 'center' }}>
              {hotelSearch.hotelType && (
                <Chip
                  label={`${t('pages.travel.hotels.typeLabel', 'Type')}: ${t(`pages.travel.hotels.type.${hotelSearch.hotelType}`, HOTEL_TYPE_LABEL_FALLBACK[hotelSearch.hotelType])}`}
                  size="small"
                  onDelete={() => clearHotelFilter('hotelType')}
                />
              )}
              {hotelSearch.priceMin !== undefined && (
                <Chip
                  label={`≥ €${hotelSearch.priceMin}`}
                  size="small"
                  onDelete={() => clearHotelFilter('priceMin')}
                />
              )}
              {hotelSearch.priceMax !== undefined && (
                <Chip
                  label={`≤ €${hotelSearch.priceMax}`}
                  size="small"
                  onDelete={() => clearHotelFilter('priceMax')}
                />
              )}
              <Button size="sm" variant="outline" onClick={clearAllHotelFilters}>
                {t('pages.travel.hotels.clearFilters', 'Clear filters')}
              </Button>
            </Box>
          )}

          {hotelsLoading ? (
            <ResultsGrid>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} variant="rounded" height={240} />
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
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                <span>{t('pages.travel.hotels.noResultsWithFilters', 'No hotels match your filters in {{city}}.', { city: hotelSearch.city })}</span>
                <Button size="sm" variant="outline" onClick={clearAllHotelFilters}>
                  Clear filters
                </Button>
              </Box>
            </EmptyState>
          ) : hotelSearch ? (
            <EmptyState>No hotels found in {hotelSearch.city}. Try a different city.</EmptyState>
          ) : (
            <EmptyState>Search for a city above to find hotels.</EmptyState>
          )}
        </Paper>
      )}

      {activeTab === 'activities' && (
        <Paper variant="outlined" sx={{ p: 3, mb: 4, bgcolor: 'background.paper' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Ticket style={{ height: 20, width: 20, color: theme.palette.brand.main }} />
            <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.01em' }}>
              {activityCity ? `Activities in ${activityCity}` : 'Search for Activities'}
            </Typography>
          </Box>

          {activitiesLoading ? (
            <ResultsGrid>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} variant="rounded" height={200} />
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
        </Paper>
      )}

      {/* CTA */}
      <Paper variant="outlined" sx={{ textAlign: 'center', py: 3, px: 3, bgcolor: 'background.paper' }}>
        <Typography sx={{ fontWeight: 600, mb: 1 }}>
          {t('pages.travel.exploreCta', 'Explore LGBTQ+ Friendly Destinations')}
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 2 }}>
          {t('pages.travel.exploreDescription', 'Discover cities and countries with detailed safety information and travel guides')}
        </Typography>
        <LocalizedLink to="/places">
          <Button variant="outline">{t('pages.travel.browseDestinations', 'Browse Destinations')}</Button>
        </LocalizedLink>
      </Paper>
    </Container>
  );
}

function ResultsGrid({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
        gap: 2,
      }}
    >
      {children}
    </Box>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ textAlign: 'center', py: 4, bgcolor: 'action.hover', borderRadius: 2 }}>
      <Typography component="div" sx={{ color: 'text.secondary' }}>
        {children}
      </Typography>
    </Box>
  );
}
