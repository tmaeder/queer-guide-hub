import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import { useTheme } from '@mui/material/styles';
import { MapPin, Calendar, Shield, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { TripMap } from '@/components/trips/TripMap';

interface SharedTripData {
  trip: {
    id: string;
    title: string;
    description: string | null;
    start_date: string | null;
    end_date: string | null;
    currency: string;
  };
  permissions: {
    itinerary: boolean;
    budget: boolean;
    notes: boolean;
    packing: boolean;
  };
  days: Array<{
    id: string;
    date: string;
    title: string | null;
    notes: string | null;
    sort_order: number;
  }>;
  places: Array<{
    id: string;
    day_id: string | null;
    custom_name: string | null;
    custom_address: string | null;
    latitude: number | null;
    longitude: number | null;
    category: string | null;
    sort_order: number;
    start_time: string | null;
    end_time: string | null;
    venue_name: string | null;
    event_title: string | null;
    hotel_name: string | null;
    country_name: string | null;
    country_code: string | null;
    equality_score: number | null;
  }>;
  budget_items?: Array<{
    title: string;
    amount: number;
    currency: string;
    category: string | null;
    date: string | null;
  }>;
  notes?: Array<{
    title: string | null;
    content: string | null;
    category: string | null;
    is_pinned: boolean;
  }>;
  packing_items?: Array<{
    name: string;
    category: string | null;
    quantity: number;
    is_checked: boolean;
  }>;
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function SharedTripPage() {
  const { token } = useParams<{ token: string }>();
  const theme = useTheme();

  const { data, isLoading, error } = useQuery({
    queryKey: ['shared-trip', token],
    queryFn: async (): Promise<SharedTripData> => {
      const { data, error } = await supabase.rpc('get_shared_trip', { p_token: token! });
      if (error) throw error;
      return data as SharedTripData;
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <PageLoadingState count={4} />;

  if (error || !data) {
    return (
      <Box className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Trip not found
        </Typography>
        <Typography variant="body2" color="text.secondary">
          This share link may have expired or been removed.
        </Typography>
      </Box>
    );
  }

  const { trip, permissions, days, places } = data;
  const budgetItems = data.budget_items || [];
  const notes = data.notes || [];
  const packingItems = data.packing_items || [];

  const unsafeCountries = new Map<string, number>();
  for (const p of places) {
    if (p.equality_score != null && p.equality_score < 40 && p.country_name) {
      unsafeCountries.set(p.country_name, p.equality_score);
    }
  }

  const placesByDay = new Map<string | null, typeof places>();
  for (const p of places) {
    const key = p.day_id;
    if (!placesByDay.has(key)) placesByDay.set(key, []);
    placesByDay.get(key)!.push(p);
  }

  const mapPlaces = places.map((p) => ({
    id: p.id,
    trip_id: trip.id,
    day_id: p.day_id,
    venue_id: null,
    event_id: null,
    hotel_id: null,
    custom_name: p.venue_name || p.event_title || p.hotel_name || p.custom_name,
    custom_address: p.custom_address,
    latitude: p.latitude,
    longitude: p.longitude,
    city_id: null,
    country_id: null,
    start_time: p.start_time,
    end_time: p.end_time,
    duration_minutes: null,
    notes: null,
    category: p.category,
    sort_order: p.sort_order,
    created_by: null,
    created_at: '',
    venues: p.venue_name ? { id: '', name: p.venue_name, category: p.category, images: null, address: p.custom_address } : null,
    events: p.event_title ? { id: '', title: p.event_title, event_type: p.category, start_date: null, end_date: null, images: null } : null,
    hotels: p.hotel_name ? { id: '', name: p.hotel_name, star_rating: null, images: null, address: p.custom_address } : null,
    cities: null,
    countries: p.country_name ? { id: '', name: p.country_name, code: p.country_code, equality_score: p.equality_score } : null,
  }));

  const mapDays = days.map((d) => ({
    id: d.id,
    trip_id: trip.id,
    date: d.date,
    title: d.title,
    notes: d.notes,
    sort_order: d.sort_order,
  }));

  const availableTabs: string[] = ['itinerary'];
  if (permissions.budget && budgetItems.length > 0) availableTabs.push('budget');
  if (permissions.notes && notes.length > 0) availableTabs.push('notes');
  if (permissions.packing && packingItems.length > 0) availableTabs.push('packing');

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', px: 2, py: 4 }}>
      {/* Header */}
      <Box className="text-center mb-4">
        <Typography variant="h4" fontWeight={700} gutterBottom>
          {trip.title}
        </Typography>
        {trip.start_date && trip.end_date && (
          <Typography variant="body2" color="text.secondary">
            {format(new Date(trip.start_date), 'MMM d, yyyy')} - {format(new Date(trip.end_date), 'MMM d, yyyy')}
          </Typography>
        )}
        {trip.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {trip.description}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Shared via queer.guide
        </Typography>
      </Box>

      {/* Safety warnings */}
      {unsafeCountries.size > 0 && (
        <Card className="mb-3">
          <CardContent>
            <Box className="flex items-start gap-2" sx={{ bgcolor: 'warning.light', mx: -2, mt: -1, mb: -1, p: 2, borderRadius: 1 }}>
              <AlertTriangle size={16} style={{ color: theme.palette.warning?.main, flexShrink: 0, marginTop: 2 }} />
              <div>
                <Typography variant="subtitle2" fontWeight={600}>Safety Notice</Typography>
                {Array.from(unsafeCountries.entries()).map(([name, score]) => (
                  <Typography key={name} variant="body2">
                    {name} has a lower equality score ({score}). Research local conditions before traveling.
                  </Typography>
                ))}
              </div>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Map */}
      {mapPlaces.some((p) => p.latitude && p.longitude) && (
        <Box sx={{ height: 300, mb: 3, borderRadius: 2, overflow: 'hidden' }}>
          <TripMap places={mapPlaces as any} days={mapDays} />
        </Box>
      )}

      <Tabs defaultValue="itinerary">
        <TabsList>
          <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
          {permissions.budget && budgetItems.length > 0 && <TabsTrigger value="budget">Budget</TabsTrigger>}
          {permissions.notes && notes.length > 0 && <TabsTrigger value="notes">Notes</TabsTrigger>}
          {permissions.packing && packingItems.length > 0 && <TabsTrigger value="packing">Packing</TabsTrigger>}
        </TabsList>

        {/* Itinerary tab */}
        <TabsContent value="itinerary">
          {days.map((day, dayIdx) => {
            const dayPlaces = placesByDay.get(day.id) || [];
            return (
              <Card key={day.id} className="mb-2">
                <CardContent>
                  <Box className="flex items-center gap-2 mb-1">
                    <Badge variant="default">Day {dayIdx + 1}</Badge>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {format(new Date(day.date), 'EEEE, MMM d')}
                    </Typography>
                    {day.title && (
                      <Typography variant="body2" color="text.secondary">-- {day.title}</Typography>
                    )}
                  </Box>

                  {dayPlaces.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                      No places scheduled
                    </Typography>
                  )}

                  {dayPlaces.map((place) => {
                    const name = place.venue_name || place.event_title || place.hotel_name || place.custom_name || 'Unknown';
                    return (
                      <Box
                        key={place.id}
                        className="flex items-center gap-2 py-1.5"
                        sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
                      >
                        <MapPin size={14} style={{ color: theme.palette.text.secondary, flexShrink: 0 }} />
                        <div className="flex-1 min-w-0">
                          <Typography variant="body2" fontWeight={500}>{name}</Typography>
                          {place.custom_address && (
                            <Typography variant="caption" color="text.secondary">{place.custom_address}</Typography>
                          )}
                        </div>
                        {place.category && <Badge variant="outline">{place.category}</Badge>}
                      </Box>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}

          {/* Unassigned places */}
          {(placesByDay.get(null) || []).length > 0 && (
            <Card className="mb-2">
              <CardContent>
                <Typography variant="subtitle2" fontWeight={600} color="text.secondary" sx={{ mb: 1 }}>
                  Unassigned
                </Typography>
                {(placesByDay.get(null) || []).map((place) => {
                  const name = place.venue_name || place.event_title || place.hotel_name || place.custom_name || 'Unknown';
                  return (
                    <Box
                      key={place.id}
                      className="flex items-center gap-2 py-1.5"
                      sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
                    >
                      <MapPin size={14} style={{ color: theme.palette.text.secondary, flexShrink: 0 }} />
                      <Typography variant="body2" fontWeight={500} className="flex-1">{name}</Typography>
                      {place.category && <Badge variant="outline">{place.category}</Badge>}
                    </Box>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Budget tab */}
        {permissions.budget && (
          <TabsContent value="budget">
            {budgetItems.map((item, i) => (
              <Box
                key={i}
                className="flex items-center justify-between py-2"
                sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
              >
                <div>
                  <Typography variant="body2" fontWeight={500}>{item.title}</Typography>
                  <Box className="flex items-center gap-1.5">
                    {item.category && <Badge variant="outline">{item.category}</Badge>}
                    {item.date && <Typography variant="caption" color="text.secondary">{item.date}</Typography>}
                  </Box>
                </div>
                <Typography variant="body2" fontWeight={700}>
                  {formatAmount(item.amount, item.currency)}
                </Typography>
              </Box>
            ))}
          </TabsContent>
        )}

        {/* Notes tab */}
        {permissions.notes && (
          <TabsContent value="notes">
            <Box className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {notes.map((note, i) => (
                <Card key={i}>
                  <CardContent>
                    <Box className="flex items-start justify-between gap-1">
                      <Typography variant="subtitle2" fontWeight={600}>
                        {note.title || 'Untitled'}
                      </Typography>
                      {note.category && <Badge variant="outline">{note.category}</Badge>}
                    </Box>
                    {note.content && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mt: 0.5, fontSize: 12,
                          display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}
                      >
                        {note.content}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Box>
          </TabsContent>
        )}

        {/* Packing tab */}
        {permissions.packing && (
          <TabsContent value="packing">
            {(() => {
              const grouped = new Map<string, typeof packingItems>();
              for (const item of packingItems) {
                const cat = item.category || 'other';
                if (!grouped.has(cat)) grouped.set(cat, []);
                grouped.get(cat)!.push(item);
              }
              const checked = packingItems.filter((i) => i.is_checked).length;

              return (
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {checked}/{packingItems.length} packed
                  </Typography>
                  {Array.from(grouped.entries()).map(([cat, items]) => (
                    <Card key={cat} className="mb-2">
                      <CardContent>
                        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
                          {cat.charAt(0).toUpperCase() + cat.replace(/-/g, ' ').slice(1)}
                        </Typography>
                        {items.map((item, i) => (
                          <Box key={i} className="flex items-center gap-2 py-0.5">
                            <Box
                              sx={{
                                width: 16, height: 16, borderRadius: '4px',
                                border: '2px solid', borderColor: item.is_checked ? 'success.main' : 'divider',
                                bgcolor: item.is_checked ? 'success.main' : 'transparent',
                              }}
                            />
                            <Typography
                              variant="body2"
                              sx={{
                                textDecoration: item.is_checked ? 'line-through' : 'none',
                                color: item.is_checked ? 'text.disabled' : 'text.primary',
                              }}
                            >
                              {item.name}
                              {item.quantity > 1 && ` (x${item.quantity})`}
                            </Typography>
                          </Box>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </>
              );
            })()}
          </TabsContent>
        )}
      </Tabs>
    </Box>
  );
}

export default SharedTripPage;
