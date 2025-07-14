import React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEvents } from '@/hooks/useEvents';
import { EventCard } from '@/components/events/EventCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Plus, Loader, Search, Filter, X } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

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

const commonTags = [
  'lgbt-friendly',
  'trans-friendly',
  'drag',
  'music',
  'dance',
  'educational',
  'networking',
  'all-ages',
  '18+',
  '21+',
  'outdoor',
  'virtual'
];

const Events = () => {
  const navigate = useNavigate();
  const { events, loading, error, fetchEvents, updateAttendance } = useEvents();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  
  // Filter states
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [eventType, setEventType] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const handleFiltersChange = () => {
    fetchEvents({
      search: search || undefined,
      city: city || undefined,
      eventType: eventType || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
    });
  };

  const handleTagToggle = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(newTags);
  };

  const clearFilters = () => {
    setSearch('');
    setCity('');
    setEventType('');
    setSelectedTags([]);
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

  const hasActiveFilters = search || city || eventType || selectedTags.length > 0;

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
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
    <div className="min-h-screen bg-gradient-subtle">
      <div className="container mx-auto px-4 py-8">
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
          <Button 
            className="bg-gradient-primary gap-2"
            onClick={() => navigate('/admin/events')}
          >
            <Plus className="h-4 w-4" />
            Create Event
          </Button>
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
            <Button onClick={handleFiltersChange} className="bg-gradient-primary">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    placeholder="Enter city..."
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eventType">Event Type</Label>
                  <Select value={eventType} onValueChange={setEventType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select event type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Types</SelectItem>
                      {eventTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {commonTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant={selectedTags.includes(tag) ? "default" : "outline"}
                      className="cursor-pointer hover:bg-primary/10 transition-colors"
                      onClick={() => handleTagToggle(tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button onClick={handleFiltersChange} className="bg-gradient-primary">
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
              {selectedTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => handleTagToggle(tag)}
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
              <Button 
                className="bg-gradient-primary"
                onClick={() => navigate('/admin/events')}
              >
                Create the First Event
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Events Grid */}
        {!loading && events.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-muted-foreground">
                Found {events.length} event{events.length !== 1 ? 's' : ''}
              </p>
            </div>
            
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