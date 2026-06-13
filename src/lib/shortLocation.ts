/**
 * Compact display form of a free-text geocoder location. Autocomplete stores
 * full strings like "59, Zollstrasse, Gewerbeschule, Industriequartier,
 * Zurich, District Zurich, Zurich, 8005, Switzerland" — summaries should read
 * "Zurich, Switzerland". The stored value is untouched; this is display-only.
 */
export function shortLocation(location: string | null | undefined): string {
  const parts = (location ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^\d/.test(p)); // drop house numbers + postcodes
  if (parts.length <= 2) return parts.join(', ');
  return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
}
