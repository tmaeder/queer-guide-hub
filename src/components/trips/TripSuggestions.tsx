import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, MapPin, CalendarDays, Shield, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useTripMutations, type TripPlace, type TripDay } from '@/hooks/useTrips';
import { fetchTripSuggestionCities } from '@/hooks/useTripSuggestions';
import { fetchRecommendations } from '@/lib/searchClient';
import { resolveEntityGeo, tripPlaceRowFromGeo, type EntityGeo } from '@/lib/trips/resolveEntityGeo';

interface SuggestionItem {
  id: string;
  type: 'venue' | 'event';
  name: string;
  category: string | null;
  cityId: string;
  geo: EntityGeo | undefined;
}

interface Props {
  tripId: string;
  places: TripPlace[];
  days: TripDay[];
  startDate?: string;
  endDate?: string;
}

/**
 * "Suggested for this trip" — engine-backed recommendations scoped to the
 * trip's cities. Unlike the old naive `foursquare_rating` query, this consumes
 * the recommendation engine output (`fetchRecommendations` → the search-proxy
 * `/recommendations` endpoint), blending popularity + the user's tracked
 * engagement bias + quality/freshness. Geo is resolved client-side so added
 * places still get map pins and per-country safety scoring.
 */
export function TripSuggestions({ tripId, places }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { addPlacesBulk } = useTripMutations();
  const [filter, setFilter] = useState<'all' | 'venue' | 'event'>('all');
  const [addingId, setAddingId] = useState<string | null>(null);

  const filters: Array<{ key: 'all' | 'venue' | 'event'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'venue', label: 'Places' },
    { key: 'event', label: 'Events' },
  ];

  const cityIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of places) if (p.city_id) ids.add(p.city_id);
    return Array.from(ids);
  }, [places]);

  const existingIds = useMemo(
    () =>
      new Set(
        places.map((p) => p.venue_id ?? p.event_id).filter((id): id is string => !!id),
      ),
    [places],
  );
  const existingKey = useMemo(() => Array.from(existingIds).sort().join(','), [existingIds]);

  const { data: cities } = useQuery({
    queryKey: ['trip-suggestion-cities', cityIds],
    queryFn: () => fetchTripSuggestionCities(cityIds),
    enabled: cityIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['trip-suggestion-recs', cityIds, existingKey, user?.id],
    enabled: !!cities && cities.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<SuggestionItem[]> => {
      const perCity = await Promise.all(
        (cities ?? []).map(async (city) => {
          const hits = await fetchRecommendations({
            city: city.name,
            types: ['venue', 'event'],
            excludeIds: Array.from(existingIds),
            userId: user?.id ?? null,
            limit: 12,
          });
          return hits
            .filter((h) => h.type === 'venue' || h.type === 'event')
            .filter((h) => !!h.objectID && !existingIds.has(h.objectID))
            .map((h) => ({
              id: h.objectID as string,
              type: h.type as 'venue' | 'event',
              name: h.title ?? h.name ?? 'Untitled',
              category: (h.category as string) ?? null,
              cityId: city.id,
            }));
        }),
      );

      // De-dup across cities, then batch-resolve geo for all candidates.
      const flat: Omit<SuggestionItem, 'geo'>[] = [];
      const seen = new Set<string>();
      for (const list of perCity) {
        for (const item of list) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          flat.push(item);
        }
      }
      const geoMap = await resolveEntityGeo(flat.map((i) => ({ type: i.type, id: i.id })));
      return flat.map((i) => ({ ...i, geo: geoMap.get(i.id) }));
    },
  });

  const handleAdd = async (item: SuggestionItem) => {
    if (!item.geo) {
      toast({ title: 'Could not add', description: 'Missing place data.', variant: 'destructive' });
      return;
    }
    setAddingId(item.id);
    try {
      await addPlacesBulk.mutateAsync({ tripId, rows: [tripPlaceRowFromGeo(item.geo)] });
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
          <p className="text-sm text-muted-foreground text-center">Add cities to see suggestions</p>
        </CardContent>
      </Card>
    );
  }

  const unsafeCities = (cities || []).filter(
    (c) => c.countries?.equality_score != null && (c.countries?.equality_score ?? 100) < 40,
  );
  const citiesMap = new Map((cities || []).map((c) => [c.id, c]));
  const filtered = (suggestions || []).filter((s) => filter === 'all' || s.type === filter);

  return (
    <div>
      {/* Safety warnings */}
      {unsafeCities.map((city) => (
        <Card key={city.id} className="mb-2">
          <CardContent>
            <div className="flex items-start gap-2 -mx-2 -mt-1 -mb-1 p-2 bg-muted">
              <Shield size={16} className="text-foreground shrink-0 mt-0.5" />
              <p className="text-sm">
                <strong>{city.name}</strong> ({city.countries?.name}) has a lower equality score (
                {city.countries?.equality_score}). Check the Safety tab for local tips.
              </p>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Type filter */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {filters.map((f) => (
          <Badge
            key={f.key}
            variant={filter === f.key ? 'default' : 'outline'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Badge>
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 size={24} className="animate-spin" aria-label="Loading" />
        </div>
      )}

      {/* Suggestions grouped by city */}
      {!isLoading &&
        cityIds.map((cityId) => {
          const city = citiesMap.get(cityId);
          const cityItems = filtered.filter((s) => s.cityId === cityId).slice(0, 8);
          if (cityItems.length === 0) return null;

          return (
            <div key={cityId} className="mb-4">
              <span className="text-xs text-muted-foreground font-semibold mb-1 block">
                Suggested for {city?.name || 'Unknown City'}
              </span>

              {cityItems.map((item) => {
                const Icon = item.type === 'event' ? CalendarDays : MapPin;
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 py-1.5 border-b border-border min-h-11"
                  >
                    <Icon size={13} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      {item.category && (
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline">{item.category}</Badge>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAdd(item)}
                      disabled={addingId === item.id}
                    >
                      {addingId === item.id ? (
                        <Loader2 size={12} className="animate-spin" aria-label="Loading" />
                      ) : (
                        <Plus size={12} />
                      )}
                      Add
                    </Button>
                  </div>
                );
              })}
            </div>
          );
        })}

      {!isLoading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No suggestions right now. Try another filter.
        </p>
      )}
    </div>
  );
}
