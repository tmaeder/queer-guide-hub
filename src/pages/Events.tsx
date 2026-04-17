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
  Plus,
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
import { Database } from '@/integrations/supabase/types';
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
import Box from '@mui/material/Box';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import { useTheme } from '@mui/material/styles';import { useTranslation } from 'react-i18next';


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
const Events = () => {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const theme = useTheme();
  const { events, loading, error, hasMore, fetchEvents, updateAttendance, loadingTimedOut } =
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
    () => Array.from(new Set(events.map((event) => event.city).filter(Boolean))).sort() as string[],
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
  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Container sx={{ py: { xs: 6, md: 10 } }}>
        {/* Header */}
        <PageHeader
          title={t('pages.events.title', 'Events')}
          subtitle={t('pages.events.subtitle', 'Discover and join community events in your area')}
          actions={
            <>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  p: 0.5,
                  bgcolor: 'action.hover',
                  borderRadius: 2,
                }}
                role="group"
                aria-label="View mode"
              >
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="icon"
                  aria-label={t('pages.events.gridView', 'Grid view')}
                  onClick={() => setViewMode('grid')}
                >
                  <Grid style={{ width: 16, height: 16 }} />
                </Button>
                <Button
                  variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                  size="icon"
                  aria-label={t('pages.events.calendarView', 'Calendar view')}
                  onClick={() => setViewMode('calendar')}
                >
                  <CalendarIcon style={{ width: 16, height: 16 }} />
                </Button>
              </Box>
              <Button onClick={() => navigate('/submit/event')} style={{ display: 'flex', gap: 8 }}>
                <Plus style={{ width: 16, height: 16 }} />
                Submit Event
              </Button>
            </>
          }
        />

        <TrendingByType type="event" className="mt-4 mb-6" />

        {/* Filters */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            p: 2,
            bgcolor: 'background.paper',
            borderRadius: 2,
            mb: 4,
          }}
        >
          {/* Search Bar */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'nowrap' }}>
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                borderRadius: 1,
                px: 1.5,
                py: 1,
                bgcolor: 'background.default',
              }}
            >
              <Search
                style={{
                  width: 16,
                  height: 16,
                  color: theme.palette.text.secondary,
                  flexShrink: 0,
                }}
              />
              <SearchInputTyped
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
            </Box>
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
                <MapPin style={{ width: 16, height: 16 }} />
              )}
            </Button>
            <Button onClick={handleFiltersChange} size="icon" aria-label="Search events">
              <Search style={{ width: 16, height: 16 }} />
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              size="icon"
              aria-label={showFilters ? 'Hide filters' : 'Show filters'}
              aria-expanded={showFilters}
            >
              <Filter style={{ width: 16, height: 16 }} />
            </Button>
          </Box>

          {/* Extended Filters */}
          {showFilters && (
            <Box
              component="nav"
              aria-label="Event filters"
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                pt: 2,
              }}
            >
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(4, 1fr)' },
                  gap: 2,
                }}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Label htmlFor="city">{t('pages.events.city', 'City')}</Label>
                  <Popover open={cityOpen} onOpenChange={setCityOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={cityOpen}
                        style={{ width: '100%', justifyContent: 'space-between' }}
                      >
                        {city || 'Select city...'}
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
                              .filter((c) => c.toLowerCase().includes(city.toLowerCase()))
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
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Label>{t('pages.events.startDate', 'Start Date')}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        style={{
                          width: '100%',
                          justifyContent: 'flex-start',
                          textAlign: 'left',
                          fontWeight: 400,
                          ...(!startDate ? { color: theme.palette.text.secondary } : {}),
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
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Label>{t('pages.events.endDate', 'End Date')}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        style={{
                          width: '100%',
                          justifyContent: 'flex-start',
                          textAlign: 'left',
                          fontWeight: 400,
                          ...(!endDate ? { color: theme.palette.text.secondary } : {}),
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
                </Box>
              </Box>

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
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                  pt: 1,
                }}
              >
                <Label htmlFor="show-past-events" style={{ cursor: 'pointer' }}>
                  Vergangene Termine anzeigen
                </Label>
                <Switch
                  id="show-past-events"
                  checked={showPast}
                  onCheckedChange={setShowPast}
                  aria-label="Show past events"
                />
              </Box>

              {/* Action Buttons */}
              <Box sx={{ display: 'flex', gap: 1, pt: 1 }}>
                <Button onClick={handleFiltersChange}>{t('pages.events.applyFilters', 'Apply Filters')}</Button>
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    onClick={clearFilters}
                    style={{ display: 'flex', gap: 8 }}
                  >
                    <X style={{ width: 16, height: 16 }} />
                    Clear All
                  </Button>
                )}
              </Box>
            </Box>
          )}

          {/* Active Filters Display */}
          {hasActiveFilters && !showFilters && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Active filters:
              </Typography>
              {search && (
                <Badge variant="secondary" style={{ display: 'inline-flex', gap: 4 }}>
                  Search: {search}
                  <X
                    style={{ width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' }}
                    role="button"
                    aria-label="Clear search"
                    onClick={() => setSearch('')}
                  />
                </Badge>
              )}
              {city && (
                <Badge variant="secondary" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  {autoLocationLabel === city && <MapPin style={{ width: 10, height: 10 }} />}
                  {autoLocationLabel === city ? `Near you: ${city}` : `City: ${city}`}
                  <X
                    style={{ width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' }}
                    role="button"
                    aria-label="Clear city filter"
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
                    aria-label="Clear event type filter"
                    onClick={() => setEventType('')}
                  />
                </Badge>
              )}
              {startDate && (
                <Badge variant="secondary" style={{ display: 'inline-flex', gap: 4 }}>
                  From: {format(startDate, 'MMM d, yyyy')}
                  <X
                    style={{ width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' }}
                    role="button"
                    aria-label="Clear start date filter"
                    onClick={() => setStartDate(undefined)}
                  />
                </Badge>
              )}
              {endDate && (
                <Badge variant="secondary" style={{ display: 'inline-flex', gap: 4 }}>
                  To: {format(endDate, 'MMM d, yyyy')}
                  <X
                    style={{ width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' }}
                    role="button"
                    aria-label="Clear end date filter"
                    onClick={() => setEndDate(undefined)}
                  />
                </Badge>
              )}
              {nearMe && (
                <Badge variant="secondary" style={{ display: 'inline-flex', gap: 4 }}>
                  Near Me
                  <X
                    style={{ width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' }}
                    role="button"
                    aria-label="Clear near me filter"
                    onClick={() => setNearMe(false)}
                  />
                </Badge>
              )}
              {showPast && (
                <Badge variant="secondary" style={{ display: 'inline-flex', gap: 4 }}>
                  Vergangene Termine
                  <X
                    style={{ width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' }}
                    role="button"
                    aria-label="Clear past events filter"
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
            </Box>
          )}
        </Box>

        {/* Status region for screen readers */}
        <Box
          role="status"
          aria-live="polite"
          aria-atomic="true"
          sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
        >
          {loading ? 'Loading events...' : error ? error : `${events.length} events found`}
        </Box>

        {/* Error State */}
        {error && !loading && <ErrorState message={error} onRetry={() => fetchEvents()} />}

        {/* Loading State */}
        {loading && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
            {Array.from({ length: 6 }).map((_, i) => (<EventCard key={i} loading />))}
          </Box>
        )}
        {loading && loadingTimedOut && <LoadingTimeout onRetry={() => fetchEvents()} />}

        {/* Empty State */}
        {!loading && !error && events.length === 0 && (
          <EmptyState
            icon={Calendar}
            title={showPast ? t('pages.events.noPastEvents', 'No past events found') : t('pages.events.emptyTitle', 'The dance floor is empty... for now')}
            description={
              showPast
                ? t('pages.events.noPastEventsDesc', 'No past events match these filters. Turn off the toggle to see upcoming events.')
                : t('pages.events.emptyDescription', 'Check back soon or widen your filters to find something fun.')
            }
            mood="encouraging"
            primaryAction={{ label: t('pages.events.submitAnEvent', 'Submit an Event'), onClick: () => navigate('/submit/event') }}
            secondaryAction={{ label: t('pages.events.clearFiltersLabel', 'Clear Filters'), onClick: clearFilters }}
          />
        )}

        {/* Event Content */}
        {!loading && events.length > 0 && (
          <>
            {viewMode === 'grid' ? (
              <StaggerGrid
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' },
                  gap: 3,
                }}
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
          <Box sx={{ textAlign: 'center', mt: 6 }}>
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
          </Box>
        )}
      </Container>
    </Box>
  );
};
export default Events;
