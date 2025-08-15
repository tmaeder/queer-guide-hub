import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { EventCard } from "@/components/events/EventCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Clock, MapPin, Search, Filter, History, Archive, X } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, isBefore } from "date-fns";

type Event = Database['public']['Tables']['events']['Row'];

interface HistoricFilters {
  search: string;
  eventType: string;
  city: string;
  country: string;
  year: string;
  sortBy: 'date' | 'name' | 'attendees';
  sortOrder: 'asc' | 'desc';
}

export default function HistoricEvents() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');
  
  const [filters, setFilters] = useState<HistoricFilters>({
    search: '',
    eventType: 'all',
    city: 'all',
    country: 'all',
    year: 'all',
    sortBy: 'date',
    sortOrder: 'desc'
  });

  // Fetch historic events (past events)
  useEffect(() => {
    fetchHistoricEvents();
  }, []);

  const fetchHistoricEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .lt('end_date', new Date().toISOString()) // Only past events
        .order('start_date', { ascending: false })
        .limit(500);

      if (fetchError) {
        throw fetchError;
      }

      setEvents(data || []);
    } catch (err: any) {
      console.error('Error fetching historic events:', err);
      setError(err.message);
      toast({
        title: "Error",
        description: "Failed to load historic events",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort events
  const filteredEvents = useMemo(() => {
    let result = events;

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(event => 
        event.title?.toLowerCase().includes(searchLower) ||
        event.description?.toLowerCase().includes(searchLower) ||
        event.venue_name?.toLowerCase().includes(searchLower)
      );
    }

    // Event type filter
    if (filters.eventType !== 'all') {
      result = result.filter(event => event.event_type === filters.eventType);
    }

    // City filter
    if (filters.city !== 'all') {
      result = result.filter(event => event.city === filters.city);
    }

    // Country filter
    if (filters.country !== 'all') {
      result = result.filter(event => event.country === filters.country);
    }

    // Year filter
    if (filters.year !== 'all') {
      result = result.filter(event => {
        if (event.start_date) {
          const eventYear = new Date(event.start_date).getFullYear().toString();
          return eventYear === filters.year;
        }
        return false;
      });
    }

    // Sort events
    result.sort((a, b) => {
      let aVal, bVal;
      
      switch (filters.sortBy) {
        case 'name':
          aVal = a.title || '';
          bVal = b.title || '';
          break;
        case 'attendees':
          // For historic events, we don't have attendee counts readily available
          // This could be enhanced with a join to event_attendees table
          aVal = 0;
          bVal = 0;
          break;
        case 'date':
        default:
          aVal = a.start_date ? new Date(a.start_date).getTime() : 0;
          bVal = b.start_date ? new Date(b.start_date).getTime() : 0;
          break;
      }

      if (filters.sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return result;
  }, [events, filters]);

  // Get unique values for filters
  const uniqueEventTypes = useMemo(() => {
    const types = [...new Set(events.map(event => event.event_type).filter(Boolean))];
    return types.sort();
  }, [events]);

  const uniqueCities = useMemo(() => {
    const cities = [...new Set(events.map(event => event.city).filter(Boolean))];
    return cities.sort();
  }, [events]);

  const uniqueCountries = useMemo(() => {
    const countries = [...new Set(events.map(event => event.country).filter(Boolean))];
    return countries.sort();
  }, [events]);

  const uniqueYears = useMemo(() => {
    const years = [...new Set(events.map(event => {
      if (event.start_date) {
        return new Date(event.start_date).getFullYear().toString();
      }
      return null;
    }).filter(Boolean))];
    return years.sort().reverse();
  }, [events]);

  // Group events by year for timeline view
  const eventsByYear = useMemo(() => {
    const grouped: { [year: string]: Event[] } = {};
    
    filteredEvents.forEach(event => {
      if (event.start_date) {
        const year = new Date(event.start_date).getFullYear().toString();
        if (!grouped[year]) {
          grouped[year] = [];
        }
        grouped[year].push(event);
      }
    });
    
    return grouped;
  }, [filteredEvents]);

  const handleFiltersChange = (newFilters: Partial<HistoricFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      eventType: 'all',
      city: 'all',
      country: 'all',
      year: 'all',
      sortBy: 'date',
      sortOrder: 'desc'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-pulse">
            <History className="h-12 w-12 mx-auto text-primary/60" />
          </div>
          <p className="text-muted-foreground">Loading historic events...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-destructive">
            <Archive className="h-12 w-12 mx-auto" />
          </div>
          <p className="text-destructive">Failed to load historic events</p>
          <Button onClick={fetchHistoricEvents} variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-background via-muted/30 to-background">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent"></div>
        
        <div className="relative mx-auto max-w-7xl px-6 py-12 lg:py-20">
          <div className="text-center space-y-6">
            <div className="flex items-center justify-center gap-3 mb-4">
              <History className="h-8 w-8 text-primary" />
              <h1 className="text-4xl lg:text-5xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                Historic Events
              </h1>
            </div>
            
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Explore our archive of past LGBTQ+ events and community gatherings. 
              Discover the rich history of activism, celebration, and community building.
            </p>
            
            <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Archive className="h-4 w-4" />
                <span>{events.length} historic events</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>{uniqueYears.length} years of history</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>{uniqueCities.length} cities</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-6 pb-12">
        {/* Search and Filters */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search historic events..."
                    value={filters.search}
                    onChange={(e) => handleFiltersChange({ search: e.target.value })}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                  className="shrink-0"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                  <Badge variant="secondary" className="ml-2">
                    {Object.values(filters).filter(f => f !== 'all' && f !== '' && f !== 'date' && f !== 'desc').length}
                  </Badge>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setViewMode(viewMode === 'grid' ? 'timeline' : 'grid')}
                  className="shrink-0"
                >
                  {viewMode === 'grid' ? <Clock className="h-4 w-4 mr-2" /> : <div className="h-4 w-4 mr-2 grid grid-cols-2 gap-0.5"><div className="bg-current rounded-sm"></div><div className="bg-current rounded-sm"></div><div className="bg-current rounded-sm"></div><div className="bg-current rounded-sm"></div></div>}
                  {viewMode === 'grid' ? 'Timeline' : 'Grid'}
                </Button>
              </div>

              {/* Expanded Filters */}
              {showFilters && (
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 pt-4 border-t">
                  <Select value={filters.eventType} onValueChange={(value) => handleFiltersChange({ eventType: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Event Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {uniqueEventTypes.map(type => (
                        <SelectItem key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filters.city} onValueChange={(value) => handleFiltersChange({ city: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="City" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cities</SelectItem>
                      {uniqueCities.map(city => (
                        <SelectItem key={city} value={city}>
                          {city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filters.country} onValueChange={(value) => handleFiltersChange({ country: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Countries</SelectItem>
                      {uniqueCountries.map(country => (
                        <SelectItem key={country} value={country}>
                          {country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filters.year} onValueChange={(value) => handleFiltersChange({ year: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Years</SelectItem>
                      {uniqueYears.map(year => (
                        <SelectItem key={year} value={year}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filters.sortBy} onValueChange={(value: any) => handleFiltersChange({ sortBy: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sort By" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="name">Name</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFiltersChange({ sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' })}
                      className="flex-1"
                    >
                      {filters.sortOrder === 'asc' ? '↑' : '↓'} Order
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="space-y-6">
          {/* Results Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">
                {filteredEvents.length === 0 ? 'No events found' : 
                 filteredEvents.length === 1 ? '1 historic event' : 
                 `${filteredEvents.length} historic events`}
              </h2>
              {filteredEvents.length > 0 && (
                <p className="text-muted-foreground">
                  From {uniqueYears[uniqueYears.length - 1]} to {uniqueYears[0]}
                </p>
              )}
            </div>
          </div>

          {/* Events Display */}
          {filteredEvents.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Archive className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No historic events found</h3>
                <p className="text-muted-foreground mb-4">
                  Try adjusting your filters or search terms
                </p>
                <Button variant="outline" onClick={clearFilters}>
                  Clear All Filters
                </Button>
              </CardContent>
            </Card>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(eventsByYear)
                .sort(([a], [b]) => parseInt(b) - parseInt(a))
                .map(([year, yearEvents]) => (
                <div key={year} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10">
                      <Calendar className="h-5 w-5 text-primary" />
                      <h3 className="text-xl font-semibold">{year}</h3>
                    </div>
                    <div className="flex-1 h-px bg-border"></div>
                    <Badge variant="secondary">
                      {yearEvents.length} events
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ml-6">
                    {yearEvents.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}