import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, MapPin, Star, Clock, X, Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
        ...events.map((e) => ({
          id: e.id, name: e.title, type: 'event' as const,
          latitude: e.latitude ?? undefined, longitude: e.longitude ?? undefined,
          country_id: e.country_id ?? undefined, city_id: e.city_id ?? undefined,
        })),
        ...hotels.map((h) => ({
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
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-border bg-background/60 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-foreground" aria-hidden="true" />
            {t('trips.addPlace.eyebrow', 'New place')}
          </span>
          <DialogTitle className="text-2xl font-bold tracking-tight">{t('trips.addPlace.title', 'Add Place')}</DialogTitle>
        </DialogHeader>

        <div className="mt-3 mb-1 flex flex-col gap-1.5">
          <Label htmlFor="add-place-day" className="text-xs uppercase tracking-wider text-muted-foreground">{t('trips.addPlace.assignToDay', 'Assign to Day')}</Label>
          <Select value={dayId || '__none__'} onValueChange={(v) => setDayId(v === '__none__' ? '' : v)}>
            <SelectTrigger id="add-place-day">
              <SelectValue placeholder={t('trips.addPlace.unassigned', 'Unassigned')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t('trips.addPlace.unassigned', 'Unassigned')}</SelectItem>
              {days.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {new Date(d.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {d.title ? ` -- ${d.title}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={mode} onValueChange={setMode}>
          <TabsList>
            <TabsTrigger value="search">{t('trips.addPlace.searchTab', 'Search queer.guide')}</TabsTrigger>
            <TabsTrigger value="custom">{t('trips.addPlace.customTab', 'Custom Place')}</TabsTrigger>
          </TabsList>

          <TabsContent value="search">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('trips.addPlace.searchPlaceholder', 'Search venues, events, hotels...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10 pr-10 h-11 rounded-xl"
              />
              {searching && (
                <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Loading" />
              )}
            </div>

            {results.length === 0 && !searching && recentSearches.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Clock size={12} /> {t('trips.addPlace.recent', 'Recent')}
                  </span>
                  <Button variant="ghost" size="sm" onClick={clearRecent} className="h-6 px-2 text-xs">
                    {t('common.clear', 'Clear')}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recentSearches.map((q) => (
                    <Badge
                      key={q}
                      variant="outline"
                      className="cursor-pointer inline-flex items-center gap-1 rounded-full hover:bg-muted transition-colors"
                      onClick={() => runSearch(q)}
                    >
                      {q}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = recentSearches.filter((s) => s !== q);
                          setRecentSearches(next);
                          try {
                            localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
                          } catch {
                            // ignore
                          }
                        }}
                        aria-label="Remove"
                        className="inline-flex"
                      >
                        <X size={12} />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {results.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(['all', 'venue', 'event', 'hotel'] as TypeFilter[]).map((tf) => {
                  const count = countFor(tf);
                  if (tf !== 'all' && count === 0) return null;
                  const labelFallback = tf === 'all' ? 'All' : tf.charAt(0).toUpperCase() + tf.slice(1);
                  const active = typeFilter === tf;
                  return (
                    <Badge
                      key={tf}
                      variant={active ? 'default' : 'outline'}
                      className="cursor-pointer rounded-full px-3 py-1 transition-all hover:shadow-sm"
                      onClick={() => setTypeFilter(tf)}
                    >
                      {`${t(`trips.addPlace.filter.${tf}`, labelFallback)} (${count})`}
                    </Badge>
                  );
                })}
              </div>
            )}

            {filteredResults.length > 0 && (
              <ul className="mt-3 max-h-[280px] overflow-auto flex flex-col gap-1 -mx-1 px-1">
                {filteredResults.map((r) => {
                  const isSelected = selected?.id === r.id && selected?.type === r.type;
                  return (
                    <li key={`${r.type}-${r.id}`}>
                      <button
                        type="button"
                        onClick={() => setSelected(r)}
                        className={`w-full text-left min-h-[52px] px-3 py-2.5 rounded-xl border transition-all ${isSelected ? 'bg-muted border-foreground/40 shadow-sm' : 'border-transparent hover:bg-muted/60 hover:border-border'}`}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium">{r.name}</span>
                          <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-wider">{r.type}</Badge>
                          {r.type === 'venue' && (
                            <SocialSignalBadges signal={socialSignals?.get(r.id)} />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
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
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {!searching && results.length === 0 && searchQuery.trim() && (
              <p className="text-sm text-muted-foreground mt-4 text-center">
                {t('trips.addPlace.noResults', 'No results found. Try a different search or add a custom place.')}
              </p>
            )}
          </TabsContent>

          <TabsContent value="custom">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="custom-name">{t('trips.addPlace.placeName', 'Place Name')} *</Label>
                <Input
                  id="custom-name"
                  required
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={t('trips.addPlace.placeNamePlaceholder', 'e.g. Rainbow Cafe')}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="custom-address">{t('trips.addPlace.address', 'Address')}</Label>
                <Input
                  id="custom-address"
                  value={customAddress}
                  onChange={(e) => setCustomAddress(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="custom-lat">{t('trips.addPlace.latitude', 'Latitude')}</Label>
                  <Input
                    id="custom-lat"
                    type="number"
                    step="any"
                    value={customLat}
                    onChange={(e) => setCustomLat(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="custom-lng">{t('trips.addPlace.longitude', 'Longitude')}</Label>
                  <Input
                    id="custom-lng"
                    type="number"
                    step="any"
                    value={customLng}
                    onChange={(e) => setCustomLng(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="custom-cat">{t('trips.addPlace.category', 'Category')}</Label>
                <Select value={customCategory} onValueChange={setCustomCategory}>
                  <SelectTrigger id="custom-cat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {customCategories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`trips.addPlace.customCategories.${c}`, c.charAt(0).toUpperCase() + c.slice(1))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={resetAndClose}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || addPlace.isPending}>
            {addPlace.isPending && <Loader2 size={16} className="mr-1 animate-spin" aria-label="Loading" />}
            {t('trips.addPlace.title', 'Add Place')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
