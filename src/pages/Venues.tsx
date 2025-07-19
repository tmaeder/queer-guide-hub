import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { VenueCard } from '@/components/venues/VenueCard';
import { VenueFilters } from '@/components/venues/VenueFilters';
import { VenueMapSearch } from '@/components/venues/VenueMapSearch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Plus, Loader, Grid, Map } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];

const Venues = () => {
  const navigate = useNavigate();
  const { venues, loading, error, fetchVenues } = useVenues();
  const { events } = useEvents();
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [currentFilters, setCurrentFilters] = useState<any>({});

  const handleFiltersChange = (filters: any) => {
    setCurrentFilters(filters);
    fetchVenues(filters);
  };

  const handleAmenityClick = (amenity: string) => {
    fetchVenues({ amenities: [amenity] });
  };

  const handleServiceClick = (service: string) => {
    fetchVenues({ services: [service] });
  };

  const handleViewDetails = (venue: Venue) => {
    setSelectedVenue(venue);
    // In a real app, this would navigate to a detailed venue page
    console.log('View venue details:', venue);
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
      <div className="w-full px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold gradient-text mb-2">
              Venue Directory
            </h1>
            <p className="text-lg text-muted-foreground">
              Discover queer-friendly venues in your area
            </p>
          </div>
          <Button 
            className="bg-primary gap-2"
            onClick={() => navigate('/admin/venues')}
          >
            <Plus className="h-4 w-4" />
            Add Venue
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-8">
          <VenueFilters onFiltersChange={handleFiltersChange} />
        </div>

        {/* Tabs for Grid and Map View */}
        <Tabs defaultValue="grid" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
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
          <div className="flex items-center justify-center py-12">
            <Loader className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading venues...</span>
          </div>
        )}

        {/* Empty State */}
        {!loading && venues.length === 0 && (
          <Card className="p-8 text-center">
            <CardContent>
              <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No venues found</h3>
              <p className="text-muted-foreground mb-4">
                We couldn't find any venues matching your criteria. Try adjusting your filters or be the first to add a venue in this area!
              </p>
              <Button 
                className="bg-primary"
                onClick={() => navigate('/admin/venues')}
              >
                Add the First Venue
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Venues Grid */}
        {!loading && venues.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-muted-foreground">
                Found {venues.length} venue{venues.length !== 1 ? 's' : ''}
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {venues.map((venue) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  events={events}
                  onViewDetails={handleViewDetails}
                  onAmenityClick={handleAmenityClick}
                  onServiceClick={handleServiceClick}
                />
              ))}
            </div>
          </>
        )}

            {/* Load More */}
            {!loading && venues.length > 0 && (
              <div className="text-center mt-12">
                <Button variant="outline" size="lg">
                  Load More Venues
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="map" className="space-y-4">
            <div className="h-[600px] w-full">
              <VenueMapSearch filters={currentFilters} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Venues;