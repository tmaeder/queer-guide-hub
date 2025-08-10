import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useAuth } from '@/hooks/useAuth';
import { VenueCard } from '@/components/venues/VenueCard';
import { VenueFilters } from '@/components/venues/VenueFilters';
import { VenueMapSearch } from '@/components/venues/VenueMapSearch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Plus, Loader, Grid, Map, SortAsc, SortDesc, Filter } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];

const Venues = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { venues, loading, error, hasMore, fetchVenues } = useVenues(false);
  const { events } = useEvents();
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [currentFilters, setCurrentFilters] = useState<any>({});
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleFiltersChange = (filters: any) => {
    setCurrentFilters(filters);
    setPage(1);
    fetchVenues(filters, { page: 1, pageSize: PAGE_SIZE, append: false });
  };

  const handleAmenityClick = (amenity: string) => {
    const filters = { amenities: [amenity] };
    setCurrentFilters(filters);
    setPage(1);
    fetchVenues(filters, { page: 1, pageSize: PAGE_SIZE, append: false });
  };

  const handleServiceClick = (service: string) => {
    const filters = { services: [service] };
    setCurrentFilters(filters);
    setPage(1);
    fetchVenues(filters, { page: 1, pageSize: PAGE_SIZE, append: false });
  };

  const handleTagClick = (tag: string) => {
    const filters = { tags: [tag] };
    setCurrentFilters(filters);
    setPage(1);
    fetchVenues(filters, { page: 1, pageSize: PAGE_SIZE, append: false });
  };

  const handleViewDetails = (venue: Venue) => {
    setSelectedVenue(venue);
    // In a real app, this would navigate to a detailed venue page
    console.log('View venue details:', venue);
  };

  // Sort venues based on current sort settings
  const sortedVenues = [...venues].sort((a, b) => {
    let aValue: any, bValue: any;
    
    switch (sortBy) {
      case 'name':
        aValue = a.name?.toLowerCase() || '';
        bValue = b.name?.toLowerCase() || '';
        break;
      case 'category':
        aValue = a.category?.toLowerCase() || '';
        bValue = b.category?.toLowerCase() || '';
        break;
      case 'city':
        aValue = a.city?.toLowerCase() || '';
        bValue = b.city?.toLowerCase() || '';
        break;
      case 'created_at':
        aValue = new Date(a.created_at);
        bValue = new Date(b.created_at);
        break;
      default:
        return 0;
    }
    
    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <CardContent>
              <p className="text-destructive mb-4">Error loading venues: {error}</p>
              <Button onClick={() => fetchVenues()}>Try Again</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold gradient-text mb-4 animate-fade-in">
            Venues & Organizations
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Discover queer-friendly venues, businesses, and organizations in your area
          </p>
          {user && (
            <Button 
              className="bg-primary hover:bg-primary/90 gap-2 px-6 py-3 text-lg hover-scale"
              onClick={() => navigate('/admin/venues')}
            >
              <Plus className="h-5 w-5" />
              Add Your Business
            </Button>
          )}
        </div>

        {/* Filters Section */}
        <div className="mb-8">
          <VenueFilters onFiltersChange={handleFiltersChange} />
        </div>

        {/* Results Header with Sorting */}
        {!loading && venues.length > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 p-4 bg-card rounded-lg border">
            <div className="flex items-center gap-4">
              <p className="text-muted-foreground font-medium">
                Found {venues.length} result{venues.length !== 1 ? 's' : ''}
              </p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="h-4 w-4" />
                {Object.keys(currentFilters).length > 0 && `${Object.keys(currentFilters).length} filter${Object.keys(currentFilters).length !== 1 ? 's' : ''} applied`}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Sort by:</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="category">Category</SelectItem>
                    <SelectItem value="city">City</SelectItem>
                    <SelectItem value="created_at">Newest</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSortOrder}
                  className="px-2"
                >
                  {sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Content Tabs */}
        <Tabs value={viewMode === 'grid' ? 'grid' : 'map'} onValueChange={(value) => setViewMode(value as 'grid' | 'list')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8 max-w-md mx-auto">
            <TabsTrigger value="grid" className="flex items-center gap-2">
              <Grid className="h-4 w-4" />
              Grid View
            </TabsTrigger>
            <TabsTrigger value="map" className="flex items-center gap-2">
              <Map className="h-4 w-4" />
              Map View
            </TabsTrigger>
          </TabsList>

          <TabsContent value="grid" className="space-y-8">
            {/* Loading State */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader className="h-12 w-12 animate-spin text-primary mb-4" />
                <span className="text-lg text-muted-foreground">Finding amazing places for you...</span>
              </div>
            )}

            {/* Empty State */}
            {!loading && venues.length === 0 && (
              <Card className="p-12 text-center border-dashed border-2 animate-fade-in">
                <CardContent>
                  <MapPin className="h-16 w-16 mx-auto mb-6 text-muted-foreground" />
                  <h3 className="text-2xl font-semibold mb-3">No venues found</h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    We couldn't find any venues matching your criteria. Try adjusting your filters or be the first to add a venue in this area!
                  </p>
                  {user && (
                    <Button 
                      className="bg-primary hover:bg-primary/90 px-6 py-3"
                      onClick={() => navigate('/admin/venues')}
                    >
                      Add the First Venue
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Venues Grid */}
            {!loading && venues.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-fade-in">
                {sortedVenues.map((venue, index) => (
                  <div 
                    key={venue.id}
                    className="animate-fade-in hover-scale"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <VenueCard
                      venue={venue}
                      events={events}
                      onViewDetails={handleViewDetails}
                      onAmenityClick={handleAmenityClick}
                      onServiceClick={handleServiceClick}
                      onTagClick={handleTagClick}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Load More */}
            {!loading && venues.length > 0 && (
              <div className="text-center mt-16">
                <Button variant="outline" size="lg" className="px-8 py-3 hover-scale">
                  Load More Results
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="map" className="space-y-6">
            <div className="h-[700px] w-full rounded-lg overflow-hidden border">
              <VenueMapSearch filters={currentFilters} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Venues;