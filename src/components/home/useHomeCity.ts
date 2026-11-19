import { useHomeRegionContext } from '@/components/home/homeRegionContext';
import { useOptimizedCity } from '@/hooks/usePlaces';

/** City the homepage features when the visitor's region has no city (no geo, no profile). */
export const HOME_FALLBACK_CITY_SLUG = 'zuerich';

/**
 * The homepage region with the hero's fallback city applied, so the hero, the
 * events board and the map always talk about the same city.
 */
export function useHomeCity() {
  const region = useHomeRegionContext();
  const wantFallback = !region.loading && !region.cityId;
  const { city: fallback, loading } = useOptimizedCity(wantFallback ? HOME_FALLBACK_CITY_SLUG : '');
  // Report loading until the fallback resolves, so the map does not mount on
  // the world view and then jump.
  if (wantFallback && loading) return { ...region, loading: true };
  if (region.cityId || !fallback) return region;
  return { ...region, cityId: fallback.id, cityName: fallback.name };
}
