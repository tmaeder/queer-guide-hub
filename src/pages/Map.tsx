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
 * else — layers, lens, filters, write-back and localStorage prefs — lives in
 * `useMapShellState`, which owns the full `?lens&layers&q&…&lat&lng&z` schema.
 */
const MapPage = () => {
  const [searchParams] = useSearchParams();
  const lat = parseNum(searchParams.get('lat'), -90, 90);
  const lng = parseNum(searchParams.get('lng'), -180, 180);
  const z = parseNum(searchParams.get('z'), 0, 22);
  const initialCenter: [number, number] | undefined =
    lat != null && lng != null ? [lng, lat] : undefined;

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 64px)' }}>
      <MapShell
        surface="discover"
        height="calc(100dvh - 64px)"
        initialCenter={initialCenter}
        initialZoom={z}
        skipAutoFly={initialCenter != null}
      />
    </div>
  );
};

export default MapPage;
