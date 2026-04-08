import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import { Search, MapPin, Star } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useTripMutations, type TripDay } from '@/hooks/useTrips';

interface SearchResult {
  id: string;
  name: string;
  type: 'venue' | 'event' | 'hotel';
  city?: string;
  rating?: number;
  address?: string;
  latitude?: number;
  longitude?: number;
  country_id?: string;
  city_id?: string;
}

const customCategories = [
  'restaurant', 'bar', 'club', 'cafe', 'museum', 'park',
  'beach', 'shopping', 'accommodation', 'transport', 'other',
];

interface Props {
  open: boolean;
  onClose: () => void;
  tripId: string;
  days: TripDay[];
  preselectedDayId?: string | null;
}

export function AddPlaceDialog({ open, onClose, tripId, days, preselectedDayId }: Props) {
  const { toast } = useToast();
  const { addPlace } = useTripMutations();
  const [mode, setMode] = useState('search');
  const [dayId, setDayId] = useState<string>(preselectedDayId || '');
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);

  const [customName, setCustomName] = useState('');
  const [customAddress, setCustomAddress] = useState('');
  const [customLat, setCustomLat] = useState('');
  const [customLng, setCustomLng] = useState('');
  const [customCategory, setCustomCategory] = useState('other');

  const resetAndClose = () => {
    setMode('search');
    setSearchQuery('');
    setResults([]);
    setSelected(null);
    setCustomName('');
    setCustomAddress('');
    setCustomLat('');
    setCustomLng('');
    setCustomCategory('other');
    setDayId(preselectedDayId || '');
    onClose();
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSelected(null);

    try {
      const query = searchQuery.trim();
      const [venuesRes, eventsRes, hotelsRes] = await Promise.all([
        supabase
          .from('venues')
          .select('id, name, category, city_id, country_id, latitude, longitude, address, foursquare_rating')
          .ilike('name', `%${query}%`)
          .limit(10),
        supabase
          .from('events')
          .select('id, title, event_type, city_id, country_id, latitude, longitude')
          .ilike('title', `%${query}%`)
          .limit(10),
        supabase
          .from('hotels')
          .select('id, name, star_rating, city_id, country_id, latitude, longitude, address')
          .ilike('name', `%${query}%`)
          .limit(10),
      ]);

      const mapped: SearchResult[] = [
        ...(venuesRes.data || []).map((v) => ({
          id: v.id, name: v.name, type: 'venue' as const,
          rating: v.foursquare_rating ?? undefined, address: v.address ?? undefined,
          latitude: v.latitude ?? undefined, longitude: v.longitude ?? undefined,
          country_id: v.country_id ?? undefined, city_id: v.city_id ?? undefined,
        })),
        ...(eventsRes.data || []).map((e) => ({
          id: e.id, name: e.title, type: 'event' as const,
          latitude: e.latitude ?? undefined, longitude: e.longitude ?? undefined,
          country_id: e.country_id ?? undefined, city_id: e.city_id ?? undefined,
        })),
        ...(hotelsRes.data || []).map((h) => ({
          id: h.id, name: h.name, type: 'hotel' as const,
          rating: h.star_rating ?? undefined, address: h.address ?? undefined,
          latitude: h.latitude ?? undefined, longitude: h.longitude ?? undefined,
          country_id: h.country_id ?? undefined, city_id: h.city_id ?? undefined,
        })),
      ];
      setResults(mapped);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async () => {
    try {
      if (mode === 'search' && selected) {
        await addPlace.mutateAsync({
          trip_id: tripId, day_id: dayId || null,
          venue_id: selected.type === 'venue' ? selected.id : null,
          event_id: selected.type === 'event' ? selected.id : null,
          hotel_id: selected.type === 'hotel' ? selected.id : null,
          custom_name: null, custom_address: selected.address || null,
          latitude: selected.latitude || null, longitude: selected.longitude || null,
          city_id: selected.city_id || null, country_id: selected.country_id || null,
          start_time: null, end_time: null, duration_minutes: null, notes: null,
          category: selected.type, sort_order: 0, created_by: null,
        });
      } else if (mode === 'custom' && customName.trim()) {
        await addPlace.mutateAsync({
          trip_id: tripId, day_id: dayId || null,
          venue_id: null, event_id: null, hotel_id: null,
          custom_name: customName.trim(), custom_address: customAddress.trim() || null,
          latitude: customLat ? parseFloat(customLat) : null,
          longitude: customLng ? parseFloat(customLng) : null,
          city_id: null, country_id: null,
          start_time: null, end_time: null, duration_minutes: null, notes: null,
          category: customCategory, sort_order: 0, created_by: null,
        });
      }
      toast({ title: 'Place added to trip' });
      resetAndClose();
    } catch (err) {
      toast({ title: 'Failed to add place', description: String(err), variant: 'destructive' });
    }
  };

  const canSubmit =
    (mode === 'search' && selected !== null) || (mode === 'custom' && customName.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Place</DialogTitle>
        </DialogHeader>

        <Box sx={{ mt: 1, mb: 1 }}>
          <TextField
            label="Assign to Day"
            select
            fullWidth
            size="small"
            value={dayId}
            onChange={(e) => setDayId(e.target.value)}
          >
            <MenuItem value="">Unassigned</MenuItem>
            {days.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {new Date(d.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                {d.title ? ` -- ${d.title}` : ''}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Tabs value={mode} onValueChange={setMode}>
          <TabsList>
            <TabsTrigger value="search">Search queer.guide</TabsTrigger>
            <TabsTrigger value="custom">Custom Place</TabsTrigger>
          </TabsList>

          <TabsContent value="search">
            <TextField
              placeholder="Search venues, events, hotels..."
              fullWidth
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
                endAdornment: searching ? (
                  <InputAdornment position="end">
                    <CircularProgress size={18} />
                  </InputAdornment>
                ) : null,
              }}
            />
            <Button variant="ghost" size="sm" onClick={handleSearch} disabled={!searchQuery.trim()} className="mt-1">
              Search
            </Button>

            {results.length > 0 && (
              <List dense sx={{ mt: 1, maxHeight: 280, overflow: 'auto' }}>
                {results.map((r) => (
                  <ListItemButton
                    key={`${r.type}-${r.id}`}
                    selected={selected?.id === r.id && selected?.type === r.type}
                    onClick={() => setSelected(r)}
                    sx={{ minHeight: 44 }}
                  >
                    <ListItemText
                      primary={
                        <Box className="flex items-center gap-1.5">
                          <span>{r.name}</span>
                          <Badge variant="outline">{r.type}</Badge>
                        </Box>
                      }
                      secondary={
                        <Box className="flex items-center gap-2 text-xs">
                          {r.address && (
                            <span className="flex items-center gap-0.5">
                              <MapPin size={10} /> {r.address}
                            </span>
                          )}
                          {r.rating != null && (
                            <span className="flex items-center gap-0.5">
                              <Star size={10} /> {r.rating}
                            </span>
                          )}
                        </Box>
                      }
                    />
                  </ListItemButton>
                ))}
              </List>
            )}

            {!searching && results.length === 0 && searchQuery.trim() && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                No results found. Try a different search or add a custom place.
              </Typography>
            )}
          </TabsContent>

          <TabsContent value="custom">
            <Box className="flex flex-col gap-3">
              <TextField
                label="Place Name"
                required
                fullWidth
                size="small"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Rainbow Cafe"
              />
              <TextField
                label="Address"
                fullWidth
                size="small"
                value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value)}
              />
              <Box className="grid grid-cols-2 gap-3">
                <TextField
                  label="Latitude"
                  type="number"
                  fullWidth
                  size="small"
                  value={customLat}
                  onChange={(e) => setCustomLat(e.target.value)}
                  inputProps={{ step: 'any' }}
                />
                <TextField
                  label="Longitude"
                  type="number"
                  fullWidth
                  size="small"
                  value={customLng}
                  onChange={(e) => setCustomLng(e.target.value)}
                  inputProps={{ step: 'any' }}
                />
              </Box>
              <TextField
                label="Category"
                select
                fullWidth
                size="small"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
              >
                {customCategories.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || addPlace.isPending}>
            {addPlace.isPending && <CircularProgress size={16} sx={{ mr: 1 }} />}
            Add Place
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
