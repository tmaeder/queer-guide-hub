import React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEvents } from '@/hooks/useEvents';
import { EventCard } from '@/components/events/EventCard';
import { EventsCalendarView } from '@/components/events/EventsCalendarView';
import { TagSelector } from '@/components/tags/TagSelector';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  const { events, loading, error, fetchEvents, updateAttendance } = useEvents();
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

  // Get unique cities from events for auto-suggest
  const availableCities = Array.from(new Set(events.map(event => event.city).filter(Boolean))).sort();

  const handleFiltersChange = () => {
    const dateRange = startDate && endDate ? {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    } : undefined;

    fetchEvents({
      search: search || undefined,
      city: city || undefined,
      eventType: (eventType && eventType !== 'all') ? eventType : undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      dateRange,
      nearMe: nearMe ? userLocation : undefined,
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


  const clearFilters = () => {
    setSearch('');
    setCity('');
    setEventType('all');
    setSelectedTags([]);
    setStartDate(undefined);
    setEndDate(undefined);
    setNearMe(false);
    setUserLocation(null);
    fetchEvents();
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
      fetchEvents(); // Refresh to show updated attendance
    }
  };

  const handleViewDetails = (event: Event) => {
    setSelectedEvent(event);
    // In a real app, this would navigate to a detailed event page
    console.log('View event details:', event);
  };

  const hasActiveFilters = search || city || eventType || selectedTags.length > 0 || startDate || endDate || nearMe;

  if (error) {
    return (
      <div className="min-h-screen bg-background">
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

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold gradient-text mb-2">
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
                size="sm"
                onClick={() => setViewMode('grid')}
                className="gap-2"
              >
                <Grid className="h-4 w-4" />
                Grid
              </Button>
              <Button
                variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('calendar')}
                className="gap-2"
              >
                <CalendarIcon className="h-4 w-4" />
                Calendar
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

        {/* Filters */}
        <div className="space-y-4 p-4 bg-card rounded-lg border mb-8">
          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFiltersChange()}
                className="pl-9"
              />
            </div>
            <Button 
              onClick={handleNearMe} 
              variant={nearMe ? "default" : "outline"}
              disabled={locationLoading}
              className="gap-2"
            >
              {locationLoading ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
              Near Me
            </Button>
            <Button onClick={handleFiltersChange} className="bg-primary">
              Search
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
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
          <div className="flex items-center justify-center py-12">
            <Loader className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading events...</span>
          </div>
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
            <div className="flex items-center justify-between mb-6">
              <p className="text-muted-foreground">
                Found {events.length} event{events.length !== 1 ? 's' : ''}
              </p>
            </div>
            
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
            <Button variant="outline" size="lg">
              Load More Events
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Events;