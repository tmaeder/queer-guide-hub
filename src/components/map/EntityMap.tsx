import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import type { EntityMapProps } from './EntityMap.impl';

// Type-only re-exports are erased at build time, so importing a type from here
// never pulls maplibre-gl into the importing chunk.
export type { EntityMapBoundary, EntityMapMarker, EntityMapProps } from './EntityMap.impl';

/**
 * Detail-page map island, loaded on approach.
 *
 * The implementation imports maplibre-gl (~1 MB of JS). When it was imported
 * statically, every city, country, village, venue, event and hotel page parsed
 * and executed it during boot, even with the map far below the fold. Measured
 * with Lighthouse mobile on 2026-11-20: maplibre was 1.6–2.2 s of script
 * evaluation on /city/berlin and /villages/chueca, inside a total blocking time
 * of 5–7 s.
 *
 * Now the chunk is requested only when the map comes within MOUNT_MARGIN of the
 * viewport. The placeholder holds the map's exact height, so mounting does not
 * shift the layout.
 */
const EntityMapImpl = lazy(() => import('./EntityMap.impl'));

/** Start loading a screen-and-a-bit before the map scrolls into view. */
const MOUNT_MARGIN = '600px 0px';

function useNearViewport<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(
    // No IntersectionObserver (old engines, some test DOMs): mount at once
    // rather than never.
    () => typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function',
  );
  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: MOUNT_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return [ref, near];
}

function MapPlaceholder({ height, className }: { height: number | string; className?: string }) {
  return (
    <div
      className={`${className ?? ''} rounded-element bg-muted`}
      style={{ height, width: '100%' }}
      aria-hidden="true"
      data-testid="entity-map-placeholder"
    />
  );
}

/** A map crash or a failed chunk drops the map, never the page around it. */
export const EntityMap = (props: EntityMapProps) => {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const height = props.height ?? 300;
  if (!near) {
    return (
      <div ref={ref}>
        <MapPlaceholder height={height} className={props.className} />
      </div>
    );
  }
  return (
    <ErrorBoundary section="entity-map" fallback={null}>
      <Suspense fallback={<MapPlaceholder height={height} className={props.className} />}>
        <EntityMapImpl {...props} />
      </Suspense>
    </ErrorBoundary>
  );
};

export default EntityMap;
