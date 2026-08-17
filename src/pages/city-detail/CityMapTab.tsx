import { EntityMap } from '@/components/map/EntityMap';
import { MapInset } from '@/components/transit/MapInset';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useVisitedPlaceLookup } from '@/hooks/useVisitedPlaceLookup';
import type { CityRelation, VenueRelation } from './types';

export interface CityMapTabProps {
  city: CityRelation;
  venues?: VenueRelation[];
  caption?: string;
  openLabel?: string;
}

/**
 * Spec module 16 — and the OWNER module for the city type: "the bending line
 * around this station, zoomed to walking distance."
 *
 * `EntityMap`, NOT `MapShell`. MapShell is the full-screen explore surface: it
 * brings a search field, a layer switcher and a filter bar, all absolutely
 * positioned and sized for a full-bleed canvas. Dropped into the 360px rail
 * they overflowed the module's own border and the filter chip was clipped by
 * the viewport. `MapInset` is documented as "a frame, not a second map"; the
 * frame wants a bare canvas, and `/map` is one link away.
 */
export function CityMapTab({ city, venues = [], caption, openLabel }: CityMapTabProps) {
  const visitedLookup = useVisitedPlaceLookup();
  if (typeof city.latitude !== 'number' || typeof city.longitude !== 'number') return null;

  return (
    <MapInset caption={caption}>
      <EntityMap
        center={[Number(city.longitude), Number(city.latitude)]}
        zoom={11}
        height={280}
        visitedLookup={visitedLookup}
        markers={[
          {
            id: city.id,
            lat: Number(city.latitude),
            lng: Number(city.longitude),
            name: city.name ?? 'City',
            type: 'cities',
            primary: true,
            entityType: 'city',
            entityId: city.id,
          },
          ...venues
            .filter(
              (v: VenueRelation) =>
                typeof v.latitude === 'number' && typeof v.longitude === 'number',
            )
            .map((v: VenueRelation) => ({
              id: v.id,
              lat: Number(v.latitude),
              lng: Number(v.longitude),
              name: v.name ?? 'Venue',
              subtitle: v.category ?? undefined,
              type: 'venues' as const,
              linkTo: `/venues/${v.slug || v.id}`,
              entityType: 'venue' as const,
              entityId: v.id,
            })),
        ]}
      />
      {openLabel && (
        <LocalizedLink
          to={`/map?city=${encodeURIComponent(city.name)}`}
          className="block border-t border-border-hairline px-2 py-2 text-2xs font-bold uppercase tracking-label no-underline transition-colors hover:bg-foreground hover:text-background"
        >
          {openLabel}
        </LocalizedLink>
      )}
    </MapInset>
  );
}
