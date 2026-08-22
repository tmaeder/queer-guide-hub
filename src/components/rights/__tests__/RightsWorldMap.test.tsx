/**
 * @vitest-environment jsdom
 *
 * jsdom has no WebGL, so MapLibre never actually runs there — every existing
 * map test in this repo (EventsMapView, DiscoverMap, CitiesMapPane) exploits
 * that by asserting only "renders without crashing", because `isWebglSupported()`
 * reads real, so the map-construction branch never executes and the mock
 * classes are never really exercised.
 *
 * This suite instead mocks `@/lib/webglSupport` to `true` for the "map is
 * live" tests, so the mount + wiring effects actually run against a fake
 * MapLibre `Map`, and checks what gets handed to `addSource`. The join and
 * label logic is ALSO exported and unit-tested directly (`classifyBoundaries`,
 * `buildMapAriaLabel`) — the belt-and-suspenders the task spec allows for,
 * since it stays correct even if the MapLibre mock timing ever gets fragile.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { classifyBoundaries, buildMapAriaLabel, RightsWorldMap } from '../RightsWorldMap';
import { topicBySlug } from '@/lib/rights/rightsCatalog';
import type { RightsCountry } from '@/hooks/useIntentData';

const CRIMINALISATION = topicBySlug('criminalisation')!;

const countryDE: RightsCountry = {
  id: 'c-de',
  name: 'Germany',
  slug: 'germany',
  code: 'DE',
  equality_score: 80,
  lgbti_criminalization: { legal: true },
  lgbti_same_sex_unions: null,
};

const countryYE: RightsCountry = {
  id: 'c-ye',
  name: 'Yemen',
  slug: 'yemen',
  code: 'YE',
  equality_score: 5,
  lgbti_criminalization: { legal: false, death_penalty: 'Yes' },
  lgbti_same_sex_unions: null,
};

const fakeFeatures: GeoJSON.Feature[] = [
  {
    type: 'Feature',
    id: 1,
    properties: { ISO_A2: 'DE' },
    geometry: { type: 'Polygon', coordinates: [[]] },
  },
  {
    type: 'Feature',
    id: 2,
    properties: { ISO_A2: 'ZZ' }, // no matching country row anywhere below
    geometry: { type: 'Polygon', coordinates: [[]] },
  },
];
const fakeBoundaries: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: fakeFeatures,
};

// ---------------------------------------------------------------------------
// Pure helpers — no MapLibre, no WebGL, deterministic.
// ---------------------------------------------------------------------------

describe('classifyBoundaries (pure join)', () => {
  it('stamps rightsClass = mapClassFor(...) for a matched country', () => {
    const out = classifyBoundaries(fakeBoundaries, [countryDE, countryYE], CRIMINALISATION, 'all');
    const de = out.features.find((f) => f.properties?.ISO_A2 === 'DE');
    expect(de?.properties?.rightsClass).toBe('protected'); // legal: true
  });

  it('stamps rightsClass = "nodata" for a boundary feature with no matching country row', () => {
    const out = classifyBoundaries(fakeBoundaries, [countryDE, countryYE], CRIMINALISATION, 'all');
    const zz = out.features.find((f) => f.properties?.ISO_A2 === 'ZZ');
    expect(zz?.properties?.rightsClass).toBe('nodata');
  });

  it('splits criminalisation severe into death when a death-penalty risk is confirmed', () => {
    const out = classifyBoundaries(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 3,
            properties: { ISO_A2: 'YE' },
            geometry: { type: 'Polygon', coordinates: [[]] },
          },
        ],
      },
      [countryYE],
      CRIMINALISATION,
      'all',
    );
    expect(out.features[0].properties?.rightsClass).toBe('death');
  });

  it('joins case-insensitively (ISO_A2 and country.code both uppercased)', () => {
    const lower: RightsCountry = { ...countryDE, code: 'de' };
    const out = classifyBoundaries(fakeBoundaries, [lower], CRIMINALISATION, 'all');
    const de = out.features.find((f) => f.properties?.ISO_A2 === 'DE');
    expect(de?.properties?.rightsClass).toBe('protected');
  });
});

describe('buildMapAriaLabel', () => {
  it('summarises non-zero classes in most-restrictive-first order', () => {
    const label = buildMapAriaLabel('Same-sex activity', {
      protected: 1,
      partial: 0,
      restricted: 0,
      criminalised: 0,
      death: 0,
      deathPossible: 0,
      nodata: 1,
    });
    expect(label).toBe('World map: Same-sex activity. 1 protected, 1 no data.');
  });

  it('reports nothing measured when every count is zero', () => {
    const label = buildMapAriaLabel('Marriage', {
      protected: 0,
      partial: 0,
      restricted: 0,
      criminalised: 0,
      death: 0,
      deathPossible: 0,
      nodata: 0,
    });
    expect(label).toBe('World map: Marriage. no countries measured yet.');
  });
});

// ---------------------------------------------------------------------------
// Component — mocked MapLibre + boundaries.
// ---------------------------------------------------------------------------

const webglState = vi.hoisted(() => ({ supported: true }));
const mapCalls = vi.hoisted(() => ({
  addSource: [] as { id: string; opts: { data: unknown } }[],
  instances: 0,
  resize: 0,
}));

vi.mock('@/lib/webglSupport', () => ({
  isWebglSupported: () => webglState.supported,
}));

vi.mock('@/hooks/useBoundaryData', () => ({
  useCountryBoundaries: () => ({
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 1,
          properties: { ISO_A2: 'DE' },
          geometry: { type: 'Polygon', coordinates: [[]] },
        },
        {
          type: 'Feature',
          id: 2,
          properties: { ISO_A2: 'ZZ' },
          geometry: { type: 'Polygon', coordinates: [[]] },
        },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('@/config/mapStyle', () => ({ getMapStyle: () => ({}) }));

vi.mock('maplibre-gl', () => {
  class MapMock {
    touchZoomRotate = { disableRotation() {} };
    constructor() {
      mapCalls.instances += 1;
    }
    on(event: string, a: unknown, b?: unknown) {
      // map.on('load', cb) — invoke synchronously so `mapReady` flips true.
      if (event === 'load' && typeof a === 'function') {
        (a as () => void)();
      }
      // map.on('click'|'mousemove'|'mouseleave', layerId, cb) is otherwise a
      // no-op here — this suite doesn't simulate pointer events, only checks
      // what layers/sources were declared.
      void b;
    }
    off() {}
    remove() {}
    addSource(id: string, opts: { data: unknown }) {
      mapCalls.addSource.push({ id, opts });
    }
    getSource() {
      return undefined; // first wiring pass always takes the "create" branch
    }
    addLayer() {}
    getLayer() {
      return undefined;
    }
    setPaintProperty() {}
    setFeatureState() {}
    setFilter() {}
    /**
     * The component calls this from a ResizeObserver: MapLibre measures its
     * container once at construction and never notices it grow, which left a
     * 1376×300 canvas inside a 520px box on the real page. The mock omitted
     * it, so the effect threw `map.resize is not a function` and took two
     * otherwise-passing assertions down with it — a missing method on a hand
     * -written stub reads exactly like a product bug.
     */
    resize() {
      mapCalls.resize += 1;
    }
    getCanvas() {
      return { style: {} };
    }
  }
  return {
    Map: MapMock,
    default: { Map: MapMock },
    setWorkerUrl: () => {},
  };
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

beforeEach(() => {
  webglState.supported = true;
  mapCalls.addSource = [];
  mapCalls.instances = 0;
  mapCalls.resize = 0;
});

describe('RightsWorldMap', () => {
  it('gives the source features whose rightsClass matches the join (including nodata)', () => {
    render(
      <RightsWorldMap
        countries={[countryDE]}
        topic={CRIMINALISATION}
        lens="all"
        activeClass={null}
        onCountrySelect={() => {}}
      />,
    );
    expect(mapCalls.addSource.length).toBeGreaterThan(0);
    const data = mapCalls.addSource[0].opts.data as GeoJSON.FeatureCollection;
    const de = data.features.find((f) => f.properties?.ISO_A2 === 'DE');
    const zz = data.features.find((f) => f.properties?.ISO_A2 === 'ZZ');
    expect(de?.properties?.rightsClass).toBe('protected');
    expect(zz?.properties?.rightsClass).toBe('nodata');
  });

  it('reports the right counts in aria-label', () => {
    render(
      <RightsWorldMap
        countries={[countryDE]}
        topic={CRIMINALISATION}
        lens="all"
        activeClass={null}
        onCountrySelect={() => {}}
      />,
    );
    const el = screen.getByRole('img');
    expect(el.getAttribute('aria-label')).toBe(
      'World map: Same-sex activity. 1 protected, 1 no data.',
    );
  });

  it('renders the fallback and constructs no map when WebGL is unsupported', () => {
    webglState.supported = false;
    render(
      <RightsWorldMap
        countries={[countryDE]}
        topic={CRIMINALISATION}
        lens="all"
        activeClass={null}
        onCountrySelect={() => {}}
      />,
    );
    expect(screen.getByText(/Map unavailable in this browser/i)).toBeInTheDocument();
    expect(mapCalls.instances).toBe(0);
    // Still labelled — never a blank, unlabelled box.
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^World map:/);
  });
});
