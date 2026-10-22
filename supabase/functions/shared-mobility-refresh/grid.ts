/**
 * Aggregate GBFS free_bike_status to a ~100 m grid of counts.
 *
 * Measured on sharedmobility.ch (2026-10-22): free_bike_status ALREADY contains docked
 * bikes (2,079 of Velospot's 2,443 sit exactly at station coordinates, matching the
 * 2,089 docked), so station_status is not added — that would double count.
 * The provider-level `vehicle_type` is unreliable (Velospot reads "CargoBike", Dott
 * "Bike" while its ids say dott_scooter), so everything rideable is ONE category;
 * providers whose type is a car or moped are excluded.
 */

export const LAT_STEP = 0.001; // ~111 m
export const LNG_STEP = 0.0015; // ~113 m at 47°N
// Whole type name only: a substring /car/ matched "CargoBike" and silently dropped
// all 7,967 Velospot bikes, the largest provider (measured on the live feed).
const EXCLUDED_TYPES = /^(e-)?(car|moped)$/i;

export interface GbfsBike {
  lat: number;
  lon: number;
  provider_id?: string;
  is_disabled?: boolean | number;
  is_reserved?: boolean | number;
}

export interface GridResult {
  cells: [number, number, number][];
  vehicles: number;
  providers: string[];
}

const round = (x: number) => Math.round(x * 1e5) / 1e5;

export function aggregateToGrid(
  bikes: GbfsBike[],
  providerTypes: Record<string, string | undefined>,
): GridResult {
  const grid = new Map<string, [number, number, number]>();
  const providers = new Set<string>();
  let vehicles = 0;
  for (const b of bikes) {
    if (b.is_disabled || b.is_reserved) continue;
    if (!Number.isFinite(b.lat) || !Number.isFinite(b.lon)) continue;
    const type = b.provider_id ? providerTypes[b.provider_id] : undefined;
    if (type && EXCLUDED_TYPES.test(type)) continue;
    const i = Math.floor(b.lat / LAT_STEP);
    const j = Math.floor(b.lon / LNG_STEP);
    const key = `${i}:${j}`;
    const cell = grid.get(key);
    if (cell) cell[2]++;
    else grid.set(key, [round((i + 0.5) * LAT_STEP), round((j + 0.5) * LNG_STEP), 1]);
    vehicles++;
    if (b.provider_id) providers.add(b.provider_id);
  }
  return { cells: [...grid.values()], vehicles, providers: [...providers].sort() };
}
