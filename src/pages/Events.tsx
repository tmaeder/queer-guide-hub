import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEvents } from '@/hooks/useEvents';
import { EventCard } from '@/components/events/EventCard';
import { EventsCalendarView } from '@/components/events/EventsCalendarView';
import { TagSelector } from '@/components/tags/TagSelector';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SearchInputTyped } from '@/components/ui/search-input-typed';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Plus, Loader, Search, Filter, X, CalendarIcon, Check, ChevronDown, Grid, List, MapPin } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type Event = Database['public']['Tables']['events']['Row'];

const eventTypes = [
  'party',
  'workshop', 
  'meetup',
  'pride',
  'rally',
  'conference',
  'social',
  'fundraiser',
  'performance'
];

const Events = () => {
  const navigate = useNavigate();
  const { events, loading, error, hasMore, fetchEvents, updateAttendance } = useEvents(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
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
  const [userLocation, setUserLocation] = useState<{lat: number; lng: number} | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [autoLoadedCount, setAutoLoadedCount] = useState(0);

  // Get unique cities from events for auto-suggest
  const availableCities = Array.from(new Set(events.map(event => event.city).filter(Boolean))).sort();

  const handleFiltersChange = async () => {
    const dateRange = startDate && endDate ? {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    } : undefined;

    const filters = {
      search: search || undefined,
      city: city || undefined,
      eventType: (eventType && eventType !== 'all') ? eventType : undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      dateRange,
      nearMe: nearMe ? userLocation : undefined,
    };
    setPage(1);
    setAutoLoadedCount(0);
    await fetchEvents(filters, { page: 1, pageSize: PAGE_SIZE, append: false });
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
          lng: position.coords.longitude
        };
        
        setUserLocation(location);
        setNearMe(true);
        
        // Clear city filter when using near me
        setCity('');
        
        // Fetch events near user
        fetchEvents({
          search: search || undefined,
          eventType: (eventType && eventType !== 'all') ? eventType : undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
          nearMe: location,
        });
        
        toast({
          title: "Location found",
          description: "Showing events near your location",
        });
      } catch (error) {
        toast({
          title: "Location Error",
          description: "Unable to get your location. Please allow location access.",
          variant: "destructive",
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
    setEventType('all');
    setSelectedTags([]);
    setStartDate(undefined);
    setEndDate(undefined);
    setNearMe(false);
    setUserLocation(null);
    setPage(1);
    setAutoLoadedCount(0);
    await fetchEvents({}, { page: 1, pageSize: PAGE_SIZE, append: false });
  };

  const handleAttendanceUpdate = async (eventId: string, status: 'going' | 'interested' | 'not_going') => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to RSVP to events.",
        variant: "destructive",
      });
      return;
    }

    const { error } = await updateAttendance(eventId, status);
    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "destructive",
      });
    } else {
      toast({
        title: "RSVP Updated",
        description: `You're now marked as ${status} for this event.`,
      });
      fetchEvents({}, { page: 1, pageSize: PAGE_SIZE, append: false }); // Refresh to show updated attendance
    }
  };

  const handleViewDetails = (event: Event) => {
    setSelectedEvent(event);
    console.log('View event details:', event);
  };

  const hasActiveFilters = search || city || eventType || selectedTags.length > 0 || startDate || endDate || nearMe;

  if (error) {
  return (
    <div className="min-h-screen">
        <div className="container mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <CardContent>
              <p className="text-destructive mb-4">Error loading events: {error}</p>
              <Button onClick={() => fetchEvents()}>Try Again</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  useEffect(() => {
    (async () => {
      setPage(1);
      setAutoLoadedCount(0);
      await fetchEvents({}, { page: 1, pageSize: PAGE_SIZE, append: false });
    })();
  }, []);

  return (
    <div className="min-h-screen">
      <div className="w-full px-4 py-8">
        {/* Header */}
        <Card className="mb-8">
          <CardContent className="p-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold text-foreground mb-2">
                  Events Calendar
                </h1>
                <p className="text-lg text-muted-foreground">
                  Discover and join community events in your area
                </p>
              </div>
              <div className="flex items-center gap-4">
                {/* View Toggle */}
                <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="icon"
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                    size="icon"
                    onClick={() => setViewMode('calendar')}
                  >
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </div>
                {user && (
                  <Button 
                    className="bg-primary gap-2"
                    onClick={() => navigate('/admin/events')}
                  >
                    <Plus className="h-4 w-4" />
                    Create Event
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="space-y-4 p-4 bg-card rounded-lg border mb-8">
          {/* Search Bar */}
          <div className="flex gap-2 flex-nowrap">
            <div className="flex-1 min-w-0 flex items-center gap-2 border rounded-md px-3 py-2 bg-background">
              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <SearchInputTyped
                placeholders={[
                  "Search for events...",
                  "Find parties near you...",
                  "Discover LGBTQ+ meetups...",
                  "Look for workshops...",
                  "Search pride events...",
                  "Find social gatherings..."
                ]}
                value={search}
                onValueChange={setSearch}
                onKeyDown={(e) => e.key === 'Enter' && handleFiltersChange()}
                className="border-0 shadow-none p-0 h-auto bg-transparent focus-visible:ring-0 flex-1 min-w-0 w-full sm:min-w-[200px] md:min-w-[300px] lg:min-w-[400px]"
                typingSpeed={75}
                pauseDuration={1500}
              />
            </div>
            <Button 
              onClick={handleNearMe} 
              variant={nearMe ? "default" : "outline"}
              disabled={locationLoading}
              size="icon"
            >
              {locationLoading ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
            </Button>
            <Button onClick={handleFiltersChange} className="bg-primary" size="icon">
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              size="icon"
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          {/* Extended Filters */}
          {showFilters && (
            <div className="space-y-4 pt-4 border-t">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Popover open={cityOpen} onOpenChange={setCityOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={cityOpen}
                        className="w-full justify-between"
                      >
                        {city || "Select city..."}
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
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
                              .filter(c => c.toLowerCase().includes(city.toLowerCase()))
                              .map((cityName) => (
                              <CommandItem
                                key={cityName}
                                value={cityName}
                                onSelect={(value) => {
                                  setCity(value === city ? "" : value);
                                  setCityOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    city === cityName ? "opacity-100" : "opacity-0"
                                  )}
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
                <div className="space-y-2">
                  <Label htmlFor="eventType">Event Type</Label>
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
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "PPP") : <span>Pick start date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "PPP") : <span>Pick end date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        initialFocus
                        className="p-3 pointer-events-auto"
                        disabled={(date) => startDate ? date < startDate : false}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Tags */}
              <TagSelector
                selectedTags={selectedTags}
                onTagsChange={setSelectedTags}
                placeholder="Filter events by tags..."
                maxTags={5}
                allowCustomTags={false}
                categories={['events']}
              />

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button onClick={handleFiltersChange} className="bg-primary">
                  Apply Filters
                </Button>
                {hasActiveFilters && (
                  <Button variant="outline" onClick={clearFilters} className="gap-2">
                    <X className="h-4 w-4" />
                    Clear All
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Active Filters Display */}
          {hasActiveFilters && !showFilters && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {search && (
                <Badge variant="secondary" className="gap-1">
                  Search: {search}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setSearch('')} />
                </Badge>
              )}
              {city && (
                <Badge variant="secondary" className="gap-1">
                  City: {city}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setCity('')} />
                </Badge>
              )}
              {eventType && (
                <Badge variant="secondary" className="gap-1">
                  {eventType}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setEventType('')} />
                </Badge>
              )}
              {startDate && (
                <Badge variant="secondary" className="gap-1">
                  From: {format(startDate, "MMM d, yyyy")}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setStartDate(undefined)} />
                </Badge>
              )}
              {endDate && (
                <Badge variant="secondary" className="gap-1">
                  To: {format(endDate, "MMM d, yyyy")}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setEndDate(undefined)} />
                </Badge>
              )}
              {nearMe && (
                <Badge variant="secondary" className="gap-1">
                  Near Me
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setNearMe(false)} />
                </Badge>
              )}
              {selectedTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))}
                  />
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <Card className="p-8">
            <CardContent className="flex items-center justify-center py-4">
              <Loader className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading events...</span>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!loading && events.length === 0 && (
          <Card className="p-8 text-center">
            <CardContent>
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No events found</h3>
              <p className="text-muted-foreground mb-4">
                We couldn't find any events matching your criteria. Try adjusting your filters or be the first to create an event!
              </p>
              {user && (
                <Button 
                  className="bg-primary"
                  onClick={() => navigate('/admin/events')}
                >
                  Create the First Event
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Event Content */}
        {!loading && events.length > 0 && (
          <>
            <Card className="mb-6">
              <CardContent className="p-4">
                <p className="text-muted-foreground">
                  Found {events.length} event{events.length !== 1 ? 's' : ''}
                </p>
              </CardContent>
            </Card>
            
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {events.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onViewDetails={handleViewDetails}
                    onUpdateAttendance={user ? handleAttendanceUpdate : undefined}
                  />
                ))}
              </div>
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
              <Button variant="outline" size="lg" onClick={async () => {
                setAutoLoadedCount(0);
                const nextPage = page + 1;
                setPage(nextPage);
                await fetchEvents({}, { page: nextPage, pageSize: PAGE_SIZE, append: true });
              }}>
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