import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { Map as MapIcon, Navigation, Loader2 } from 'lucide-react';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import type { EntityMapMarker } from '@/components/map/EntityMap';

// maplibre is heavy — keep it out of the header chunk; load only when the
// empty popover actually renders the peek.
const EntityMap = lazy(() =>
  import('@/components/map/EntityMap').then((m) => ({ default: m.EntityMap })),
);

export interface SearchMapPeekProps {
  /** Optional nearby pins (derived from discovery hits with coordinates). */
  markers?: EntityMapMarker[];
  /** Open the full map, optionally centered on the visitor. */
  onExplore: (center?: { lat: number; lng: number }) => void;
  /** Precise "Near me" (browser geolocation prompt). */
  onNearMe: () => void;
  nearMeSupported: boolean;
  nearMeLoading: boolean;
}

export function SearchMapPeek({
  markers = [],
  onExplore,
  onNearMe,
  nearMeSupported,
  nearMeLoading,
}: SearchMapPeekProps) {
  const { t } = useTranslation();
  const { location, loading } = useVisitorLocation();

  const caption = location?.city
    ? t('search.mapPeek.near', { defaultValue: 'Near {{city}}', city: location.city })
    : t('search.mapPeek.explore', 'Explore the map');

  return (
    <div className="px-4 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-13 font-semibold uppercase tracking-wider text-muted-foreground">
          <MapIcon className="h-3.5 w-3.5" />
          {caption}
        </div>
        {nearMeSupported && (
          <button
            type="button"
            onClick={onNearMe}
            className="inline-flex items-center gap-1 rounded-badge px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            {nearMeLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Navigation className="h-3.5 w-3.5" />
            )}
            {t('search.nearMe', 'Near me')}
          </button>
        )}
      </div>

      {location ? (
        <div className="relative h-[140px] overflow-hidden rounded-element border border-border">
          <Suspense
            fallback={<div className="h-full w-full animate-pulse bg-muted" aria-hidden="true" />}
          >
            <EntityMap
              center={[location.longitude, location.latitude]}
              zoom={11}
              height={140}
              scrollZoom={false}
              markers={
                markers.length > 0
                  ? markers
                  : [
                      {
                        id: 'visitor',
                        lat: location.latitude,
                        lng: location.longitude,
                        name: location.city ?? '',
                        type: 'cities',
                        primary: true,
                      },
                    ]
              }
            />
          </Suspense>
          {/* Transparent catcher: a peek opens the full map rather than panning. */}
          <button
            type="button"
            aria-label={t('search.mapPeek.open', 'Open the map')}
            onClick={() =>
              onExplore({ lat: location.latitude, lng: location.longitude })
            }
            className="absolute inset-0 cursor-pointer bg-transparent"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onExplore()}
          disabled={loading}
          className="flex h-[140px] w-full cursor-pointer items-center justify-center gap-2 rounded-element border border-border bg-muted text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <MapIcon className="h-4 w-4" />
              {t('search.mapPeek.explore', 'Explore the map')} →
            </>
          )}
        </button>
      )}
    </div>
  );
}
