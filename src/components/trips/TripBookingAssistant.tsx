import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme } from '@mui/material/styles';
import { Plane, Hotel, Plus, Shield, MapPin, Star, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations, type TripPlace, type TripDay } from '@/hooks/useTrips';
import { useTravelDeals } from '@/hooks/useTravelDeals';
import { useHotelSearch } from '@/hooks/useHotelSearch';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';
import { HotelBookingFlow } from '@/components/booking/HotelBookingFlow';
import type { BookingResult } from '@/lib/booking/types';
import { formatPrice } from '@/lib/booking/price';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

interface Props {
  tripId: string;
  places: TripPlace[];
  days: TripDay[];
  startDate?: string;
  endDate?: string;
}

interface CityInfo {
  id: string;
  name: string;
  country_id: string | null;
  countries?: { equality_score: number | null; name: string } | null;
}

export function TripBookingAssistant({ tripId, places, _days, startDate, endDate }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { toast } = useToast();
  const { addPlace } = useTripMutations();
  const { originIata, _originCity } = useVisitorOrigin();
  const [bookingHotel, setBookingHotel] = useState<BookingResult | null>(null);
  const [activeTab, setActiveTab] = useState<'suggestions' | 'booking'>('suggestions');
  const [addingId, setAddingId] = useState<string | null>(null);

  const tabs = [
    { key: 'suggestions' as const, label: t('trips.bookingAssistant.tabs.suggestions', 'Suggestions'), icon: MapPin },
    { key: 'booking' as const, label: t('trips.bookingAssistant.tabs.book', 'Book'), icon: Hotel },
  ];

  const cityIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of places) {
      if (p.city_id) ids.add(p.city_id);
    }
    return Array.from(ids);
  }, [places]);

  const { data: cities } = useQuery({
    queryKey: ['trip-booking-cities', cityIds],
    queryFn: async () => {
      if (cityIds.length === 0) return [];
      const { data, error } = await supabase
        .from('cities')
        .select('id, name, country_id, countries:country_id(equality_score, name)')
        .in('id', cityIds);
      if (error) throw error;
      return (data || []) as CityInfo[];
    },
    enabled: cityIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch reservations to know what's already booked
  const { data: reservations } = useQuery({
    queryKey: ['trip-reservations', tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select('id, type, title, provider, status')
        .eq('trip_id', tripId);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const hasHotelBooked = (reservations || []).some((r) => r.type === 'hotel');
  const hasFlightBooked = (reservations || []).some((r) => r.type === 'flight');

  // Venue suggestions per city
  const { data: venues, isLoading: venuesLoading } = useQuery({
    queryKey: ['trip-suggestion-venues', cityIds],
    queryFn: async () => {
      if (cityIds.length === 0) return [];
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, category, address, foursquare_rating, featured, latitude, longitude, city_id, country_id')
        .in('city_id', cityIds)
        .order('foursquare_rating', { ascending: false, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: cityIds.length > 0 && activeTab === 'suggestions',
    staleTime: 10 * 60 * 1000,
  });

  // Flight deals for first city
  const firstCity = cities?.[0];
  const { data: _flightDeals } = useTravelDeals({
    origin: originIata || undefined,
    type: 'popular_routes',
    limit: 3,
    enabled: !!originIata && activeTab === 'booking',
  });

  // Hotel deals for first city
  const { data: hotelResults, isLoading: hotelsLoading } = useHotelSearch({
    city: firstCity?.name,
    checkIn: startDate,
    checkOut: endDate,
    limit: 3,
    enabled: !!firstCity?.name && activeTab === 'booking',
  });

  const existingVenueIds = new Set(places.filter((p) => p.venue_id).map((p) => p.venue_id));

  const unsafeCities = (cities || []).filter(
    (c) => c.countries?.equality_score != null && (c.countries?.equality_score ?? 100) < 40,
  );

  const handleAddVenue = async (venue: { id: string; name: string; address: string | null; latitude: number | null; longitude: number | null; city_id: string | null; country_id: string | null }) => {
    setAddingId(venue.id);
    try {
      await addPlace.mutateAsync({
        trip_id: tripId,
        day_id: null,
        venue_id: venue.id,
        event_id: null,
        hotel_id: null,
        custom_name: null,
        custom_address: venue.address,
        latitude: venue.latitude,
        longitude: venue.longitude,
        city_id: venue.city_id,
        country_id: venue.country_id,
        start_time: null,
        end_time: null,
        duration_minutes: null,
        notes: null,
        category: 'venue',
        sort_order: 0,
        created_by: null,
      });
      toast({ title: t('trips.bookingAssistant.addedToast', 'Added to trip') });
    } catch (err) {
      toast({ title: t('trips.bookingAssistant.addFailedToast', 'Failed to add'), description: String(err), variant: 'destructive' });
    } finally {
      setAddingId(null);
    }
  };

  if (cityIds.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="body2" color="text.secondary" className="text-center">
            {t('trips.bookingAssistant.emptyHint', 'Add places to see suggestions and booking options')}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box>
      {/* Tab toggle */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
        {tabs.map(({ key, label, icon: Icon }) => (
          <Badge
            key={key}
            variant={activeTab === key ? 'default' : 'outline'}
            onClick={() => setActiveTab(key)}

          >
            <Icon size={13} />
            {label}
          </Badge>
        ))}
      </Box>

      {/* Safety warnings */}
      {unsafeCities.map((city) => (
        <Card key={city.id} className="mb-2">
          <CardContent>
            <Box className="flex items-start gap-2" sx={{ bgcolor: 'warning.light', mx: -2, mt: -1, mb: -1, p: 2, borderRadius: 1 }}>
              <Shield size={16} style={{ color: theme.palette.warning?.main, flexShrink: 0, marginTop: 2 }} />
              <Typography variant="body2">
                <strong>{city.name}</strong> {t('trips.bookingAssistant.lowerEquality', 'has a lower equality score')} ({city.countries?.equality_score}).
              </Typography>
            </Box>
          </CardContent>
        </Card>
      ))}

      {/* Suggestions Tab */}
      {activeTab === 'suggestions' && (
        <>
          {venuesLoading ? (
            <Box className="flex justify-center py-8">
              <CircularProgress size={24} aria-label="Loading" />
            </Box>
          ) : (
            cityIds.map((cityId) => {
              const city = (cities || []).find((c) => c.id === cityId);
              const cityVenues = (venues || [])
                .filter((v) => v.city_id === cityId && !existingVenueIds.has(v.id))
                .slice(0, 5);

              if (cityVenues.length === 0) return null;

              return (
                <Box key={cityId} sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
                    {t('trips.bookingAssistant.suggestedFor', 'Suggested for {{city}}', { city: city?.name || t('trips.bookingAssistant.unknownCity', 'Unknown') })}
                  </Typography>
                  {cityVenues.map((venue) => (
                    <Box
                      key={venue.id}
                      className="flex items-center gap-2 py-1.5"
                      sx={{ borderBottom: '1px solid', borderColor: 'divider', minHeight: 44 }}
                    >
                      <MapPin size={13} style={{ color: theme.palette.text.secondary, flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <Typography variant="body2" noWrap fontWeight={500}>{venue.name}</Typography>
                        {venue.category && <Badge variant="outline">{venue.category}</Badge>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleAddVenue(venue)} disabled={addingId === venue.id}>
                        {addingId === venue.id ? <CircularProgress size={12} aria-label="Loading" /> : <Plus size={12} />}
                        {t('trips.bookingAssistant.add', 'Add')}
                      </Button>
                    </Box>
                  ))}
                </Box>
              );
            })
          )}
        </>
      )}

      {/* Booking Tab */}
      {activeTab === 'booking' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Still need section */}
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            {t('trips.bookingAssistant.stillNeed', 'Still need')}
          </Typography>

          {!hasFlightBooked && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Plane size={16} style={{ color: theme.palette.text.secondary }} />
              <Typography variant="body2" sx={{ flex: 1 }}>{t('trips.bookingAssistant.flights', 'Flights')}</Typography>
              <LocalizedLink to="/travel?tab=flights">
                <Button variant="outline" size="sm">{t('trips.bookingAssistant.search', 'Search')}</Button>
              </LocalizedLink>
            </Box>
          )}
          {hasFlightBooked && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, opacity: 0.6 }}>
              <Check size={16} style={{ color: theme.palette.success.main }} />
              <Typography variant="body2">{t('trips.bookingAssistant.flightsBooked', 'Flights booked')}</Typography>
            </Box>
          )}

          {!hasHotelBooked && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Hotel size={16} style={{ color: theme.palette.text.secondary }} />
              <Typography variant="body2" sx={{ flex: 1 }}>
                {firstCity
                  ? t('trips.bookingAssistant.hotelIn', 'Hotel in {{city}}', { city: firstCity.name })
                  : t('trips.bookingAssistant.hotel', 'Hotel')}
              </Typography>
              <LocalizedLink to={`/travel?tab=hotels${firstCity ? `&city=${encodeURIComponent(firstCity.name)}` : ''}`}>
                <Button variant="outline" size="sm">{t('trips.bookingAssistant.search', 'Search')}</Button>
              </LocalizedLink>
            </Box>
          )}
          {hasHotelBooked && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, opacity: 0.6 }}>
              <Check size={16} style={{ color: theme.palette.success.main }} />
              <Typography variant="body2">{t('trips.bookingAssistant.hotelBooked', 'Hotel booked')}</Typography>
            </Box>
          )}

          {/* Quick hotel results */}
          {!hasHotelBooked && firstCity && (
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: 'block' }}>
                {t('trips.bookingAssistant.hotelsIn', 'Hotels in {{city}}', { city: firstCity.name })}
              </Typography>
              {hotelsLoading ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {[1, 2].map((i) => <Skeleton key={i} variant="rounded" height={80} />)}
                </Box>
              ) : hotelResults && hotelResults.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {hotelResults.slice(0, 2).map((hotel) => (
                    <Box
                      key={hotel.id}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, cursor: 'pointer' }}
                      onClick={() => setBookingHotel(hotel)}
                    >
                      {hotel.imageUrl && (
                        <Box component="img" src={hotel.imageUrl} alt={hotel.title} sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1 }} />
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{hotel.title}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {hotel.starRating && Array.from({ length: hotel.starRating }).map((_, i) => (
                            <Star key={i} size={10} style={{ fill: 'currentColor', color: 'var(--primary)' }} />
                          ))}
                          {hotel.rating && <Typography variant="caption">{hotel.rating.toFixed(1)}</Typography>}
                        </Box>
                      </Box>
                      <Typography variant="body2" fontWeight={700} color="primary">
                        {formatPrice(hotel.price, hotel.currency)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">{t('trips.bookingAssistant.noHotelsFound', 'No hotels found')}</Typography>
              )}
            </Box>
          )}
        </Box>
      )}

      {/* Hotel Booking Dialog */}
      <HotelBookingFlow
        hotel={bookingHotel}
        open={!!bookingHotel}
        onClose={() => setBookingHotel(null)}
        tripId={tripId}
      />
    </Box>
  );
}
