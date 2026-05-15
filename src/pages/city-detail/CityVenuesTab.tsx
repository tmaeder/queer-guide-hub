import { Building, Luggage } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VenueCard } from '@/components/venues/VenueCard';
import { InlineLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { BentoSection, spansForPreset } from '@/components/discovery';
import type { CityRelation, VenueRelation } from './types';

const VENUE_SPAN_CLASS: Record<string, string> = {
  sm: 'col-span-12 sm:col-span-6 md:col-span-4',
  md: 'col-span-12 sm:col-span-6 md:col-span-4',
  lg: 'col-span-12 sm:col-span-6 md:col-span-6',
  wide: 'col-span-12 md:col-span-8',
  tall: 'col-span-12 sm:col-span-6 md:col-span-4 row-span-2',
};

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
    <ScrollReveal direction="up">
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
        <BentoSection preset="featured">
          {venues.map((venue: VenueRelation, i: number) => (
            <div key={venue.id} className={VENUE_SPAN_CLASS[spansForPreset('featured', i, venues.length)]}>
              <VenueCard venue={venue} />
            </div>
          ))}
        </BentoSection>
      ) : (
        <EmptyState
          icon={Building}
          title="No venues found yet"
          description={`Be the first to add venues in ${city.name}!`}
          mood="encouraging"
        />
      )}
    </div>
    </ScrollReveal>
  );
}
