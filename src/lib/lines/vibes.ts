import type { Station, VibeId } from './generateLine';

/**
 * Which `Station` count column a vibe is measured by, and how many it takes
 * before the vibe means anything in that city.
 *
 * Extracted from `RoutePicker` so the discover picker and the trip templates
 * cannot disagree about what "nightlife" counts. They are two surfaces reading
 * the same pool; two copies of this map would silently offer a city as a
 * nightlife template that the picker had already judged too thin.
 *
 * The thresholds are floors, not targets: below them a city has a bar, not a
 * scene, and saying otherwise sends somebody across a border for one venue.
 */
export const VIBE_STATION_FIELD: Record<VibeId, keyof Station> = {
  nightlife: 'nightlifeCount',
  sauna: 'saunaCount',
  slow: 'cafeCount',
  community: 'communityCount',
  outdoors: 'outdoorCount',
};

export const VIBE_MIN: Record<VibeId, number> = {
  nightlife: 5,
  sauna: 2,
  slow: 3,
  community: 1,
  outdoors: 2,
};

export function vibeCount(station: Station, vibe: VibeId): number {
  return station[VIBE_STATION_FIELD[vibe]] as number;
}

export function stationMeetsVibe(station: Station, vibe: VibeId): boolean {
  return vibeCount(station, vibe) >= VIBE_MIN[vibe];
}
