/**
 * Format a distance in metres for display next to a search result.
 * Metric, compact: "850 m" under 1 km, "2.3 km" otherwise.
 * Returns null for missing/invalid input so callers can omit the line.
 */
export function formatDistance(meters: number | null | undefined): string | null {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
