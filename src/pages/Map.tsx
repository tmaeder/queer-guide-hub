import { useSearchParams } from 'react-router';
import { MapShell } from '@/components/map/MapShell';

function parseNum(raw: string | null, min: number, max: number): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

/**
 * Full-viewport map page at /map.
 *
 * The camera is read off the URL here so the first MapLibre construction gets
 * the right center (and `skipAutoFly` suppresses the IP-geo fly). Everything
 * else — lines, view, filters, write-back and localStorage prefs — lives in
 * `useMapShellState`, which owns the full `?view&lines&q&…&lat&lng&z` schema
 * (and accepts the retired `?lens&layers` on read; see mapLegacyUrl).
 *
 * `?route=guide:<slug>` / `?route=trip:<id>` is the ONE param a curated route
 * needs. `isMapRoute` (lib/locale.ts) already matches `/map`, so no new route
 * is registered and the MobileBottomNav / LayoutShell / AudioMiniBar coupling
 * stays untouched — and trips get a full-bleed map from the same param free.
 */
const MapPage = () => {
  const [searchParams] = useSearchParams();
  const lat = parseNum(searchParams.get('lat'), -90, 90);
  const lng = parseNum(searchParams.get('lng'), -180, 180);
  const z = parseNum(searchParams.get('z'), 0, 22);
  const initialCenter: [number, number] | undefined =
    lat != null && lng != null ? [lng, lat] : undefined;

  /**
   * The route reference, parsed but NOT yet resolved to stops: resolving a
   * guide's picks runs under each target's OWN RLS (see guidePickAdapters),
   * which is what keeps a safety-gated pick absent rather than leaked, and
   * that fetch is its own change.
   *
   * Until it lands, `?view=routes` reaches `viewRenderPlan`'s routes branch
   * with `hasRoute: false` and the map says "no route to draw here yet"
   * instead of silently showing viewport pins — which is the whole point of
   * the branch existing.
   */
  const routeRef = searchParams.get('route');

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 64px)' }}>
      <MapShell
        surface="discover"
        height="calc(100dvh - 64px)"
        initialCenter={initialCenter}
        initialZoom={z}
        skipAutoFly={initialCenter != null}
        configOverride={routeRef ? { defaultView: 'routes' } : undefined}
      />
    </div>
  );
};

export default MapPage;
