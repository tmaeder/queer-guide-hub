import type { VenueListItem } from '@/api/venues';
import { venuesToGeoJSON } from '../venuesGeoJSON';

const v = (over: Partial<VenueListItem>): VenueListItem => ({
  id: 'id',
  slug: 'slug',
  name: 'Name',
  category: 'bar',
  latitude: 47.37,
  longitude: 8.54,
  city: 'Zürich',
  address: '',
  is_featured: false,
  ...over,
});

it('emits [lng, lat] points with the props the map needs', () => {
  const fc = venuesToGeoJSON([v({ id: 'a', slug: 'heaven', is_featured: true })]);
  expect(fc.features).toEqual([
    {
      type: 'Feature',
      id: 'a',
      geometry: { type: 'Point', coordinates: [8.54, 47.37] },
      properties: { slug: 'heaven', name: 'Name', category: 'bar', featured: true },
    },
  ]);
});

it('drops rows without usable coordinates', () => {
  const fc = venuesToGeoJSON([
    v({ id: 'nolat', latitude: null }),
    v({ id: 'nolng', longitude: null }),
    v({ id: 'bad', latitude: 120 }),
    v({ id: 'ok' }),
  ]);
  expect(fc.features.map((f) => f.id)).toEqual(['ok']);
});
