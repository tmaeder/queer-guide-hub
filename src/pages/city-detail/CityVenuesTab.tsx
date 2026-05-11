import { Building, Luggage } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VenueCard } from '@/components/venues/VenueCard';
import { InlineLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CityRelation, VenueRelation } from './types';

export interface CityVenuesTabProps {
  city: CityRelation;
  venues: VenueRelation[];
  venuesLoading: boolean;
  showCreateTrip: boolean;
  onCreateTrip: () => void;
}

export function CityVenuesTab({
  city,
  venues,
  venuesLoading,
  showCreateTrip,
  onCreateTrip,
}: CityVenuesTabProps) {
  return (
    <div className="mt-6">
      {showCreateTrip && (
        <Card style={{ marginBottom: 16 }}>
          <CardContent style={{ paddingTop: 20 }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <Luggage style={{ width: 20, height: 20, opacity: 0.6 }} />
                <p className="font-medium">Planning a trip to {city.name}?</p>
              </div>
              <Button variant="outline" size="sm" onClick={onCreateTrip}>
                Create Trip
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {venuesLoading ? (
        <InlineLoading text="Loading venues..." size="md" />
      ) : venues.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {venues.map((venue: VenueRelation) => (
            <VenueCard key={venue.id} venue={venue} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Building}
          title="No venues found yet"
          description={`Be the first to add venues in ${city.name}!`}
          mood="encouraging"
        />
      )}
    </div>
  );
}
