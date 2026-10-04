import { describe, expect, it } from 'vitest';
import { routeFeatures } from '@/components/map/hooks/useRouteLines';
import type { MapRoute, MapRouteStop, MapStation } from '@/components/map/mapDomain';

const station = (lng: number, lat: number, name = 'S'): MapStation => ({
  id: `venue-${name}`,
  type: 'venues',
  entity: 'venue',
  line: 'M',
  name,
  lng,
  lat,
  color: '#111',
  featured: false,
  live: false,
});

const stop = (position: number, lng: number, lat: number): MapRouteStop => ({
  position,
  station: station(lng, lat, `p${position}`),
});

const route = (stops: MapRouteStop[]): MapRoute => ({
  id: 'r1',
  kind: 'trip',
  title: 'A route',
  stops,
});

const leg = (fc: GeoJSON.FeatureCollection) =>
  fc.features.find((f) => f.properties?.kind === 'leg');
const stopFeatures = (fc: GeoJSON.FeatureCollection) =>
  fc.features.filter((f) => f.properties?.kind === 'stop');

describe('route geometry', () => {
  it('every stop coordinate IS a LineString vertex', () => {
    // SET MEMBERSHIP, not a distance tolerance. A tolerance passes on a route
    // whose line merely goes near its stops, which is exactly the failure a
    // reader would see as "the line misses the pin".
    const fc = routeFeatures(route([stop(1, 13.4, 52.5), stop(2, 2.35, 48.86), stop(3, -0.12, 51.5)]));
    const line = leg(fc)!.geometry as GeoJSON.LineString;
    const vertices = new Set(line.coordinates.map((c) => c.join(',')));
    for (const s of stopFeatures(fc)) {
      const p = (s.geometry as GeoJSON.Point).coordinates.join(',');
      expect(vertices, `${p} is not a vertex`).toContain(p);
    }
  });

  it('the vertex ORDER equals the position order — array equality', () => {
    // Deliberately handed to the builder out of order: an itinerary sorted
    // featured-then-nearest is wrong by construction, so the sort is the
    // behaviour under test.
    const fc = routeFeatures(
      route([stop(3, -0.12, 51.5), stop(1, 13.4, 52.5), stop(2, 2.35, 48.86)]),
    );
    const line = leg(fc)!.geometry as GeoJSON.LineString;
    expect(line.coordinates).toEqual([
      [13.4, 52.5],
      [2.35, 48.86],
      [-0.12, 51.5],
    ]);
  });

  it('coordinates.length equals the stop count', () => {
    // A silently dropped stop fails HERE and nowhere else — the line still
    // looks like a line.
    for (const n of [2, 3, 7]) {
      const stops = Array.from({ length: n }, (_, i) => stop(i + 1, i, i));
      const fc = routeFeatures(route(stops));
      const line = leg(fc)!.geometry as GeoJSON.LineString;
      expect(line.coordinates).toHaveLength(n);
      expect(stopFeatures(fc)).toHaveLength(n);
    }
  });

  it('a GAP in the positions is VISIBLE — survivors keep their numbers', () => {
    // The route is missing stop 3. Renumbering the survivors 1,2,3,4 would
    // present a wrong route as a right one; the labels must read 1,2,4,5.
    const fc = routeFeatures(route([stop(1, 0, 0), stop(2, 1, 1), stop(4, 3, 3), stop(5, 4, 4)]));
    expect(stopFeatures(fc).map((f) => f.properties?.label)).toEqual(['1', '2', '4', '5']);
  });

  it('draws a single stop as a marker with no line', () => {
    // A one-stop route is a real thing. Refusing to draw it would be the
    // silent fall-through the routes view exists to avoid.
    const fc = routeFeatures(route([stop(1, 13.4, 52.5)]));
    expect(leg(fc)).toBeUndefined();
    expect(stopFeatures(fc)).toHaveLength(1);
  });

  it('draws nothing for an empty route', () => {
    expect(routeFeatures(route([])).features).toEqual([]);
  });

  it('carries NO hue — days are not coloured', () => {
    // `TripMap.dayColor()` was `hsl((330 + i*47) % 360, 70%, 52%)`: the only
    // raw-HSL palette on any map here, and it encoded day identity by hue
    // ALONE (WCAG 1.4.1). Emphasis replaces enumeration, and the stop number
    // is the cue that survives any colour decision — so no feature may carry
    // a colour at all.
    const fc = routeFeatures(route([stop(1, 0, 0), stop(2, 1, 1)]));
    const json = JSON.stringify(fc);
    expect(json).not.toMatch(/hsl\(/);
    expect(json).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    for (const f of fc.features) {
      expect(Object.keys(f.properties ?? {})).not.toContain('color');
    }
  });
});
