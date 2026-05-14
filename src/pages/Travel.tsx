import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { ResumeTripStrip } from '@/components/travel/ResumeTripStrip';
import { StartTripHero } from '@/components/travel/StartTripHero';
import { PrideScroller } from '@/components/travel/PrideScroller';
import { InspirationGrid } from '@/components/travel/InspirationGrid';
import { BookNowAccordion } from '@/components/travel/BookNowAccordion';
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
import { useRecommendations } from '@/hooks/useRecommendations';

export default function Travel() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const intentBook = searchParams.get('intent') === 'book';

  const { track } = useTrackEvent();
  const { data: recs } = useRecommendations({ recType: 'destination', limit: 20 });

  // Wire the A/B experiment surface: emit exposure once per session so we can
  // actually measure the personalization branch in analytics.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flagKey = 'qg_exp_travel_perso_v1_logged';
    if (sessionStorage.getItem(flagKey)) return;
    const sessionId = sessionStorage.getItem('qg_session_id') ?? '';
    const group =
      parseInt(sessionId.slice(-2) || '0', 16) % 2 === 0 ? 'personalized' : 'control';
    track({
      eventType: 'page_view',
      metadata: {
        page: 'travel',
        experiment: 'travel_personalization_v1',
        group,
        recs_available: (recs?.length ?? 0) > 0,
      },
    });
    sessionStorage.setItem(flagKey, '1');
  }, [track, recs]);

  return (
    <div className="container mx-auto px-4 py-12 md:py-20 max-w-screen-xl">
      <ResumeTripStrip />

      {!intentBook && <StartTripHero />}

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
      <PrideScroller />

      <InspirationGrid />

      <BookNowAccordion defaultOpen={intentBook} />

      <div className="border border-border bg-background text-center py-6 px-6 rounded">
        <p className="font-semibold mb-2">
          {t('pages.travel.exploreCta', 'Explore LGBTQ+ friendly destinations')}
        </p>
        <p className="text-muted-foreground text-sm mb-4">
          {t(
            'pages.travel.exploreDescription',
            'Browse cities and countries with detailed safety information and travel guides.',
          )}
        </p>
        <LocalizedLink to="/places">
          <Button variant="outline">{t('pages.travel.browseDestinations', 'Browse destinations')}</Button>
        </LocalizedLink>
      </div>
    </div>
  );
}
