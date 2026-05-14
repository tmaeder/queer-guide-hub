import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Plane, Hotel, Plus, Shield, MapPin, Star, Check, Loader2 } from 'lucide-react';
import {
  fetchBookingAssistantCities,
  fetchTripReservations,
  fetchBookingAssistantVenues,
} from '@/hooks/useTripBookingAssistant';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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

export function TripBookingAssistant({ tripId, places, _days, startDate, endDate }: Props) {
  const { t } = useTranslation();
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
    queryFn: () => fetchBookingAssistantCities(cityIds),
    enabled: cityIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch reservations to know what's already booked
  const { data: reservations } = useQuery({
    queryKey: ['trip-reservations', tripId],
    queryFn: () => fetchTripReservations(tripId),
    staleTime: 5 * 60 * 1000,
  });

  const hasHotelBooked = (reservations || []).some((r) => r.type === 'hotel');
  const hasFlightBooked = (reservations || []).some((r) => r.type === 'flight');

  // Venue suggestions per city
  const { data: venues, isLoading: venuesLoading } = useQuery({
    queryKey: ['trip-suggestion-venues', cityIds],
    queryFn: () => fetchBookingAssistantVenues(cityIds),
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
          <p className="text-sm text-muted-foreground text-center">
            {t('trips.bookingAssistant.emptyHint', 'Add places to see suggestions and booking options')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {/* Tab toggle */}
      <div className="flex gap-1 mb-4">
        {tabs.map(({ key, label, icon: Icon }) => (
          <Badge
            key={key}
            variant={activeTab === key ? 'default' : 'outline'}
            onClick={() => setActiveTab(key)}
            className="cursor-pointer flex items-center gap-1"
          >
            <Icon size={13} />
            {label}
          </Badge>
        ))}
      </div>

      {/* Safety warnings */}
      {unsafeCities.map((city) => (
        <Card key={city.id} className="mb-2">
          <CardContent>
            <div
              className="flex items-start gap-2 -mx-4 -mt-2 -mb-2 p-4 rounded"
              style={{ backgroundColor: 'hsl(var(--warning) / 0.2)' }}
            >
              <Shield size={16} style={{ color: 'hsl(var(--warning))', flexShrink: 0, marginTop: 2 }} />
              <p className="text-sm">
                <strong>{city.name}</strong> {t('trips.bookingAssistant.lowerEquality', 'has a lower equality score')} ({city.countries?.equality_score}).
              </p>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Suggestions Tab */}
      {activeTab === 'suggestions' && (
        <>
          {venuesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="animate-spin" aria-label="Loading" />
            </div>
          ) : (
            cityIds.map((cityId) => {
              const city = (cities || []).find((c) => c.id === cityId);
              const cityVenues = (venues || [])
                .filter((v) => v.city_id === cityId && !existingVenueIds.has(v.id))
                .slice(0, 5);

              if (cityVenues.length === 0) return null;

              return (
                <div key={cityId} className="mb-4">
                  <span className="text-xs text-muted-foreground font-semibold mb-1 block">
                    {t('trips.bookingAssistant.suggestedFor', 'Suggested for {{city}}', { city: city?.name || t('trips.bookingAssistant.unknownCity', 'Unknown') })}
                  </span>
                  {cityVenues.map((venue) => (
                    <div
                      key={venue.id}
                      className="flex items-center gap-2 py-1.5 border-b border-border min-h-[44px]"
                    >
                      <MapPin size={13} className="text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate font-medium">{venue.name}</p>
                        {venue.category && <Badge variant="outline">{venue.category}</Badge>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleAddVenue(venue)} disabled={addingId === venue.id}>
                        {addingId === venue.id ? <Loader2 size={12} className="animate-spin" aria-label="Loading" /> : <Plus size={12} />}
                        {t('trips.bookingAssistant.add', 'Add')}
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </>
      )}

      {/* Booking Tab */}
      {activeTab === 'booking' && (
        <div className="flex flex-col gap-4">
          {/* Still need section */}
          <span className="text-xs text-muted-foreground font-semibold">
            {t('trips.bookingAssistant.stillNeed', 'Still need')}
          </span>

          {!hasFlightBooked && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded">
              <Plane size={16} className="text-muted-foreground" />
              <p className="text-sm flex-1">{t('trips.bookingAssistant.flights', 'Flights')}</p>
              <LocalizedLink to="/travel?tab=flights">
                <Button variant="outline" size="sm">{t('trips.bookingAssistant.search', 'Search')}</Button>
              </LocalizedLink>
            </div>
          )}
          {hasFlightBooked && (
            <div className="flex items-center gap-2 p-3 opacity-60">
              <Check size={16} style={{ color: 'hsl(var(--success))' }} />
              <p className="text-sm">{t('trips.bookingAssistant.flightsBooked', 'Flights booked')}</p>
            </div>
          )}

          {!hasHotelBooked && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded">
              <Hotel size={16} className="text-muted-foreground" />
              <p className="text-sm flex-1">
                {firstCity
                  ? t('trips.bookingAssistant.hotelIn', 'Hotel in {{city}}', { city: firstCity.name })
                  : t('trips.bookingAssistant.hotel', 'Hotel')}
              </p>
              <LocalizedLink to={`/travel?tab=hotels${firstCity ? `&city=${encodeURIComponent(firstCity.name)}` : ''}`}>
                <Button variant="outline" size="sm">{t('trips.bookingAssistant.search', 'Search')}</Button>
              </LocalizedLink>
            </div>
          )}
          {hasHotelBooked && (
            <div className="flex items-center gap-2 p-3 opacity-60">
              <Check size={16} style={{ color: 'hsl(var(--success))' }} />
              <p className="text-sm">{t('trips.bookingAssistant.hotelBooked', 'Hotel booked')}</p>
            </div>
          )}

          {/* Quick hotel results */}
          {!hasHotelBooked && firstCity && (
            <div>
              <span className="text-xs text-muted-foreground font-semibold mb-2 block">
                {t('trips.bookingAssistant.hotelsIn', 'Hotels in {{city}}', { city: firstCity.name })}
              </span>
              {hotelsLoading ? (
                <div className="flex flex-col gap-2">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded" />)}
                </div>
              ) : hotelResults && hotelResults.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {hotelResults.slice(0, 2).map((hotel) => (
                    <div
                      key={hotel.id}
                      className="flex items-center gap-3 p-3 bg-muted rounded cursor-pointer"
                      onClick={() => setBookingHotel(hotel)}
                    >
                      {hotel.imageUrl && (
                        <img src={hotel.imageUrl} alt={hotel.title} className="w-14 h-14 object-cover rounded" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{hotel.title}</p>
                        <div className="flex items-center gap-1">
                          {hotel.starRating && Array.from({ length: hotel.starRating }).map((_, i) => (
                            <Star key={i} size={10} style={{ fill: 'currentColor', color: 'var(--primary)' }} />
                          ))}
                          {hotel.rating && <span className="text-xs">{hotel.rating.toFixed(1)}</span>}
                        </div>
                      </div>
                      <p className="text-sm font-bold text-primary">
                        {formatPrice(hotel.price, hotel.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('trips.bookingAssistant.noHotelsFound', 'No hotels found')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hotel Booking Dialog */}
      <HotelBookingFlow
        hotel={bookingHotel}
        open={!!bookingHotel}
        onClose={() => setBookingHotel(null)}
        tripId={tripId}
      />
    </div>
  );
}
