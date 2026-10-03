import { EVENT_TYPE_OPTIONS } from '@/lib/eventTypes';
import { VENUE_CATEGORY_OPTIONS } from '@/lib/venueCategories';

export function fieldControlKind(entityType: string | undefined, key: string) {
  const normalizedEntity = entityType?.replace(/s$/, '').toLowerCase();
  if (normalizedEntity === 'venue' && key === 'category') return 'venue-category';
  if (normalizedEntity === 'event' && key === 'event_type') return 'event-type';
  if (key === 'tags') return 'tags';
  if (key === 'location') return 'location';
  return 'default';
}

export function coordinateNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function coordinatesFromLocation(location: Record<string, unknown>) {
  const latitudeKey = 'lat' in location ? 'lat' : 'latitude' in location ? 'latitude' : 'lat';
  const longitudeKey = 'lng' in location ? 'lng' : 'longitude' in location ? 'longitude' : 'lng';
  return {
    latitudeKey,
    longitudeKey,
    latitude: coordinateNumber(location[latitudeKey]),
    longitude: coordinateNumber(location[longitudeKey]),
  };
}

export function withLocationCoordinates(
  location: Record<string, unknown>,
  latitude: number,
  longitude: number,
) {
  const keys = coordinatesFromLocation(location);
  return {
    ...location,
    [keys.latitudeKey]: Math.max(-90, Math.min(90, latitude)),
    [keys.longitudeKey]: Math.max(-180, Math.min(180, longitude)),
  };
}

export const GOVERNANCE_SELECT_OPTIONS = {
  'venue-category': VENUE_CATEGORY_OPTIONS,
  'event-type': EVENT_TYPE_OPTIONS,
};
