import { describe, it, expect } from 'vitest';
import { enrichBoundaryFeatures } from '../boundaryUtils';
import type { MapMarker } from '@/hooks/useExploreMapData';

function makeMarker(overrides: Partial<MapMarker> = {}): MapMarker {
  return {
    id: 'country-1',
    name: 'Switzerland',
    lat: 47.37,
    lng: 8.54,
    type: 'country',
    color: '#22c55e',
    subtitle: 'Very high',
    linkTo: '/countries/CH',
    meta: { code: 'CH' },
    ...overrides,
  } as MapMarker;
}

function makeFeatureCollection(features: GeoJSON.Feature[] = []): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}

describe('enrichBoundaryFeatures', () => {
  it('should return empty collection when no matches', () => {
    const boundaries = makeFeatureCollection([
      {
        type: 'Feature',
        properties: { ISO_A2: 'XX' },
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
    ]);
    const result = enrichBoundaryFeatures(boundaries, [makeMarker()]);
    expect(result.features).toHaveLength(0);
  });

  it('should match features by code in default mode', () => {
    const boundaries = makeFeatureCollection([
      {
        type: 'Feature',
        properties: { ISO_A2: 'CH' },
        geometry: { type: 'Point', coordinates: [8.54, 47.37] },
      },
    ]);
    const result = enrichBoundaryFeatures(boundaries, [makeMarker()]);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties?.name).toBe('Switzerland');
    expect(result.features[0].properties?.color).toBe('#22c55e');
  });

  it('should assign sequential numeric IDs', () => {
    const boundaries = makeFeatureCollection([
      {
        type: 'Feature',
        properties: { ISO_A2: 'CH' },
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
      {
        type: 'Feature',
        properties: { ISO_A2: 'DE' },
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
    ]);
    const markers = [
      makeMarker({ meta: { code: 'CH' } }),
      makeMarker({ id: 'country-2', name: 'Germany', meta: { code: 'DE' } }),
    ];
    const result = enrichBoundaryFeatures(boundaries, markers);
    expect(result.features[0].id).toBe(1);
    expect(result.features[1].id).toBe(2);
  });

  it('should match by entityId mode', () => {
    const boundaries = makeFeatureCollection([
      {
        type: 'Feature',
        properties: { id: 'abc-123' },
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
    ]);
    const marker = makeMarker({ id: 'city-abc-123', name: 'Zurich', meta: {} });
    const result = enrichBoundaryFeatures(boundaries, [marker], 'id', 'entityId');
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties?.name).toBe('Zurich');
  });

  it('should skip features without matchKey property', () => {
    const boundaries = makeFeatureCollection([
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } },
    ]);
    const result = enrichBoundaryFeatures(boundaries, [makeMarker()]);
    expect(result.features).toHaveLength(0);
  });

  it('should flatten marker meta with meta_ prefix', () => {
    const marker = makeMarker({ meta: { code: 'CH', score: 90 } });
    const boundaries = makeFeatureCollection([
      {
        type: 'Feature',
        properties: { ISO_A2: 'CH' },
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
    ]);
    const result = enrichBoundaryFeatures(boundaries, [marker]);
    expect(result.features[0].properties?.meta_code).toBe('CH');
    expect(result.features[0].properties?.meta_score).toBe(90);
  });
});
