import { useState, useMemo } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Plane,
  Hotel,
  Plus,
  Shield,
  MapPin,
  Star,
  Check,
  Ticket,
  ExternalLink,
} from '@/components/icons';
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
import { useActivitySearch } from '@/hooks/useActivitySearch';
import { useAuth } from '@/hooks/useAuth';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';
import { AirportAutocomplete } from '@/components/travel/AirportAutocomplete';
import { buildAviasalesUrl } from '@/utils/aviasalesUrl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useHotelSearch } from '@/hooks/useHotelSearch';
import type { BookingResult, BookingVertical } from '@/lib/booking/types';
import {
  useReservationMutations,
  useTripReservations,
  type Reservation,
} from '@/hooks/useTripReservations';
import { isValidHttpUrl } from '@/utils/url';
import { formatPrice, hasValidPrice } from '@/lib/booking/price';
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

type PartnerOffer = Pick<BookingResult, 'title' | 'provider' | 'vertical' | 'bookingUrl'> &
  Partial<Pick<BookingResult, 'price' | 'currency'>>;

interface Props {
  tripId: string;
  places: TripPlace[];
  primaryCityId?: string | null;
  canEdit: boolean;
  startInBooking?: boolean;
  startDate?: string;
  endDate?: string;
}

export function TripBookingAssistant({
  tripId,
  places,
  primaryCityId,
  canEdit,
  startInBooking = false,
  startDate,
  endDate,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { addPlace, updatePlace } = useTripMutations();
  const { addReservation } = useReservationMutations(tripId);
  const [activeTab, setActiveTab] = useState<'suggestions' | 'booking'>(
    startInBooking ? 'booking' : 'suggestions',
  );
  const [addingId, setAddingId] = useState<string | null>(null);
  const [vertical, setVertical] = useState<BookingVertical>('hotel');
  const [selectedOffer, setSelectedOffer] = useState<PartnerOffer | null>(null);
  const [originOverride, setOriginOverride] = useState<string>();
  const [destinationOverride, setDestinationOverride] = useState<string>();
  const [confirming, setConfirming] = useState<Reservation | null>(null);
  const [bookPlace, setBookPlace] = useState<TripPlace | null>(null);

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

  const {
    data: reservations = [],
    isSuccess: reservationsLoaded,
    isError: reservationsFailed,
    refetch: reloadReservations,
  } = useTripReservations(tripId);
  const { originIata } = useVisitorOrigin();
  const { user } = useAuth();
  const isBooked = (type: string) =>
    reservations.some((r) => r.type === type && ['confirmed', 'completed'].includes(r.status));
  const hasHotelBooked = isBooked('hotel');
  const pendingReservations = reservations.filter((r) => r.status === 'pending');
  const trackableReservations = reservations.filter((r) =>
    ['pending', 'confirmed', 'completed'].includes(r.status),
  );
  const placesToBook = places.filter(
    (place) => (place.booking_status ?? 'intent') === 'intent' && !place.reservation_id,
  );
  const availableStops = places.filter(
    (place) => !place.reservation_id && place.booking_status !== 'completed',
  );
  const [linking, setLinking] = useState<Reservation | null>(null);
  const [stopId, setStopId] = useState('');

  const linkReservation = async () => {
    if (
      !canEdit ||
      !linking ||
      updatePlace.isPending ||
      !availableStops.some((stop) => stop.id === stopId)
    )
      return;
    try {
      await updatePlace.mutateAsync({
        id: stopId,
        trip_id: tripId,
        onlyIfUnlinked: true,
        reservation_id: linking.id,
        booking_status: linking.status === 'pending' ? 'intent' : 'booked',
      });
      setLinking(null);
    } catch {
      toast({
        title: t('trips.bookingAssistant.saveFailed', 'Could not save reservation'),
        variant: 'destructive',
      });
    }
  };

  const saveOffer = async () => {
    if (!canEdit || !selectedOffer || addReservation.isPending || !reservationsLoaded) return;
    const offer = selectedOffer;
    const url = offer.bookingUrl;
    if (!url || !isValidHttpUrl(url)) return;
    const existing = pendingReservations.find(
      (r) =>
        r.user_id === user?.id &&
        r.type === offer.vertical &&
        r.provider === offer.provider &&
        r.booking_url === url,
    );
    try {
      if (!existing) {
        await addReservation.mutateAsync({
          trip_id: tripId,
          source: 'provider_api',
          type: offer.vertical,
          title: offer.title,
          status: 'pending',
          provider: offer.provider,
          booking_url: url,
          amount: hasValidPrice(offer.price) ? offer.price : null,
          currency: hasValidPrice(offer.price) ? (offer.currency ?? null) : null,
          confirmation_code: null,
          check_in: null,
          check_out: null,
          notes: null,
          place_id: null,
          attachment_urls: null,
        });
      }
      setSelectedOffer(null);
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
    includePartnerSearch: true,
    enabled: activeTab === 'booking' && vertical === 'hotel' && !hasHotelBooked,
  });

  const { data: activityResults, isLoading: activitiesLoading } = useActivitySearch({
    city: firstCity?.name,
    date: startDate,
    limit: 4,
    enabled: activeTab === 'booking' && vertical === 'activity',
  });

  const origin = originOverride ?? originIata ?? '';
  const destination = destinationOverride ?? firstCity?.major_airport_code ?? '';
  const flightUrl = buildAviasalesUrl({
    origin,
    destination,
    departDate: startDate,
    returnDate: endDate,
  }).url;
  const results = vertical === 'hotel' ? hotelResults : activityResults;
  const offersLoading = vertical === 'hotel' ? hotelsLoading : activitiesLoading;
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

  if (cityIds.length === 0 && places.length === 0 && reservations.length === 0 && !canEdit) {
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
          {trackableReservations.map((reservation) => {
            const linkedStop = places.find((place) => place.reservation_id === reservation.id);
            const pending = reservation.status === 'pending';
            return (
              <div
                key={reservation.id}
                role="group"
                aria-label={reservation.title}
                className="flex flex-wrap items-center gap-2 rounded-element border border-border bg-muted p-4"
              >
                <p className="min-w-0 flex-1 break-words font-medium">{reservation.title}</p>
                <Badge variant="outline">
                  {pending
                    ? t('trips.reservations.status.pending', 'Pending')
                    : t('trips.reservations.status.confirmed', 'Confirmed')}
                </Badge>
                {linkedStop && <span className="text-sm">{getPlaceName(linkedStop)}</span>}
                <div className="flex w-full flex-wrap items-center gap-2 empty:hidden sm:w-auto">
                  {pending &&
                    reservation.booking_url &&
                    isValidHttpUrl(reservation.booking_url) && (
                      <Button
                        asChild
                        className="h-auto min-h-12 w-full whitespace-normal px-4 py-2 text-center sm:min-h-11 sm:w-auto"
                      >
                        <a href={reservation.booking_url} target="_blank" rel="noopener noreferrer">
                          {t(
                            'trips.bookingAssistant.continueOnPartner',
                            'Continue on partner site',
                          )}
                          <ExternalLink aria-hidden />
                        </a>
                      </Button>
                    )}
                  {canEdit && !linkedStop && availableStops.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto flex-1 whitespace-normal px-2 py-2 text-center sm:flex-none sm:px-4"
                      onClick={() => {
                        setStopId('');
                        setLinking(reservation);
                      }}
                    >
                      {t('trips.bookingAssistant.linkStop', 'Link to itinerary stop')}
                    </Button>
                  )}
                  {pending && canEdit && reservation.user_id === user?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto flex-1 whitespace-normal px-2 py-2 text-center sm:flex-none sm:px-4"
                      onClick={() => setConfirming(reservation)}
                    >
                      {t('trips.bookingAssistant.recordConfirmation', 'Record confirmation')}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

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

          <div className="flex flex-wrap gap-2">
            {[
              { value: 'hotel', icon: Hotel, label: t('trips.bookingAssistant.hotel', 'Hotel') },
              {
                value: 'flight',
                icon: Plane,
                label: t('trips.bookingAssistant.flights', 'Flights'),
              },
              {
                value: 'activity',
                icon: Ticket,
                label: t('trips.bookingAssistant.activities', 'Activities'),
              },
            ].map(({ value, icon: Icon, label }) => (
              <Button
                key={value}
                size="sm"
                variant={vertical === value ? 'default' : 'outline'}
                aria-pressed={vertical === value}
                onClick={() => setVertical(value as BookingVertical)}
              >
                <Icon size={16} aria-hidden /> {label}
              </Button>
            ))}
          </div>

          {vertical === 'flight' ? (
            <Card>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <AirportAutocomplete
                    value={origin}
                    label={t('trips.bookingAssistant.fromAirport', 'Departure airport')}
                    onChange={setOriginOverride}
                  />
                  <AirportAutocomplete
                    value={destination}
                    label={t('trips.bookingAssistant.toAirport', 'Arrival airport')}
                    onChange={setDestinationOverride}
                  />
                </div>
                <Button
                  disabled={!canEdit || !flightUrl}
                  onClick={() =>
                    setSelectedOffer({
                      vertical: 'flight',
                      provider: 'aviasales',
                      title: `${origin} → ${destination}`,
                      bookingUrl: flightUrl ?? undefined,
                    })
                  }
                >
                  {t('trips.bookingAssistant.reviewFlight', 'Review flight search')}
                </Button>
              </CardContent>
            </Card>
          ) : vertical === 'hotel' && hasHotelBooked ? (
            <div className="flex items-center gap-2 p-4">
              <Check size={16} aria-hidden />
              {t('trips.bookingAssistant.hotelBooked', 'Hotel booked')}
            </div>
          ) : (
            <div className="space-y-4">
              {vertical === 'hotel' && (
                <Button asChild variant="outline" size="sm">
                  <LocalizedLink to={`/travel?${hotelSearchParams}`}>
                    {t('trips.bookingAssistant.search', 'Search')}
                  </LocalizedLink>
                </Button>
              )}
              {offersLoading ? (
                <Skeleton className="h-20" />
              ) : results?.length ? (
                <div className="flex flex-col gap-2">
                  {results.map((offer) => (
                    <button
                      key={offer.id}
                      type="button"
                      className="flex items-center gap-4 p-4 bg-muted rounded-element text-left disabled:opacity-60"
                      onClick={() => setSelectedOffer(offer)}
                      disabled={!canEdit || !offer.bookingUrl || !isValidHttpUrl(offer.bookingUrl)}
                    >
                      {offer.imageUrl && (
                        <img
                          src={offer.imageUrl}
                          alt=""
                          className="w-14 h-14 object-cover rounded-element"
                        />
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold break-words">{offer.title}</span>
                        {offer.rating ? (
                          <span className="flex items-center gap-1 text-xs">
                            <Star size={12} aria-hidden /> {offer.rating.toFixed(1)}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm font-bold text-primary">
                        {formatPrice(offer.price, offer.currency)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {vertical === 'hotel'
                    ? t('trips.bookingAssistant.noHotelsFound', 'No hotels found')
                    : t('trips.bookingAssistant.noActivitiesFound', 'No activities found')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog
        open={!!selectedOffer}
        onOpenChange={(open) => {
          if (!open && !addReservation.isPending) setSelectedOffer(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedOffer?.title}</DialogTitle>
            <DialogDescription>
              {t(
                'trips.bookingAssistant.completeOnPartner',
                'Complete your booking on the partner site.',
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedOffer && (
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>{selectedOffer.provider}</span>
              {hasValidPrice(selectedOffer.price) && selectedOffer.currency && (
                <span>{formatPrice(selectedOffer.price, selectedOffer.currency)}</span>
              )}
            </div>
          )}
          {reservationsFailed && (
            <div role="alert" className="flex flex-wrap items-center gap-2">
              <span>{t('trips.contextBar.loadError', 'Trip details could not be loaded')}</span>
              <Button variant="outline" size="sm" onClick={() => void reloadReservations()}>
                {t('common.retry', 'Try again')}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedOffer(null)}
              disabled={addReservation.isPending}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={() => void saveOffer()}
              disabled={!canEdit || addReservation.isPending || !reservationsLoaded}
            >
              {t('trips.bookingAssistant.savePending', 'Save as pending')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!linking}
        onOpenChange={(open) => {
          if (!open && !updatePlace?.isPending) setLinking(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('trips.bookingAssistant.linkStop', 'Link to itinerary stop')}
            </DialogTitle>
            <DialogDescription>{linking?.title}</DialogDescription>
          </DialogHeader>
          <select
            aria-label={t('trips.bookingAssistant.linkStop', 'Link to itinerary stop')}
            value={stopId}
            onChange={(event) => setStopId(event.target.value)}
            className="min-h-11 w-full rounded-element border border-border bg-background px-4"
          >
            <option value="">—</option>
            {availableStops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {getPlaceName(stop)}
              </option>
            ))}
          </select>
          <DialogFooter>
            <Button
              onClick={() => void linkReservation()}
              disabled={!stopId || updatePlace?.isPending}
            >
              {t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          initialStatus="confirmed"
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
