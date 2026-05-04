import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { TrendingByType } from '@/components/discovery/TrendingByType';
import { useEvents } from '@/hooks/useEvents';
import { useMeta } from '@/hooks/useMeta';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { EventCard } from '@/components/events/EventCard';
import { EventsCalendarView } from '@/components/events/EventsCalendarView';
import { TagSelector } from '@/components/tags/TagSelector';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { SearchInputTyped } from '@/components/ui/search-input-typed';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { EmptyState, LoadingTimeout, ErrorState } from '@/components/ui/EmptyState';
import {
  Calendar,
  Loader,
  Search,
  Filter,
  X,
  CalendarIcon,
  Check,
  ChevronDown,
  Grid,
  MapPin,
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { format } from 'date-fns';
import { dateFnsLocaleFor } from '@/i18n/dateFnsLocale';
import { displayCityName } from '@/utils/cityDisplay';
import { dedupeCitiesByNormalized, normalizeCityLabel } from '@/utils/dateRange';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '@/hooks/useDebounce';
import { useSearchParams } from 'react-router';


type Event = Database['public']['Tables']['events']['Row'];
const eventTypes = [
  'party',
  'workshop',
  'meetup',
  'pride',
  'festival',
  'rally',
  'conference',
  'social',
  'fundraiser',
  'performance',
];

const PRIDE_SUBTYPES: Array<{ tag: string; label: string }> = [
  { tag: 'pride:parade', label: 'Parade' },
  { tag: 'pride:week', label: 'Pride Week' },
  { tag: 'pride:festival', label: 'Festival' },
  { tag: 'pride:party', label: 'Party' },
  { tag: 'pride:rally', label: 'Rally / Protest' },
  { tag: 'pride:community', label: 'Community' },
];

const Events = () => {
  const { t, i18n } = useTranslation();
  const dfLocale = dateFnsLocaleFor(i18n.language);
  const navigate = useLocalizedNavigate();
  const { events, loading, error, hasMore, datasetTotal, fetchEvents, updateAttendance, loadingTimedOut } =
    useEvents(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useMeta({
    title: 'Events',
    description:
      'Discover and join LGBTQ+ community events — parties, meetups, pride marches, workshops, and more.',
    canonicalPath: '/events',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'LGBTQ+ Events',
      description: 'Discover and join LGBTQ+ community events worldwide.',
      url: 'https://queer.guide/events',
      isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
    },
  });

  const [_selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'calendar'>('grid');

  // Filter states
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [eventType, setEventType] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [nearMe, setNearMe] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [autoLocationLabel, setAutoLocationLabel] = useState<string | null>(null);
  const { location: visitorLocation } = useVisitorLocation();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;
  const [autoLoadedCount, setAutoLoadedCount] = useState(0);

  // Get unique cities from events for auto-suggest
  const availableCities = useMemo(
    () => dedupeCitiesByNormalized(events.map((event) => event.city).filter(Boolean) as string[]),
    [events],
  );
  const handleFiltersChange = async () => {
    const dateRange =
      startDate && endDate
        ? {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          }
        : undefined;
    const filters = {
      search: search || undefined,
      city: city || undefined,
      eventType: eventType && eventType !== 'all' ? eventType : undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      dateRange,
      nearMe: nearMe ? userLocation : undefined,
      includePast: showPast || undefined,
    };
    setPage(1);
    setAutoLoadedCount(0);
    await fetchEvents(filters, {
      page: 1,
      pageSize: PAGE_SIZE,
      append: false,
    });
  };
  const handleNearMe = async () => {
    if (!nearMe) {
      setLocationLoading(true);
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(location);
        setNearMe(true);

        // Clear city filter when using near me
        setCity('');

        // Fetch events near user
        fetchEvents({
          search: search || undefined,
          eventType: eventType && eventType !== 'all' ? eventType : undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
          nearMe: location,
          includePast: showPast || undefined,
        });
        toast({
          title: t('pages.events.locationFound', 'Location found'),
          description: t('pages.events.nearLocationDesc', 'Showing events near your location'),
        });
      } catch (_error) {
        toast({
          title: t('pages.events.locationError', 'Location Error'),
          description: t('pages.events.locationErrorDesc', 'Unable to get your location. Please allow location access.'),
          variant: 'destructive',
        });
      } finally {
        setLocationLoading(false);
      }
    } else {
      setNearMe(false);
      setUserLocation(null);
      handleFiltersChange();
    }
  };
  const clearFilters = async () => {
    setSearch('');
    setCity('');
    setAutoLocationLabel(null);
    setEventType('all');
    setSelectedTags([]);
    setStartDate(undefined);
    setEndDate(undefined);
    setNearMe(false);
    setUserLocation(null);
    setShowPast(false);
    setPage(1);
    setAutoLoadedCount(0);
    await fetchEvents(
      {},
      {
        page: 1,
        pageSize: PAGE_SIZE,
        append: false,
      },
    );
  };
  const handleAttendanceUpdate = async (
    eventId: string,
    status: 'going' | 'interested' | 'not_going',
  ) => {
    if (!user) {
      toast({
        title: t('pages.events.signInRequired', 'Sign in required'),
        description: t('pages.events.signInRsvp', 'Please sign in to RSVP to events.'),
        variant: 'destructive',
      });
      return;
    }
    const { error } = await updateAttendance(eventId, status);
    if (error) {
      toast({
        title: 'Error',
        description: error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: t('pages.events.rsvpUpdated', 'RSVP Updated'),
        description: `You're now marked as ${status} for this event.`,
      });
      fetchEvents(
        {},
        {
          page: 1,
          pageSize: PAGE_SIZE,
          append: false,
        },
      ); // Refresh to show updated attendance
    }
  };
  const handleViewDetails = (event: Event) => {
    setSelectedEvent(event);
  };
  const hasActiveFilters =
    search || city || eventType || selectedTags.length > 0 || startDate || endDate || nearMe || showPast;
  const autoInitDone = useRef(false);
  useEffect(() => {
    if (autoInitDone.current) return;
    autoInitDone.current = true;
    setPage(1);
    setAutoLoadedCount(0);
    const cityName = visitorLocation?.city;
    if (cityName) {
      setCity(cityName);
      setAutoLocationLabel(cityName);
      fetchEvents({ city: cityName }, { page: 1, pageSize: PAGE_SIZE, append: false });
    } else {
      fetchEvents({}, { page: 1, pageSize: PAGE_SIZE, append: false });
    }
  // run once on mount; visitorLocation may not yet be available but that is fine — user can still see all events
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when the past-events toggle changes
  const showPastMounted = useRef(false);
  useEffect(() => {
    if (!showPastMounted.current) {
      showPastMounted.current = true;
      return;
    }
    handleFiltersChange();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPast]);

  // Reactive city filter — fire as soon as a value is picked from the
  // combobox. Avoids the "user picks London but list doesn't update" trap.
  const cityMounted = useRef(false);
  useEffect(() => {
    if (!cityMounted.current) {
      cityMounted.current = true;
      return;
    }
    handleFiltersChange();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  // Debounced search — apply ~300ms after the user stops typing so the
  // list filters live. Enter still flushes immediately via onKeyDown.
  const debouncedSearch = useDebounce(search, 300);
  const searchMounted = useRef(false);
  useEffect(() => {
    if (!searchMounted.current) {
      searchMounted.current = true;
      return;
    }
    handleFiltersChange();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Sync city + search to URL params for shareable / refreshable state.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (city) next.set('city', city);
    else next.delete('city');
    if (debouncedSearch) next.set('q', debouncedSearch);
    else next.delete('q');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, debouncedSearch]);

  // Hydrate filters from URL on first mount.
  useEffect(() => {
    const urlCity = searchParams.get('city');
    const urlQ = searchParams.get('q');
    if (urlCity) setCity(urlCity);
    if (urlQ) setSearch(urlQ);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-12 md:py-20">
        {/* Header */}
        <PageHeader
          title={t('pages.events.title', 'Events')}
          subtitle={t('pages.events.subtitle', 'Discover and join community events in your area')}
          actions={
            <>
              <div
                className="flex items-center gap-1 p-1 bg-muted rounded-lg"
                role="group"
                aria-label="View mode"
              >
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="icon"
                  aria-label={t('pages.events.gridView', 'Grid view')}
                  onClick={() => setViewMode('grid')}
                >
                  <Grid size={16} />
                </Button>
                <Button
                  variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                  size="icon"
                  aria-label={t('pages.events.calendarView', 'Calendar view')}
                  onClick={() => setViewMode('calendar')}
                >
                  <CalendarIcon size={16} />
                </Button>
              </div>
              {/* P4-3 — Submit CTA consolidated to header. */}
            </>
          }
        />

        <TrendingByType type="event" className="mt-4 mb-6" />

        {/* Filters */}
        <div className="flex flex-col gap-4 p-4 bg-card rounded-lg mb-8">
          {/* Search Bar */}
          <div className="flex gap-2 flex-nowrap">
            <div className="flex-1 min-w-0 flex items-center gap-2 rounded px-3 py-2 bg-background">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <SearchInputTyped
                aria-label={t('pages.events.searchLabel', 'Search events')}
                placeholders={[
                  'Search for events...',
                  'Find parties near you...',
                  'Discover LGBTQ+ meetups...',
                  'Look for workshops...',
                  'Search pride events...',
                  'Find social gatherings...',
                ]}
                value={search}
                onValueChange={setSearch}
                onKeyDown={(e) => e.key === 'Enter' && handleFiltersChange()}
                style={{
                  border: 0,
                  boxShadow: 'none',
                  padding: 0,
                  height: 'auto',
                  background: 'inherit',
                  outline: 'none',
                  flex: 1,
                  minWidth: 0,
                  width: '100%',
                }}
                typingSpeed={75}
                pauseDuration={1500}
              />
            </div>
            <Button
              onClick={handleNearMe}
              variant={nearMe ? 'default' : 'outline'}
              disabled={locationLoading}
              size="icon"
              aria-label="Find events near me"
            >
              {locationLoading ? (
                <Loader style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
              ) : (
                <MapPin size={16} />
              )}
            </Button>
            <Button onClick={handleFiltersChange} size="icon" aria-label="Search events">
              <Search size={16} />
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              size="icon"
              aria-label={showFilters ? 'Hide filters' : 'Show filters'}
              aria-expanded={showFilters}
            >
              <Filter size={16} />
            </Button>
            <Button
              variant={showPast ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowPast(!showPast)}
              aria-pressed={showPast}
            >
              {t('pages.events.showPastEvents', 'Past events')}
            </Button>
          </div>

          {/* Extended Filters */}
          {showFilters && (
            <nav
              aria-label="Event filters"
              className="flex flex-col gap-4 pt-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="city">{t('pages.events.cities', 'Cities')}</Label>
                  <Popover open={cityOpen} onOpenChange={setCityOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={cityOpen}
                        style={{ width: '100%', justifyContent: 'space-between' }}
                      >
                        {city || t('pages.events.selectCities', 'Select city…')}
                        <ChevronDown
                          style={{
                            marginLeft: 8,
                            width: 16,
                            height: 16,
                            flexShrink: 0,
                            color: 'hsl(var(--muted-foreground))',
                          }}
                        />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent style={{ width: '100%', padding: 0 }}>
                      <Command>
                        <CommandInput
                          placeholder="Search cities..."
                          value={city}
                          onValueChange={setCity}
                        />
                        <CommandList>
                          <CommandEmpty>No cities found.</CommandEmpty>
                          <CommandGroup>
                            {availableCities
                              .filter((c) => normalizeCityLabel(c).includes(normalizeCityLabel(city)))
                              .map((cityName) => (
                                <CommandItem
                                  key={cityName}
                                  value={cityName}
                                  onSelect={(value) => {
                                    setCity(value === city ? '' : value);
                                    setCityOpen(false);
                                  }}
                                >
                                  <Check
                                    style={{
                                      marginRight: 8,
                                      width: 16,
                                      height: 16,
                                      opacity: city === cityName ? 1 : 0,
                                    }}
                                  />
                                  {cityName}
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="eventType">{t('pages.events.eventType', 'Event Type')}</Label>
                  <Select value={eventType} onValueChange={setEventType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select event type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {eventTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t('pages.events.startDate', 'Start Date')}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={!startDate ? 'text-muted-foreground' : ''}
                        style={{
                          width: '100%',
                          justifyContent: 'flex-start',
                          textAlign: 'left',
                          fontWeight: 400,
                        }}
                      >
                        <CalendarIcon style={{ marginRight: 8, width: 16, height: 16 }} />
                        {startDate ? format(startDate, 'PPP') : <span>Pick start date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent style={{ width: 'auto', padding: 0 }} align="start">
                      <CalendarComponent
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                        style={{ padding: 12, pointerEvents: 'auto' }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t('pages.events.endDate', 'End Date')}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={!endDate ? 'text-muted-foreground' : ''}
                        style={{
                          width: '100%',
                          justifyContent: 'flex-start',
                          textAlign: 'left',
                          fontWeight: 400,
                        }}
                      >
                        <CalendarIcon style={{ marginRight: 8, width: 16, height: 16 }} />
                        {endDate ? format(endDate, 'PPP') : <span>Pick end date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent style={{ width: 'auto', padding: 0 }} align="start">
                      <CalendarComponent
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        initialFocus
                        style={{ padding: 12, pointerEvents: 'auto' }}
                        disabled={(date) => (startDate ? date < startDate : false)}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Pride sub-kinds: Parade / Week / Festival / Party / Rally / Community */}
              {eventType === 'pride' && (
                <div className="flex flex-col gap-2">
                  <Label>{t('pages.events.prideSubtype', 'Pride type')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {PRIDE_SUBTYPES.map(({ tag, label }) => {
                      const active = selectedTags.includes(tag);
                      return (
                        <Button
                          key={tag}
                          type="button"
                          size="sm"
                          variant={active ? 'default' : 'outline'}
                          onClick={() =>
                            setSelectedTags((prev) =>
                              active ? prev.filter((x) => x !== tag) : [...prev, tag],
                            )
                          }
                          aria-pressed={active}
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tags */}
              <TagSelector
                selectedTags={selectedTags}
                onTagsChange={setSelectedTags}
                placeholder="Filter events by tags..."
                maxTags={5}
                allowCustomTags={false}
                categories={['events']}
              />

              {/* Past events toggle */}
              <div className="flex items-center justify-between gap-4 pt-2">
                <Label htmlFor="show-past-events" style={{ cursor: 'pointer' }}>
                  {t('pages.events.showPastEvents', 'Show past events')}
                </Label>
                <Switch
                  id="show-past-events"
                  checked={showPast}
                  onCheckedChange={setShowPast}
                  aria-label={t('pages.events.showPastEvents', 'Show past events')}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button onClick={handleFiltersChange}>{t('pages.events.applyFilters', 'Apply Filters')}</Button>
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    onClick={clearFilters}
                    style={{ display: 'flex', gap: 8 }}
                  >
                    <X size={16} />
                    {t('pages.events.clearAll', 'Clear All')}
                  </Button>
                )}
              </div>
            </nav>
          )}

          {/* Active Filters Display */}
          {hasActiveFilters && !showFilters && (
            <div className="flex flex-wrap gap-2 items-center">
              <p className="text-sm text-muted-foreground">
                {t('pages.events.activeFilters', 'Active filters:')}
              </p>
              {search && (
                <Badge variant="secondary" style={{ display: 'inline-flex', gap: 4 }}>
                  {t('pages.events.filterSearch', { value: search, defaultValue: `Search: ${search}` })}
                  <X
                    style={{ width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' }}
                    role="button"
                    aria-label={t('pages.events.clearFilterSearch', 'Clear search')}
                    onClick={() => setSearch('')}
                  />
                </Badge>
              )}
              {city && (
                <Badge variant="secondary" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  {autoLocationLabel === city && <MapPin style={{ width: 10, height: 10 }} />}
                  {autoLocationLabel === city
                    ? t('pages.events.filterNearYou', {
                        value: displayCityName(city, i18n.language),
                        defaultValue: `Near you: ${displayCityName(city, i18n.language)}`,
                      })
                    : t('pages.events.filterCity', {
                        value: displayCityName(city, i18n.language),
                        defaultValue: `City: ${displayCityName(city, i18n.language)}`,
                      })}
                  <X
                    style={{ width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' }}
                    role="button"
                    aria-label={t('pages.events.clearFilterCity', 'Clear city filter')}
                    onClick={() => { setCity(''); setAutoLocationLabel(null); }}
                  />
                </Badge>
              )}
              {eventType && (
                <Badge variant="secondary" style={{ display: 'inline-flex', gap: 4 }}>
                  {eventType}
                  <X
                    style={{ width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' }}
                    role="button"
                    aria-label={t('pages.events.clearFilterEventType', 'Clear event type filter')}
                    onClick={() => setEventType('')}
                  />
                </Badge>
              )}
              {startDate && (
                <Badge variant="secondary" style={{ display: 'inline-flex', gap: 4 }}>
                  {t('pages.events.filterFrom', {
                    value: format(startDate, 'PP', { locale: dfLocale }),
                    defaultValue: `From: ${format(startDate, 'PP', { locale: dfLocale })}`,
                  })}
                  <X
                    style={{ width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' }}
                    role="button"
                    aria-label={t('pages.events.clearFilterStartDate', 'Clear start date filter')}
                    onClick={() => setStartDate(undefined)}
                  />
                </Badge>
              )}
              {endDate && (
                <Badge variant="secondary" style={{ display: 'inline-flex', gap: 4 }}>
                  {t('pages.events.filterTo', {
                    value: format(endDate, 'PP', { locale: dfLocale }),
                    defaultValue: `To: ${format(endDate, 'PP', { locale: dfLocale })}`,
                  })}
                  <X
                    style={{ width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' }}
                    role="button"
                    aria-label={t('pages.events.clearFilterEndDate', 'Clear end date filter')}
                    onClick={() => setEndDate(undefined)}
                  />
                </Badge>
              )}
              {nearMe && (
                <Badge variant="secondary" style={{ display: 'inline-flex', gap: 4 }}>
                  {t('pages.events.filterNearMe', 'Near Me')}
                  <X
                    style={{ width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' }}
                    role="button"
                    aria-label={t('pages.events.clearFilterNearMe', 'Clear near me filter')}
                    onClick={() => setNearMe(false)}
                  />
                </Badge>
              )}
              {showPast && (
                <Badge variant="secondary" style={{ display: 'inline-flex', gap: 4 }}>
                  {t('pages.events.pastEvents', 'Past events')}
                  <X
                    style={{ width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' }}
                    role="button"
                    aria-label={t('pages.events.clearFilterPast', 'Clear past events filter')}
                    onClick={() => setShowPast(false)}
                  />
                </Badge>
              )}
              {selectedTags.map((tag) => (
                <Badge key={tag} variant="secondary" style={{ display: 'inline-flex', gap: 4 }}>
                  {tag}
                  <X
                    style={{ width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' }}
                    role="button"
                    aria-label={`Remove ${tag} filter`}
                    onClick={() => setSelectedTags((prev) => prev.filter((t) => t !== tag))}
                  />
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Status region for screen readers */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {loading ? 'Loading events...' : error ? error : `${events.length} events found`}
        </div>

        {/* Error State */}
        {error && !loading && <ErrorState message={error} onRetry={() => fetchEvents()} />}

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (<EventCard key={i} loading />))}
          </div>
        )}
        {loading && loadingTimedOut && <LoadingTimeout onRetry={() => fetchEvents()} />}

        {/* Empty State */}
        {!loading && !error && events.length === 0 && (
          datasetTotal === 0 || (datasetTotal === null && !hasActiveFilters) ? (
            <EmptyState
              icon={Calendar}
              variant="empty"
              title={t('pages.events.emptyDataset.title', 'No events yet')}
              description={t(
                'pages.events.emptyDataset.body',
                "We haven't added any events here yet. Help us grow the guide by submitting one.",
              )}
              primaryAction={{ label: t('pages.events.submitAnEvent', 'Submit an Event'), onClick: () => navigate('/submit/event') }}
            />
          ) : (
            <EmptyState
              icon={Calendar}
              variant="filtered"
              title={showPast ? t('pages.events.noPastEvents', 'No past events found') : t('pages.events.filteredEmpty.title', 'No events match your filters')}
              description={
                showPast
                  ? t('pages.events.noPastEventsDesc', 'No past events match these filters. Turn off the toggle to see upcoming events.')
                  : t('pages.events.filteredEmpty.body', 'Try adjusting your filters or search to see more results.')
              }
              primaryAction={{ label: t('pages.events.submitAnEvent', 'Submit an Event'), onClick: () => navigate('/submit/event') }}
              secondaryAction={hasActiveFilters ? { label: t('pages.events.clearFiltersLabel', 'Clear Filters'), onClick: clearFilters, variant: 'outline' } : undefined}
            />
          )
        )}

        {/* Event Content */}
        {!loading && events.length > 0 && (
          <>
            {viewMode === 'grid' ? (
              <StaggerGrid
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {events.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onViewDetails={handleViewDetails}
                    onUpdateAttendance={user ? handleAttendanceUpdate : undefined}
                  />
                ))}
              </StaggerGrid>
            ) : (
              <EventsCalendarView
                events={events}
                onEventSelect={handleViewDetails}
                onAttendanceUpdate={handleAttendanceUpdate}
              />
            )}
          </>
        )}

        {/* Load More */}
        {!loading && events.length > 0 && (
          <div className="text-center mt-12">
            {hasMore && autoLoadedCount >= 50 && (
              <Button
                variant="outline"
                size="lg"
                onClick={async () => {
                  setAutoLoadedCount(0);
                  const nextPage = page + 1;
                  setPage(nextPage);
                  await fetchEvents(
                    {},
                    {
                      page: nextPage,
                      pageSize: PAGE_SIZE,
                      append: true,
                    },
                  );
                }}
              >
                Load More Events
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
export default Events;
