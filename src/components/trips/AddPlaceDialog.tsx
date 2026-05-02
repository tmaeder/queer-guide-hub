import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import { Search, MapPin, Star, Clock, X } from 'lucide-react';
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
import { listFromWhere } from '@/hooks/usePageFetchers';
import { useTripMutations, type TripDay } from '@/hooks/useTrips';
import { useVenueSocialSignals } from '@/hooks/useVenueSocialSignals';
import { SocialSignalBadges } from './SocialSignalBadges';

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

const RECENT_SEARCHES_KEY = 'trips.addPlace.recentSearches';
const MAX_RECENT = 5;

type TypeFilter = 'all' | 'venue' | 'event' | 'hotel';

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string): string[] {
  try {
    const existing = loadRecentSearches().filter((s) => s.toLowerCase() !== query.toLowerCase());
    const next = [query, ...existing].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  tripId: string;
  days: TripDay[];
  preselectedDayId?: string | null;
}

export function AddPlaceDialog({ open, onClose, tripId, days, preselectedDayId }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { addPlace } = useTripMutations();
  const [mode, setMode] = useState('search');
  const [dayId, setDayId] = useState<string>(preselectedDayId || '');
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    if (open) setRecentSearches(loadRecentSearches());
  }, [open]);

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

  const runSearch = async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) return;
    setSearching(true);
    setSelected(null);
    setTypeFilter('all');

    try {
      setSearchQuery(query);
      type VenueRow = { id: string; name: string; category?: string; city_id?: string; country_id?: string; latitude?: number; longitude?: number; address?: string; foursquare_rating?: number };
      type EventRow = { id: string; title: string; event_type?: string; city_id?: string; country_id?: string; latitude?: number; longitude?: number };
      type HotelRow = { id: string; name: string; star_rating?: number; city_id?: string; country_id?: string; latitude?: number; longitude?: number; address?: string };
      const [venues, events, hotels] = await Promise.all([
        listFromWhere<VenueRow>(
          'venues',
          'id, name, category, city_id, country_id, latitude, longitude, address, foursquare_rating',
          [{ op: 'ilike', col: 'name', val: `%${query}%` }],
          { limit: 10 },
        ),
        listFromWhere<EventRow>(
          'events',
          'id, title, event_type, city_id, country_id, latitude, longitude',
          [{ op: 'ilike', col: 'title', val: `%${query}%` }],
          { limit: 10 },
        ),
        listFromWhere<HotelRow>(
          'hotels',
          'id, name, star_rating, city_id, country_id, latitude, longitude, address',
          [{ op: 'ilike', col: 'name', val: `%${query}%` }],
          { limit: 10 },
        ),
      ]);

      const mapped: SearchResult[] = [
        ...venues.map((v) => ({
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
      if (mapped.length > 0) {
        setRecentSearches(saveRecentSearch(query));
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = () => runSearch(searchQuery);

  const clearRecent = () => {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // ignore
    }
    setRecentSearches([]);
  };

  const filteredResults = typeFilter === 'all' ? results : results.filter((r) => r.type === typeFilter);
  const countFor = (t: TypeFilter) => (t === 'all' ? results.length : results.filter((r) => r.type === t).length);

  const venueIdsInResults = filteredResults.filter((r) => r.type === 'venue').map((r) => r.id);
  const { data: socialSignals } = useVenueSocialSignals(venueIdsInResults);

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
      toast({ title: t('trips.addPlace.addedToast', 'Place added to trip') });
      resetAndClose();
    } catch (err) {
      toast({ title: t('trips.addPlace.addFailedToast', 'Failed to add place'), description: String(err), variant: 'destructive' });
    }
  };

  const canSubmit =
    (mode === 'search' && selected !== null) || (mode === 'custom' && customName.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('trips.addPlace.title', 'Add Place')}</DialogTitle>
        </DialogHeader>

        <Box sx={{ mt: 1, mb: 1 }}>
          <TextField
            label={t('trips.addPlace.assignToDay', 'Assign to Day')}
            select
            fullWidth
            size="small"
            value={dayId}
            onChange={(e) => setDayId(e.target.value)}
          >
            <MenuItem value="">{t('trips.addPlace.unassigned', 'Unassigned')}</MenuItem>
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
            <TabsTrigger value="search">{t('trips.addPlace.searchTab', 'Search queer.guide')}</TabsTrigger>
            <TabsTrigger value="custom">{t('trips.addPlace.customTab', 'Custom Place')}</TabsTrigger>
          </TabsList>

          <TabsContent value="search">
            <TextField
              placeholder={t('trips.addPlace.searchPlaceholder', 'Search venues, events, hotels...')}
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
                    <CircularProgress size={18} aria-label="Loading" />
                  </InputAdornment>
                ) : null,
              }}
            />
            <Button variant="ghost" size="sm" onClick={handleSearch} disabled={!searchQuery.trim()} className="mt-1">
              {t('common.search', 'Search')}
            </Button>

            {results.length === 0 && !searching && recentSearches.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <Clock size={12} /> {t('trips.addPlace.recent', 'Recent')}
                  </Typography>
                  <Button variant="ghost" size="sm" onClick={clearRecent} className="h-6 px-2 text-xs">
                    {t('common.clear', 'Clear')}
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {recentSearches.map((q) => (
                    <Chip
                      key={q}
                      label={q}
                      size="small"
                      variant="outlined"
                      onClick={() => runSearch(q)}
                      onDelete={() => {
                        const next = recentSearches.filter((s) => s !== q);
                        setRecentSearches(next);
                        try {
                          localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
                        } catch {
                          // ignore
                        }
                      }}
                      deleteIcon={<X size={12} />}
                      sx={{ cursor: 'pointer' }}
                    />
                  ))}
                </Box>
              </Box>
            )}

            {results.length > 0 && (
              <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {(['all', 'venue', 'event', 'hotel'] as TypeFilter[]).map((tf) => {
                  const count = countFor(tf);
                  if (tf !== 'all' && count === 0) return null;
                  const labelFallback = tf === 'all' ? 'All' : tf.charAt(0).toUpperCase() + tf.slice(1);
                  return (
                    <Chip
                      key={tf}
                      label={`${t(`trips.addPlace.filter.${tf}`, labelFallback)} (${count})`}
                      size="small"
                      color={typeFilter === tf ? 'primary' : 'default'}
                      variant={typeFilter === tf ? 'filled' : 'outlined'}
                      onClick={() => setTypeFilter(tf)}
                      sx={{ cursor: 'pointer' }}
                    />
                  );
                })}
              </Box>
            )}

            {filteredResults.length > 0 && (
              <List dense sx={{ mt: 1, maxHeight: 280, overflow: 'auto' }}>
                {filteredResults.map((r) => (
                  <ListItemButton
                    key={`${r.type}-${r.id}`}
                    selected={selected?.id === r.id && selected?.type === r.type}
                    onClick={() => setSelected(r)}
                    sx={{ minHeight: 44 }}
                  >
                    <ListItemText
                      primary={
                        <Box className="flex items-center gap-1.5 flex-wrap">
                          <span>{r.name}</span>
                          <Badge variant="outline">{r.type}</Badge>
                          {r.type === 'venue' && (
                            <SocialSignalBadges signal={socialSignals?.get(r.id)} />
                          )}
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
                {t('trips.addPlace.noResults', 'No results found. Try a different search or add a custom place.')}
              </Typography>
            )}
          </TabsContent>

          <TabsContent value="custom">
            <Box className="flex flex-col gap-3">
              <TextField
                label={t('trips.addPlace.placeName', 'Place Name')}
                required
                fullWidth
                size="small"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={t('trips.addPlace.placeNamePlaceholder', 'e.g. Rainbow Cafe')}
              />
              <TextField
                label={t('trips.addPlace.address', 'Address')}
                fullWidth
                size="small"
                value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value)}
              />
              <Box className="grid grid-cols-2 gap-3">
                <TextField
                  label={t('trips.addPlace.latitude', 'Latitude')}
                  type="number"
                  fullWidth
                  size="small"
                  value={customLat}
                  onChange={(e) => setCustomLat(e.target.value)}
                  inputProps={{ step: 'any' }}
                />
                <TextField
                  label={t('trips.addPlace.longitude', 'Longitude')}
                  type="number"
                  fullWidth
                  size="small"
                  value={customLng}
                  onChange={(e) => setCustomLng(e.target.value)}
                  inputProps={{ step: 'any' }}
                />
              </Box>
              <TextField
                label={t('trips.addPlace.category', 'Category')}
                select
                fullWidth
                size="small"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
              >
                {customCategories.map((c) => (
                  <MenuItem key={c} value={c}>
                    {t(`trips.addPlace.customCategories.${c}`, c.charAt(0).toUpperCase() + c.slice(1))}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={resetAndClose}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || addPlace.isPending}>
            {addPlace.isPending && <CircularProgress size={16} sx={{ mr: 1 }} aria-label="Loading" />}
            {t('trips.addPlace.title', 'Add Place')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
