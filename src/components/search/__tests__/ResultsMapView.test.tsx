import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { MapStation } from '@/components/map/mapDomain';
import { ResultsMapView } from '../ResultsMapView';

const mapShell = vi.hoisted(() => vi.fn());
vi.mock('@/components/map/MapShell', () => ({
  MapShell: (props: { source: { stations: MapStation[] } }) => {
    mapShell(props);
    return null;
  },
}));

it('keeps ranked search hits and uses their canonical detail routes', () => {
  render(<ResultsMapView results={[
    { type: 'venue', objectID: '1', title: 'Venue', slug: 'a-venue', _geoloc: { lat: 0, lng: 0 } },
    { type: 'queer_village', objectID: '2', title: 'Village', slug: 'a-village', _geoloc: { lat: 1, lng: 2 } },
    { type: 'venue', objectID: '3', title: 'Invalid', _geoloc: { lat: 120, lng: 0 } },
  ]} />);

  const { source } = mapShell.mock.lastCall![0];
  expect(source.ordered).toBe(true);
  expect(source.stations.map((station: MapStation) => station.linkTo)).toEqual([
    '/venues/a-venue',
    '/villages/a-village',
  ]);
});
