import { Building, Luggage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VenueCard } from '@/components/venues/VenueCard';
import { VillageCard } from '@/components/villages/VillageCard';
import { InlineLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/EmptyState';
import { BentoSection, spansForPreset } from '@/components/discovery';
import type { CityRelation, VenueRelation, VillageRelation } from './types';

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
  villages: VillageRelation[];
  villagesLoading: boolean;
  showCreateTrip: boolean;
  onCreateTrip: () => void;
}

export function CityVenuesTab({
  city,
  venues,
  venuesLoading,
  villages,
  villagesLoading,
  showCreateTrip,
  onCreateTrip,
}: CityVenuesTabProps) {
  return (
    <div className="flex flex-col gap-12">
      {showCreateTrip && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-container border border-border/60 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Luggage size={20} className="text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">Planning a trip to {city.name}?</p>
          </div>
          <Button variant="outline" size="sm" onClick={onCreateTrip}>
            Create trip
          </Button>
        </div>
      )}

      {venuesLoading ? (
        <InlineLoading text="Loading venues..." size="md" />
      ) : venues.length > 0 ? (
        <BentoSection preset="featured">
          {venues.map((venue: VenueRelation, i: number) => (
            <div
              key={venue.id}
              className={VENUE_SPAN_CLASS[spansForPreset('featured', i, venues.length)]}
            >
              <VenueCard venue={venue} />
            </div>
          ))}
        </BentoSection>
      ) : (
        <EmptyState
          icon={Building}
          title="No venues yet"
          description={`Be the first to add venues in ${city.name}!`}
          mood="encouraging"
        />
      )}

      {!villagesLoading && villages.length > 0 && (
        <div>
          <h3 className="mb-4 text-title font-semibold tracking-tight">LGBTQ+ neighborhoods</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {villages.map((village: VillageRelation) => (
              <VillageCard key={village.id} village={village} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
