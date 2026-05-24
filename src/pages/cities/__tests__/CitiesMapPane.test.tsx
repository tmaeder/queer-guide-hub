/**
 * @vitest-environment jsdom
 *
 * Map-rendering library tests are intentionally minimal — maplibre-gl
 * requires WebGL which jsdom doesn't provide, so we mock the module and
 * only assert that the wrapper element mounts with the expected a11y
 * surface.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DirectoryCity } from '@/hooks/useCitiesDirectory';

vi.mock('maplibre-gl', () => ({
  default: {
    Map: class {
      on() {}
      once() {}
      addControl() {}
      addSource() {}
      addLayer() {}
      getSource() {
        return undefined;
      }
      getLayer() {
        return undefined;
      }
      setFeatureState() {}
      setFilter() {}
      flyTo() {}
      fitBounds() {}
      isStyleLoaded() {
        return false;
      }
      remove() {}
      getCanvas() {
        return { style: {} };
      }
      getZoom() {
        return 1;
      }
    },
    NavigationControl: class {},
    LngLatBounds: class {
      extend() {}
    },
  },
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

import { CitiesMapPane } from '../CitiesMapPane';

const berlin: DirectoryCity = {
  id: 'berlin',
  slug: 'berlin',
  name: 'Berlin',
  latitude: 52.5,
  longitude: 13.4,
  population: 3_700_000,
  countries: {
    id: 'de',
    name: 'Germany',
    slug: 'germany',
    equality_score: 75,
    continents: { code: 'EU', name: 'Europe' },
  },
};

describe('CitiesMapPane', () => {
  it('renders a region landmark for the map', () => {
    render(<CitiesMapPane cities={[berlin]} onSelectCity={() => {}} />);
    expect(screen.getByRole('region', { name: /cities map/i })).toBeInTheDocument();
  });

  it('mounts cleanly with an empty city list', () => {
    expect(() =>
      render(<CitiesMapPane cities={[]} onSelectCity={() => {}} />),
    ).not.toThrow();
  });
});
