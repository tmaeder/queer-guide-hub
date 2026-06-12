import { EmptyState } from 'queer-guide';
import { CalendarX, MapPin } from 'lucide-react';
import { StaticState as Settle } from './_static';

export const NoData = () => (
  <>
    <Settle />
    <EmptyState
      icon={CalendarX}
      title="No events yet."
      description="Events in this city will appear here once sources are connected."
      primaryAction={{ label: 'Submit an event', onClick: () => {} }}
    />
  </>
);

export const FilteredToZero = () => (
  <>
    <Settle />
    <EmptyState
      icon={MapPin}
      variant="filtered"
      title="No venues match."
      description="Data exists, but the active filters returned zero results."
      activeFilters={[
        { id: 'category', label: 'Category: Sauna' },
        { id: 'city', label: 'City: Reykjavík' },
      ]}
      onResetFilters={() => {}}
    />
  </>
);
