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
 * viewport, and, for a map below the fold of an unscrolled page, only once the
 * reader starts scrolling. The placeholder holds the map's exact height, so mounting does not
 * shift the layout.
 */
const EntityMapImpl = lazy(() => import('./EntityMap.impl'));

/** Start loading a screen-and-a-bit before the map scrolls into view. */
const MOUNT_MARGIN = '600px 0px';

/**
 * Whether an entry that is near the viewport is still (all but a sliver) below the fold
 * of a page nobody has scrolled yet. Then the look-ahead waits for the first
 * scroll.
 *
 * On a phone the city and village maps sit just under the fold (measured on
 * prod 2026-11-20 at 412x823: /city/berlin's map starts at 959 px,
 * /villages/chueca's at 1,177 px), well inside MOUNT_MARGIN. So the look-ahead
 * mounted maplibre during page load for every visitor, including those who
 * never scroll: 6.2 s of Lighthouse mobile boot-up on /city/berlin and a 2 s
 * long task, most of the page's total blocking time. A reader who does scroll
 * starts the load on their first scroll, still ahead of the map.
 */
/**
 * A map showing less than this much above the fold still counts as below it.
 * On first paint /city/berlin's map placeholder sits at 809 px in an 823 px
 * viewport (14 px showing) before the sections above it load and push it to
 * 959 px, so "any pixel on screen" loaded maplibre anyway.
 */
const FOLD_SLIVER_PX = 120;

function belowUnscrolledFold(entry: IntersectionObserverEntry | { isIntersecting: boolean }) {
  if (typeof window === 'undefined' || window.scrollY > 0) return false;
  const rect = 'boundingClientRect' in entry ? entry.boundingClientRect : null;
  return rect !== null && rect.top >= window.innerHeight - FOLD_SLIVER_PX;
}

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
    let waitingForScroll = false;
    const onScroll = () => setNear(true);
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (!hit) return;
        io.disconnect();
        if (belowUnscrolledFold(hit)) {
          waitingForScroll = true;
          window.addEventListener('scroll', onScroll, { passive: true, once: true });
        } else {
          setNear(true);
        }
      },
      { rootMargin: MOUNT_MARGIN },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (waitingForScroll) window.removeEventListener('scroll', onScroll);
    };
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
