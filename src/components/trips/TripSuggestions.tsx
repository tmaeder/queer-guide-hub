import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import CircularProgress from '@mui/material/CircularProgress';
import { Plus, MapPin, Star, AlertTriangle, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTripMutations, type TripPlace, type TripDay } from '@/hooks/useTrips';

interface SuggestedVenue {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  foursquare_rating: number | null;
  featured: boolean | null;
  latitude: number | null;
  longitude: number | null;
  city_id: string | null;
  country_id: string | null;
  images: string[] | null;
}

interface SuggestedEvent {
  id: string;
  title: string;
  event_type: string | null;
  start_date: string | null;
  end_date: string | null;
  latitude: number | null;
  longitude: number | null;
  city_id: string | null;
  country_id: string | null;
  images: string[] | null;
}

interface CityInfo {
  id: string;
  name: string;
  country_id: string | null;
  countries?: { equality_score: number | null; name: string } | null;
}

const NIGHTLIFE_CATEGORIES = ['bar', 'club', 'nightclub', 'pub', 'lounge', 'nightlife'];
const DINING_CATEGORIES = ['restaurant', 'cafe', 'coffee', 'food', 'bakery', 'dining'];
const CULTURE_CATEGORIES = ['museum', 'gallery', 'theater', 'theatre', 'landmark', 'monument', 'culture', 'art'];

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
  startDate: string | null;
  endDate: string | null;
}

export function TripSuggestions({ tripId, places, days, startDate, endDate }: Props) {
  const { addPlace } = useTripMutations();
  const [filter, setFilter] = useState(0);
  const [addingId, setAddingId] = useState<string | null>(null);

  const filterTabs = ['All', 'Nightlife', 'Dining', 'Culture', 'Events'];
  const filterKey = ['all', 'nightlife', 'dining', 'culture', 'events'][filter];

  // Collect unique city_ids from trip places
  const cityIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of places) {
      if (p.city_id) ids.add(p.city_id);
    }
    return Array.from(ids);
  }, [places]);

  // Fetch city info (for equality scores)
  const { data: cities } = useQuery({
    queryKey: ['trip-suggestion-cities', cityIds],
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

  // Fetch suggested venues
  const { data: venues, isLoading: venuesLoading } = useQuery({
    queryKey: ['trip-suggestion-venues', cityIds],
    queryFn: async () => {
      if (cityIds.length === 0) return [];
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, category, address, foursquare_rating, featured, latitude, longitude, city_id, country_id, images')
        .in('city_id', cityIds)
        .order('foursquare_rating', { ascending: false, nullsFirst: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as SuggestedVenue[];
    },
    enabled: cityIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch suggested events (during trip dates)
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['trip-suggestion-events', cityIds, startDate, endDate],
    queryFn: async () => {
      if (cityIds.length === 0) return [];
      let query = supabase
        .from('events')
        .select('id, title, event_type, start_date, end_date, latitude, longitude, city_id, country_id, images')
        .in('city_id', cityIds);

      if (startDate) {
        query = query.gte('start_date', startDate);
      }
      if (endDate) {
        query = query.lte('start_date', endDate);
      }

      const { data, error } = await query
        .order('start_date', { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data || []) as SuggestedEvent[];
    },
    enabled: cityIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  // IDs already in trip
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
    } finally {
      setAddingId(null);
    }
  };

  if (cityIds.length === 0) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Typography variant="body2" color="text.secondary" className="text-center">
            Add places with cities to get personalized suggestions.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const isLoading = venuesLoading || eventsLoading;

  // Safety warnings for low equality score destinations
  const unsafeCities = (cities || []).filter(
    (c) => c.countries?.equality_score != null && (c.countries?.equality_score ?? 100) < 40,
  );

  // Filter venues
  const filteredVenues = (venues || [])
    .filter((v) => !existingVenueIds.has(v.id))
    .filter((v) => filterKey === 'events' ? false : matchesFilter(v.category, filterKey));

  const filteredEvents = (events || [])
    .filter((e) => !existingEventIds.has(e.id))
    .filter(() => filterKey === 'all' || filterKey === 'events');

  // Group suggestions by city
  const citiesMap = new Map((cities || []).map((c) => [c.id, c]));

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Suggestions
        </Typography>

        {/* Safety warnings */}
        {unsafeCities.map((city) => (
          <Alert
            key={city.id}
            severity="warning"
            icon={<AlertTriangle size={16} />}
            sx={{ mb: 2, fontSize: 13 }}
          >
            <strong>{city.name}</strong> ({city.countries?.name}) has a lower equality score
            ({city.countries?.equality_score}). Check the Safety tab for local tips.
          </Alert>
        ))}

        {/* Filter tabs */}
        <Tabs
          value={filter}
          onChange={(_, v) => setFilter(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2, minHeight: 36 }}
        >
          {filterTabs.map((label) => (
            <Tab key={label} label={label} sx={{ minHeight: 36, py: 0.5, fontSize: 13 }} />
          ))}
        </Tabs>

        {isLoading && (
          <Box className="space-y-2">
            <Skeleton variant="rounded" height={60} />
            <Skeleton variant="rounded" height={60} />
            <Skeleton variant="rounded" height={60} />
          </Box>
        )}

        {/* Suggestions by city */}
        {!isLoading &&
          cityIds.map((cityId) => {
            const city = citiesMap.get(cityId);
            const cityVenues = filteredVenues.filter((v) => v.city_id === cityId).slice(0, 5);
            const cityEvents = filteredEvents.filter((e) => e.city_id === cityId).slice(0, 5);

            if (cityVenues.length === 0 && cityEvents.length === 0) return null;

            return (
              <Box key={cityId} sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  Suggested for {city?.name || 'Unknown City'}
                </Typography>

                {cityVenues.map((venue) => (
                  <Box
                    key={venue.id}
                    className="flex items-center gap-2 py-1.5"
                    sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
                  >
                    <MapPin size={13} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <Typography variant="body2" noWrap fontWeight={500}>
                        {venue.name}
                      </Typography>
                      <Box className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {venue.category && (
                          <Chip label={venue.category} size="small" sx={{ height: 16, fontSize: 10 }} />
                        )}
                        {venue.foursquare_rating && (
                          <span className="flex items-center gap-0.5">
                            <Star size={10} /> {venue.foursquare_rating}
                          </span>
                        )}
                      </Box>
                    </div>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => handleAddVenue(venue)}
                      disabled={addingId === venue.id}
                      startIcon={
                        addingId === venue.id ? <CircularProgress size={12} /> : <Plus size={12} />
                      }
                      sx={{ minWidth: 'auto', fontSize: 12 }}
                    >
                      Add
                    </Button>
                  </Box>
                ))}

                {cityEvents.map((event) => (
                  <Box
                    key={event.id}
                    className="flex items-center gap-2 py-1.5"
                    sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
                  >
                    <Calendar size={13} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <Typography variant="body2" noWrap fontWeight={500}>
                        {event.title}
                      </Typography>
                      <Box className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {event.event_type && (
                          <Chip label={event.event_type} size="small" sx={{ height: 16, fontSize: 10 }} />
                        )}
                        {event.start_date && (
                          <span>
                            {new Date(event.start_date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        )}
                      </Box>
                    </div>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => handleAddEvent(event)}
                      disabled={addingId === event.id}
                      startIcon={
                        addingId === event.id ? <CircularProgress size={12} /> : <Plus size={12} />
                      }
                      sx={{ minWidth: 'auto', fontSize: 12 }}
                    >
                      Add
                    </Button>
                  </Box>
                ))}
              </Box>
            );
          })}

        {!isLoading && filteredVenues.length === 0 && filteredEvents.length === 0 && (
          <Typography variant="body2" color="text.secondary" className="text-center py-4">
            No suggestions for this filter. Try another category.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
