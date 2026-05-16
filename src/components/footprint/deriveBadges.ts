export interface FootprintStats {
  countries_visited: number;
  total_countries: number;
  cities_visited: number;
  venues_visited: number;
  events_visited: number;
  villages_visited: number;
  continents_touched: number;
  pride_events: number;
}

export interface Badge {
  id: string;
  label: string;
}

/**
 * Pure-function derivation of footprint badges from aggregated stats.
 * Awards at most 6 badges in a deterministic order so the UI is stable.
 */
export function deriveBadges(stats: FootprintStats, tripCount: number): Badge[] {
  const out: Badge[] = [];
  if (tripCount >= 1) out.push({ id: 'first-trip', label: 'First trip' });
  if (stats.cities_visited >= 10) out.push({ id: 'ten-cities', label: '10 cities' });
  if (stats.pride_events >= 3) out.push({ id: 'pride-veteran', label: 'Pride veteran' });
  if (stats.continents_touched >= 3)
    out.push({ id: 'continental-traveler', label: 'Continental traveler' });
  if (stats.villages_visited >= 1) out.push({ id: 'village-explorer', label: 'Village explorer' });
  if (stats.countries_visited >= 20) out.push({ id: 'globetrotter', label: 'Globetrotter' });
  return out.slice(0, 6);
}
