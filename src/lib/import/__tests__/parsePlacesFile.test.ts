/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { parsePlacesFile, coordsFromMapsUrl } from '../parsePlacesFile';
import { matchPlacesToVenues, importBbox, normalizeTokens } from '../matchPlaces';

const GPX = `<?xml version="1.0"?>
<gpx version="1.1">
  <wpt lat="52.5200" lon="13.4050"><name>SchwuZ</name><desc>club night</desc></wpt>
  <wpt lat="48.8566" lon="2.3522"><name>Le Marais walk</name></wpt>
</gpx>`;

const KML = `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>Berghain</name><Point><coordinates>13.4430,52.5111,0</coordinates></Point></Placemark>
  <Placemark><name>Route only</name><LineString><coordinates>1,1 2,2</coordinates></LineString></Placemark>
</Document></kml>`;

const TAKEOUT_GEOJSON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [13.405, 52.52] },
      properties: { location: { name: 'Silver Future', address: 'Weisestr. 8' } },
    },
  ],
});

const TAKEOUT_CSV = `Title,Note,URL
"Café, Example","great coffee","https://www.google.com/maps/place/x/@52.4900,13.4200,17z"
No URL place,,`;

describe('parsePlacesFile', () => {
  it('parses GPX waypoints', () => {
    const out = parsePlacesFile('list.gpx', GPX);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ name: 'SchwuZ', lat: 52.52, lng: 13.405, notes: 'club night' });
  });

  it('parses KML point placemarks (LineString has no coords)', () => {
    const out = parsePlacesFile('list.kml', KML);
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('Berghain');
    expect(out[0].lat).toBeCloseTo(52.5111);
    expect(out[1].lat).toBeNull();
  });

  it('parses Takeout GeoJSON with location.name', () => {
    const out = parsePlacesFile('Saved Places.json', TAKEOUT_GEOJSON);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Silver Future');
    expect(out[0].notes).toBe('Weisestr. 8');
  });

  it('parses Takeout CSV with quoted fields and URL coords', () => {
    const out = parsePlacesFile('Want to go.csv', TAKEOUT_CSV);
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('Café, Example');
    expect(out[0].lat).toBeCloseTo(52.49);
    expect(out[1].lat).toBeNull();
  });

  it('rejects unsupported extensions and broken XML', () => {
    expect(() => parsePlacesFile('x.docx', '')).toThrow(/unsupported/);
    expect(() => parsePlacesFile('x.gpx', '<gpx><wpt')).toThrow(/invalid gpx/);
  });
});

describe('coordsFromMapsUrl', () => {
  it('extracts !3d!4d pattern', () => {
    expect(coordsFromMapsUrl('https://maps.google.com/?x!3d52.5!4d13.4!z')).toEqual({
      lat: 52.5,
      lng: 13.4,
    });
  });
  it('returns null without coords', () => {
    expect(coordsFromMapsUrl('https://maps.google.com/place/foo')).toBeNull();
  });
});

describe('matchPlacesToVenues', () => {
  const venue = {
    id: 'v1',
    name: 'SchwuZ Queer Club',
    latitude: 52.5201,
    longitude: 13.4052,
    city_id: 'c1',
    country_id: 'k1',
  };

  it('matches by shared name token within 300m', () => {
    const [m] = matchPlacesToVenues(
      [{ name: 'SchwuZ', lat: 52.5215, lng: 13.4055, notes: null }],
      [venue],
    );
    expect(m.venue?.id).toBe('v1');
  });

  it('matches by bare proximity within 60m', () => {
    const [m] = matchPlacesToVenues(
      [{ name: 'Totally different', lat: 52.52012, lng: 13.40523, notes: null }],
      [venue],
    );
    expect(m.venue?.id).toBe('v1');
  });

  it('no match beyond 300m even with name hit', () => {
    const [m] = matchPlacesToVenues(
      [{ name: 'SchwuZ', lat: 52.54, lng: 13.405, notes: null }],
      [venue],
    );
    expect(m.venue).toBeNull();
  });

  it('no match without coords', () => {
    const [m] = matchPlacesToVenues([{ name: 'SchwuZ', lat: null, lng: null, notes: null }], [venue]);
    expect(m.venue).toBeNull();
  });
});

describe('helpers', () => {
  it('normalizeTokens strips accents and short tokens', () => {
    expect(normalizeTokens('Café Über 21')).toEqual(['cafe', 'uber']);
  });
  it('importBbox pads around located places', () => {
    const box = importBbox([
      { name: 'a', lat: 52, lng: 13, notes: null },
      { name: 'b', lat: 53, lng: 14, notes: null },
      { name: 'c', lat: null, lng: null, notes: null },
    ]);
    expect(box).toEqual({ minLat: 51.98, maxLat: 53.02, minLng: 12.98, maxLng: 14.02 });
  });
});
