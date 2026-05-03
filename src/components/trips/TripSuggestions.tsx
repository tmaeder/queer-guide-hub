import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, MapPin, Star, Shield, Calendar, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations, type TripPlace, type TripDay } from '@/hooks/useTrips';
import {
  fetchTripSuggestionCities,
  fetchTripSuggestionVenues,
  fetchTripSuggestionEvents,
  type TripSuggestionVenue as SuggestedVenue,
  type TripSuggestionEvent as SuggestedEvent,
} from '@/hooks/useTripSuggestions';

const NIGHTLIFE_CATEGORIES = ['bar', 'club', 'nightclub', 'pub', 'lounge', 'nightlife'];
const DINING_CATEGORIES = ['restaurant', 'cafe', 'coffee', 'food', 'bakery', 'dining'];
const CULTURE_CATEGORIES = [
  'museum',
  'gallery',
  'theater',
  'theatre',
  'landmark',
  'monument',
  'culture',
  'art',
];

function matchesFilter(category: string | null, filter: string): boolean {
  if (filter === 'all') return true;
  const cat = (category || '').toLowerCase();
  if (filter === 'nightlife') return NIGHTLIFE_CATEGORIES.some((c) => cat.includes(c));
  if (filter === 'dining') return DINING_CATEGORIES.some((c) => cat.includes(c));
  if (filter === 'culture') return CULTURE_CATEGORIES.some((c) => cat.includes(c));
  return false;
}

interface Props {
  tripId: string;
  places: TripPlace[];
  days: TripDay[];
  startDate?: string;
  endDate?: string;
}

export function TripSuggestions({ tripId, places, startDate, endDate }: Props) {
  const { toast } = useToast();
  const { addPlace } = useTripMutations();
  const [filter, setFilter] = useState('all');
  const [addingId, setAddingId] = useState<string | null>(null);

  const filters = ['All', 'Nightlife', 'Dining', 'Culture', 'Events'];
  const filterKeys = ['all', 'nightlife', 'dining', 'culture', 'events'];

  const cityIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of places) {
      if (p.city_id) ids.add(p.city_id);
    }
    return Array.from(ids);
  }, [places]);

  const { data: cities } = useQuery({
    queryKey: ['trip-suggestion-cities', cityIds],
    queryFn: () => fetchTripSuggestionCities(cityIds),
    enabled: cityIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const { data: venues, isLoading: venuesLoading } = useQuery({
    queryKey: ['trip-suggestion-venues', cityIds],
    queryFn: () => fetchTripSuggestionVenues(cityIds),
    enabled: cityIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['trip-suggestion-events', cityIds, startDate, endDate],
    queryFn: () => fetchTripSuggestionEvents(cityIds, startDate, endDate),
    enabled: cityIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const existingVenueIds = new Set(places.filter((p) => p.venue_id).map((p) => p.venue_id));
  const existingEventIds = new Set(places.filter((p) => p.event_id).map((p) => p.event_id));

  const handleAddVenue = async (venue: SuggestedVenue) => {
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
      toast({ title: 'Added to trip' });
    } catch (err) {
      toast({ title: 'Failed to add', description: String(err), variant: 'destructive' });
    } finally {
      setAddingId(null);
    }
  };

  const handleAddEvent = async (event: SuggestedEvent) => {
    setAddingId(event.id);
    try {
      await addPlace.mutateAsync({
        trip_id: tripId,
        day_id: null,
        venue_id: null,
        event_id: event.id,
        hotel_id: null,
        custom_name: null,
        custom_address: null,
        latitude: event.latitude,
        longitude: event.longitude,
        city_id: event.city_id,
        country_id: event.country_id,
        start_time: null,
        end_time: null,
        duration_minutes: null,
        notes: null,
        category: 'event',
        sort_order: 0,
        created_by: null,
      });
      toast({ title: 'Added to trip' });
    } catch (err) {
      toast({ title: 'Failed to add', description: String(err), variant: 'destructive' });
    } finally {
      setAddingId(null);
    }
  };

  if (cityIds.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center">
            Add cities to see suggestions
          </p>
        </CardContent>
      </Card>
    );
  }

  const isLoading = venuesLoading || eventsLoading;
  const unsafeCities = (cities || []).filter(
    (c) => c.countries?.equality_score != null && (c.countries?.equality_score ?? 100) < 40,
  );

  const filteredVenues = (venues || [])
    .filter((v) => !existingVenueIds.has(v.id))
    .filter((v) => (filter === 'events' ? false : matchesFilter(v.category, filter)));

  const filteredEvents = (events || [])
    .filter((e) => !existingEventIds.has(e.id))
    .filter(() => filter === 'all' || filter === 'events');

  const citiesMap = new Map((cities || []).map((c) => [c.id, c]));

  return (
    <div>
      {/* Safety warnings */}
      {unsafeCities.map((city) => (
        <Card key={city.id} className="mb-2">
          <CardContent>
            <div className="flex items-start gap-2 -mx-2 -mt-1 -mb-1 p-2 rounded bg-yellow-100 dark:bg-yellow-900/30">
              <Shield
                size={16}
                className="text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5"
              />
              <p className="text-sm">
                <strong>{city.name}</strong> ({city.countries?.name}) has a lower equality score (
                {city.countries?.equality_score}). Check the Safety tab for local tips.
              </p>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {filters.map((label, i) => (
          <Badge
            key={label}
            variant={filter === filterKeys[i] ? 'default' : 'outline'}
            onClick={() => setFilter(filterKeys[i])}
          >
            {label}
          </Badge>
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 size={24} className="animate-spin" aria-label="Loading" />
        </div>
      )}

      {/* Suggestions by city */}
      {!isLoading &&
        cityIds.map((cityId) => {
          const city = citiesMap.get(cityId);
          const cityVenues = filteredVenues.filter((v) => v.city_id === cityId).slice(0, 5);
          const cityEvents = filteredEvents.filter((e) => e.city_id === cityId).slice(0, 5);

          if (cityVenues.length === 0 && cityEvents.length === 0) return null;

          return (
            <div key={cityId} className="mb-4">
              <span className="text-xs text-muted-foreground font-semibold mb-1 block">
                Suggested for {city?.name || 'Unknown City'}
              </span>

              {cityVenues.map((venue) => (
                <div
                  key={venue.id}
                  className="flex items-center gap-2 py-1.5 border-b border-border min-h-[44px]"
                >
                  <MapPin size={13} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{venue.name}</p>
                    <div className="flex items-center gap-1.5">
                      {venue.category && <Badge variant="outline">{venue.category}</Badge>}
                      {venue.foursquare_rating && (
                        <div className="flex items-center gap-0.5">
                          <Star size={10} className="text-yellow-600 dark:text-yellow-400" />
                          <span className="text-[11px]">{venue.foursquare_rating}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddVenue(venue)}
                    disabled={addingId === venue.id}
                  >
                    {addingId === venue.id ? (
                      <Loader2 size={12} className="animate-spin" aria-label="Loading" />
                    ) : (
                      <Plus size={12} />
                    )}
                    Add
                  </Button>
                </div>
              ))}

              {cityEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-2 py-1.5 border-b border-border min-h-[44px]"
                >
                  <Calendar size={13} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{event.title}</p>
                    <div className="flex items-center gap-1.5">
                      {event.event_type && <Badge variant="outline">{event.event_type}</Badge>}
                      {event.start_date && (
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(event.start_date).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddEvent(event)}
                    disabled={addingId === event.id}
                  >
                    {addingId === event.id ? (
                      <Loader2 size={12} className="animate-spin" aria-label="Loading" />
                    ) : (
                      <Plus size={12} />
                    )}
                    Add
                  </Button>
                </div>
              ))}
            </div>
          );
        })}

      {!isLoading && filteredVenues.length === 0 && filteredEvents.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No suggestions for this filter. Try another category.
        </p>
      )}
    </div>
  );
}
