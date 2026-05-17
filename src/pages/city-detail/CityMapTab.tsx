import { Loader2 } from 'lucide-react';
import { MapShell } from '@/components/map/MapShell';
import { MAP_SHELL_ENABLED } from '@/lib/featureFlags';
import type { CityRelation } from './types';

export interface CityMapTabProps {
  city: CityRelation;
  ExploreMap: React.ComponentType<Record<string, unknown>>;
  Suspense: typeof import('react').Suspense;
}

export function CityMapTab({ city, ExploreMap, Suspense }: CityMapTabProps) {
  if (typeof city.latitude !== 'number' || typeof city.longitude !== 'number') return null;
  const center: [number, number] = [Number(city.longitude), Number(city.latitude)];

  if (MAP_SHELL_ENABLED) {
    return (
      <MapShell
        surface="city"
        height={500}
        initialCenter={center}
        initialZoom={12}
        skipAutoFly
      />
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" />
        </div>
      }
    >
      <ExploreMap
        height={500}
        initialCenter={center}
        initialZoom={12}
        defaultLayers={['venues', 'events', 'neighbourhoods']}
        showLayerToggles
        showFilters={false}
        skipAutoFly
      />
    </Suspense>
  );
}
