import { useState } from 'react';
import { useSearchParams } from 'react-router';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Skeleton from '@mui/material/Skeleton';
import { useTheme } from '@mui/material/styles';
import { Plane, Hotel, Ticket, TrendingUp } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { FlightSearchForm } from '@/components/travel/FlightSearchForm';
import { HotelSearchForm } from '@/components/booking/HotelSearchForm';
import { TravelDealCard } from '@/components/travel/TravelDealCard';
import { UnifiedBookingCard } from '@/components/booking/UnifiedBookingCard';
import { useTravelDeals } from '@/hooks/useTravelDeals';
import { useHotelSearch } from '@/hooks/useHotelSearch';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';
import { useTranslation } from 'react-i18next';
import { TravelPrefsPrompt } from '@/components/personalization/TravelPrefsPrompt';

type BookingTab = 'flights' | 'hotels' | 'activities';

const TAB_CONFIG: { value: BookingTab; label: string; icon: typeof Plane }[] = [
  { value: 'flights', label: 'Flights', icon: Plane },
  { value: 'hotels', label: 'Hotels', icon: Hotel },
  { value: 'activities', label: 'Activities', icon: Ticket },
];

export default function Travel() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as BookingTab) || 'flights';
  const initialTo = searchParams.get('to') || undefined;
  const initialCity = searchParams.get('city') || undefined;

  const [activeTab, setActiveTab] = useState<BookingTab>(initialTab);
  const [hotelSearch, setHotelSearch] = useState<{
    city: string;
    checkIn?: string;
    checkOut?: string;
    guests: number;
  } | null>(initialCity ? { city: initialCity, guests: 2 } : null);

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
    enabled: activeTab === 'hotels' && !!hotelSearch?.city,
  });

  const handleTabChange = (_: unknown, value: BookingTab) => {
    setActiveTab(value);
    setSearchParams((prev) => {
      prev.set('tab', value);
      return prev;
    });
  };

  const handleHotelSearch = (params: { city: string; checkIn?: string; checkOut?: string; guests: number }) => {
    setHotelSearch(params);
  };

  return (
    <Container sx={{ py: { xs: 6, md: 10 } }}>
      <TravelPrefsPrompt />

      {/* Hero */}
      <Paper
        variant="outlined"
        sx={{ p: { xs: 3, sm: 4 }, mb: 4, bgcolor: 'background.paper', textAlign: 'center' }}
      >
        <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: '-0.02em', mb: 1 }}>
          Book Travel
        </Typography>
        <Typography sx={{ color: 'text.secondary', maxWidth: 480, mx: 'auto' }}>
          Find flights, hotels, and activities for LGBTQ+ friendly destinations
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
            <HotelSearchForm initialCity={initialCity} onSearch={handleHotelSearch} />
          )}

          {/* Activities Tab */}
          {activeTab === 'activities' && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Ticket style={{ height: 40, width: 40, color: theme.palette.text.secondary, marginBottom: 8 }} />
              <Typography sx={{ color: 'text.secondary' }}>
                Activities coming soon. Browse <LocalizedLink to="/places" style={{ color: theme.palette.primary.main }}>destinations</LocalizedLink> to find events and experiences.
              </Typography>
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

          {hotelsLoading ? (
            <ResultsGrid>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} variant="rounded" height={240} />
              ))}
            </ResultsGrid>
          ) : hotelResults && hotelResults.length > 0 ? (
            <ResultsGrid>
              {hotelResults.map((hotel) => (
                <UnifiedBookingCard key={hotel.id} result={hotel} />
              ))}
            </ResultsGrid>
          ) : hotelSearch ? (
            <EmptyState>No hotels found in {hotelSearch.city}. Try a different city.</EmptyState>
          ) : (
            <EmptyState>Search for a city above to find hotels.</EmptyState>
          )}
        </Paper>
      )}

      {/* CTA */}
      <Paper variant="outlined" sx={{ textAlign: 'center', py: 3, px: 3, bgcolor: 'background.paper' }}>
        <Typography sx={{ fontWeight: 600, mb: 1 }}>
          Explore LGBTQ+ Friendly Destinations
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 2 }}>
          Discover cities and countries with detailed safety information and travel guides
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
      <Typography sx={{ color: 'text.secondary' }}>{children}</Typography>
    </Box>
  );
}
