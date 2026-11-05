import { useState, useMemo } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Plane, Hotel, Plus, Shield, MapPin, Star, Check } from '@/components/icons';
import {
  fetchBookingAssistantCities,
  fetchBookingAssistantVenues,
} from '@/hooks/useTripBookingAssistant';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations, type TripPlace } from '@/hooks/useTrips';
import { useHotelSearch } from '@/hooks/useHotelSearch';
import type { BookingResult } from '@/lib/booking/types';
import {
  useReservationMutations,
  useTripReservations,
  type Reservation,
} from '@/hooks/useTripReservations';
import { isValidHttpUrl } from '@/utils/url';
import { formatPrice } from '@/lib/booking/price';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { PlaceBookableLinks } from './PlaceBookableLinks';
import { AddReservationDialog } from './AddReservationDialog';
import { getPlaceName, getPlaceCategory } from './SortablePlaceCard';
import { qk } from '@/lib/queryKeys';

function reservationTypeForCategory(category: string): 'hotel' | 'activity' | 'flight' | 'other' {
  if (category === 'hotel') return 'hotel';
  if (category === 'event' || category === 'venue') return 'activity';
  return 'other';
}

interface Props {
  tripId: string;
  places: TripPlace[];
  primaryCityId?: string | null;
  canEdit: boolean;
  startDate?: string;
  endDate?: string;
}

export function TripBookingAssistant({
  tripId,
  places,
  primaryCityId,
  canEdit,
  startDate,
  endDate,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { addPlace, updatePlace } = useTripMutations();
  const { addReservation } = useReservationMutations(tripId);
  const [activeTab, setActiveTab] = useState<'suggestions' | 'booking'>('suggestions');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [selectedHotel, setSelectedHotel] = useState<BookingResult | null>(null);
  const [savedHotelId, setSavedHotelId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Reservation | null>(null);
  const [bookPlace, setBookPlace] = useState<TripPlace | null>(null);

  // Places already added to the itinerary but not yet booked — the actionable
  // core of the affiliate loop. Each row carries its provider deep-links (dates
  // prefilled) + a one-tap "Mark booked".
  const placesToBook = useMemo(
    () => places.filter((p) => (p.booking_status ?? 'intent') === 'intent'),
    [places],
  );

  const tabs = [
    {
      key: 'suggestions' as const,
      label: t('trips.bookingAssistant.tabs.suggestions', 'Suggestions'),
      icon: MapPin,
    },
    { key: 'booking' as const, label: t('trips.bookingAssistant.tabs.book', 'Book'), icon: Hotel },
  ];

  const cityIds = useMemo(() => {
    const ids = new Set<string>();
    if (primaryCityId) ids.add(primaryCityId);
    for (const p of places) {
      if (p.city_id) ids.add(p.city_id);
    }
    return Array.from(ids);
  }, [places, primaryCityId]);

  const { data: cities } = useQuery({
    queryKey: qk.trip.suggestions('cities', cityIds),
    queryFn: () => fetchBookingAssistantCities(cityIds),
    enabled: cityIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const { data: reservations = [] } = useTripReservations(tripId);
  const isBooked = (type: string) =>
    reservations.some((r) => r.type === type && ['confirmed', 'completed'].includes(r.status));
  const hasHotelBooked = isBooked('hotel');
  const hasFlightBooked = isBooked('flight');
  const pendingHotels = reservations.filter((r) => r.type === 'hotel' && r.status === 'pending');

  const saveHotel = async () => {
    if (!canEdit || !selectedHotel || addReservation.isPending) return;
    const hotel = selectedHotel;
    const url = hotel.bookingUrl;
    if (!url || !isValidHttpUrl(url)) return;
    const existing = pendingHotels.find(
      (r) => r.provider === hotel.provider && r.booking_url === url,
    );
    try {
      const saved =
        existing ??
        (await addReservation.mutateAsync({
          trip_id: tripId,
          source: 'provider_api',
          type: 'hotel',
          title: hotel.title,
          status: 'pending',
          provider: hotel.provider,
          booking_url: url,
          amount: hotel.price,
          currency: hotel.currency,
          confirmation_code: null,
          check_in: null,
          check_out: null,
          notes: null,
          place_id: null,
          attachment_urls: null,
        }));
      setSavedHotelId(saved.id);
      setSelectedHotel(null);
    } catch {
      toast({
        title: t('trips.bookingAssistant.saveFailed', 'Could not save reservation'),
        variant: 'destructive',
      });
    }
  };

  // Venue suggestions per city
  const { data: venues, isLoading: venuesLoading } = useQuery({
    queryKey: qk.trip.suggestions('venues', cityIds),
    queryFn: () => fetchBookingAssistantVenues(cityIds),
    enabled: cityIds.length > 0 && activeTab === 'suggestions',
    staleTime: 10 * 60 * 1000,
  });

  const firstCity = cities?.find((city) => city.id === cityIds[0]);
  const hotelSearchParams = new URLSearchParams({ tab: 'hotels' });
  if (firstCity) hotelSearchParams.set('city', firstCity.name);
  if (startDate) hotelSearchParams.set('checkIn', startDate);
  if (endDate) hotelSearchParams.set('checkOut', endDate);

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
    // `?? 100` here was unreachable — the != null guard already ran.
    (c) => c.countries?.equality_score != null && c.countries.equality_score < 40,
  );

  const handleAddVenue = async (venue: {
    id: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    city_id: string | null;
    country_id: string | null;
  }) => {
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
      toast({
        title: t('trips.bookingAssistant.addFailedToast', 'Failed to add'),
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setAddingId(null);
    }
  };

  if (cityIds.length === 0 && places.length === 0 && reservations.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center">
            {t(
              'trips.bookingAssistant.emptyHint',
              'Add places to see suggestions and booking options',
            )}
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
          <Button
            key={key}
            size="sm"
            variant={activeTab === key ? 'default' : 'outline'}
            aria-pressed={activeTab === key}
            onClick={() => setActiveTab(key)}
          >
            <Icon size={13} />
            {label}
          </Button>
        ))}
      </div>

      {/* Safety warnings */}
      {unsafeCities.map((city) => (
        <Card key={city.id} className="mb-2">
          <CardContent>
            <div
              className="flex items-start gap-2 -mx-4 -mt-2 -mb-2 p-4 rounded-element"
              style={{ backgroundColor: 'hsl(var(--warning) / 0.2)' }}
            >
              <Shield
                size={16}
                style={{ color: 'hsl(var(--warning))' }}
                className="shrink-0 mt-0.5"
              />
              <p className="text-sm">
                <strong>{city.name}</strong>{' '}
                {t('trips.bookingAssistant.lowerEquality', 'has a lower equality score')} (
                {city.countries?.equality_score}).
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
              <TrackLoader size={24} label="Loading" />
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
                    {t('trips.bookingAssistant.suggestedFor', 'Suggested for {{city}}', {
                      city: city?.name || t('trips.bookingAssistant.unknownCity', 'Unknown'),
                    })}
                  </span>
                  {cityVenues.map((venue) => (
                    <div key={venue.id} className="flex items-center gap-2 py-1.5 min-h-11">
                      <MapPin size={13} className="text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate font-medium">{venue.name}</p>
                        {venue.category && <Badge variant="outline">{venue.category}</Badge>}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAddVenue(venue)}
                        disabled={!canEdit || addingId === venue.id}
                      >
                        {addingId === venue.id ? (
                          <TrackLoader size={12} label="Loading" />
                        ) : (
                          <Plus size={12} />
                        )}
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
          {/* Places to book — itinerary items still in "intent" status */}
          {placesToBook.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground font-semibold mb-2 block">
                {t('trips.bookingAssistant.placesToBook', 'Places to book ({{count}})', {
                  count: placesToBook.length,
                })}
              </span>
              <div className="flex flex-col gap-1">
                {placesToBook.map((place) => {
                  const cat = getPlaceCategory(place);
                  return (
                    <div key={place.id} className="flex items-center gap-2 py-1.5 min-h-11">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{getPlaceName(place)}</p>
                      </div>
                      <PlaceBookableLinks
                        tripId={tripId}
                        tripPlaceId={place.id}
                        category={cat as 'venue' | 'event' | 'hotel' | 'custom'}
                        name={getPlaceName(place)}
                        cityName={place.cities?.name ?? null}
                        startDate={startDate ?? null}
                        endDate={endDate ?? null}
                        bookingStatus={place.booking_status ?? 'intent'}
                        onBookingPrompt={canEdit ? () => setBookPlace(place) : undefined}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBookPlace(place)}
                        disabled={!canEdit}
                        className="h-6 px-2 text-xs2"
                      >
                        {t('trips.bookingAssistant.markBooked', 'Mark booked')}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {selectedHotel && (
            <Card>
              <CardContent className="space-y-4">
                <h3 className="font-semibold">{selectedHotel.title}</h3>
                <p>
                  {t(
                    'trips.bookingAssistant.completeOnPartner',
                    'Complete your booking on the partner site.',
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void saveHotel()} disabled={addReservation.isPending}>
                    {t('trips.bookingAssistant.savePending', 'Save as pending')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedHotel(null)}
                    disabled={addReservation.isPending}
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {pendingHotels.map((hotel) => (
            <div
              key={hotel.id}
              className="flex flex-wrap items-center gap-2 p-4 bg-muted rounded-element"
            >
              <p className="flex-1 font-medium">{hotel.title}</p>
              <Badge variant="outline">{t('trips.reservations.status.pending', 'Pending')}</Badge>
              {hotel.booking_url && isValidHttpUrl(hotel.booking_url) && (
                <Button
                  asChild
                  variant={savedHotelId === hotel.id ? 'default' : 'outline'}
                  size="sm"
                >
                  <a href={hotel.booking_url} target="_blank" rel="noopener noreferrer">
                    {t('trips.bookingAssistant.continueOnPartner', 'Continue on partner site')}
                  </a>
                </Button>
              )}
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setConfirming(hotel)}>
                  {t('trips.bookingAssistant.recordConfirmation', 'Record confirmation')}
                </Button>
              )}
            </div>
          ))}

          {/* Still need section */}
          <span className="text-xs text-muted-foreground font-semibold">
            {t('trips.bookingAssistant.stillNeed', 'Still need')}
          </span>

          {!hasFlightBooked && (
            <div className="flex items-center gap-2 p-4 bg-muted rounded-element">
              <Plane size={16} className="text-muted-foreground" />
              <p className="text-sm flex-1">{t('trips.bookingAssistant.flights', 'Flights')}</p>
              {/* asChild, not a Link wrapping a Button — that nests a <button>
                  inside an <a>, which is invalid HTML. */}
              <Button asChild variant="outline" size="sm">
                <LocalizedLink to="/travel?tab=flights" className="no-underline">
                  {t('trips.bookingAssistant.search', 'Search')}
                </LocalizedLink>
              </Button>
            </div>
          )}
          {hasFlightBooked && (
            <div className="flex items-center gap-2 p-4 opacity-60">
              <Check size={16} style={{ color: 'hsl(var(--success))' }} />
              <p className="text-sm">
                {t('trips.bookingAssistant.flightsBooked', 'Flights booked')}
              </p>
            </div>
          )}

          {!hasHotelBooked && (
            <div className="flex items-center gap-2 p-4 bg-muted rounded-element">
              <Hotel size={16} className="text-muted-foreground" />
              <p className="text-sm flex-1">
                {firstCity
                  ? t('trips.bookingAssistant.hotelIn', 'Hotel in {{city}}', {
                      city: firstCity.name,
                    })
                  : t('trips.bookingAssistant.hotel', 'Hotel')}
              </p>
              <Button asChild variant="outline" size="sm">
                <LocalizedLink to={`/travel?${hotelSearchParams}`} className="no-underline">
                  {t('trips.bookingAssistant.search', 'Search')}
                </LocalizedLink>
              </Button>
            </div>
          )}
          {hasHotelBooked && (
            <div className="flex items-center gap-2 p-4 opacity-60">
              <Check size={16} style={{ color: 'hsl(var(--success))' }} />
              <p className="text-sm">{t('trips.bookingAssistant.hotelBooked', 'Hotel booked')}</p>
            </div>
          )}

          {/* Quick hotel results */}
          {!hasHotelBooked && firstCity && (
            <div>
              <span className="text-xs text-muted-foreground font-semibold mb-2 block">
                {t('trips.bookingAssistant.hotelsIn', 'Hotels in {{city}}', {
                  city: firstCity.name,
                })}
              </span>
              {hotelsLoading ? (
                <div className="flex flex-col gap-2">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              ) : hotelResults && hotelResults.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {hotelResults.slice(0, 2).map((hotel) => (
                    <button
                      key={hotel.id}
                      type="button"
                      className="flex items-center gap-4 p-4 bg-muted rounded-element text-left disabled:opacity-60"
                      onClick={() => setSelectedHotel(hotel)}
                      disabled={!canEdit || !hotel.bookingUrl || !isValidHttpUrl(hotel.bookingUrl)}
                    >
                      {hotel.imageUrl && (
                        <img
                          src={hotel.imageUrl}
                          alt={hotel.title}
                          className="w-14 h-14 object-cover rounded-element"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{hotel.title}</p>
                        <div className="flex items-center gap-1">
                          {hotel.starRating &&
                            Array.from({ length: hotel.starRating }).map((_, i) => (
                              <Star
                                key={i}
                                size={10}
                                style={{ fill: 'currentColor' }}
                                className="text-primary"
                              />
                            ))}
                          {hotel.rating && (
                            <span className="text-xs">{hotel.rating.toFixed(1)}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-bold text-primary">
                        {formatPrice(hotel.price, hotel.currency)}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('trips.bookingAssistant.noHotelsFound', 'No hotels found')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {confirming && (
        <AddReservationDialog
          open
          onClose={() => setConfirming(null)}
          tripId={tripId}
          existing={{ ...confirming, status: 'confirmed' }}
        />
      )}

      {bookPlace && (
        <AddReservationDialog
          open={!!bookPlace}
          onClose={() => setBookPlace(null)}
          tripId={tripId}
          initialTitle={getPlaceName(bookPlace)}
          initialType={reservationTypeForCategory(getPlaceCategory(bookPlace))}
          onCreated={(res) => {
            void updatePlace.mutateAsync({
              id: bookPlace.id,
              reservation_id: res.id,
              booking_status: 'booked',
            });
          }}
        />
      )}
    </div>
  );
}
