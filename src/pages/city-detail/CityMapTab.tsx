import { MapShell } from '@/components/map/MapShell';
import type { CityRelation } from './types';

export interface CityMapTabProps {
  city: CityRelation;
}

export function CityMapTab({ city }: CityMapTabProps) {
  if (typeof city.latitude !== 'number' || typeof city.longitude !== 'number') return null;
  const center: [number, number] = [Number(city.longitude), Number(city.latitude)];

  return (
    <MapShell surface="city" height={500} initialCenter={center} initialZoom={12} skipAutoFly />
  );
}
