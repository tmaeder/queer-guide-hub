/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithProviders } from '@/test/test-utils';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
// The parts barrel pulls in EntityMap → maplibre, whose worker URL vitest
// refuses to resolve. Nothing here exercises the map.
vi.mock('@/components/map/EntityMap', () => ({ EntityMap: () => <div data-testid="map" /> }));

import {
  buildVillageBreadcrumbs,
  VillageAbout,
  VillagePhotos,
  VillageStops,
  VillageParentCity,
  villageOccurrences,
  type VillageWithRelations,
} from '../QueerVillageDetail.parts';

const t = ((_k: string, d: string, vars?: Record<string, string | number>) =>
  vars
    ? Object.entries(vars).reduce((s, [k, v]) => s.replace(`{{${k}}}`, String(v)), d)
    : d) as never;

const village = {
  id: 'v1',
  name: 'Chueca',
  slug: 'chueca',
  cities: { id: 'c1', slug: 'madrid', name: 'Madrid' },
  countries: { id: 'co1', slug: 'spain', name: 'Spain' },
} as unknown as VillageWithRelations;

describe('QueerVillageDetail.parts', () => {
  it('buildVillageBreadcrumbs walks line → country → city → this page', () => {
    const bc = buildVillageBreadcrumbs(village, t);
    expect(bc.map((c) => c.label)).toEqual(['Queer villages', 'Spain', 'Madrid', 'Chueca']);
  });

  it('VillageAbout renders the history, which is populated on 100% of villages', () => {
    render(
      <MemoryRouter>
        <VillageAbout
          village={{ ...(village as object), history: 'Gay Madrid since the 1980s.' } as never}
          t={t}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Gay Madrid since the 1980s/)).toBeInTheDocument();
  });

  it('VillagePhotos renders nothing when there are no photos', () => {
    // `images` is empty on 190 of 190 villages. Rule 2: no empty shell.
    const { container } = render(<VillagePhotos village={village} t={t} />);
    expect(container.firstChild).toBeNull();
  });

  it('VillageParentCity uses the CITY bullet, not the village one (spec rule 4)', () => {
    renderWithProviders(<VillageParentCity village={village} t={t} />);
    // ROUTE_BULLET_MAP: city = "C", queer_village = "D".
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByText('D')).not.toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------------------
 * Module 05 (stop list) — the module the spec says DEFINES this type.
 * ------------------------------------------------------------------------ */

/** Two real Chueca coordinates, ~230 m apart. */
const stopVenues = [
  {
    id: 'a',
    name: 'Plaza de Chueca',
    slug: 'plaza-de-chueca',
    latitude: 40.4227,
    longitude: -3.6993,
    category: 'bar',
  },
  {
    id: 'b',
    name: 'Calle Hortaleza',
    slug: 'calle-hortaleza',
    latitude: 40.4247,
    longitude: -3.6985,
    category: 'club',
  },
  // No coordinates: must still appear as a stop, just with no gap label.
  { id: 'c', name: 'Unmapped Bar', slug: 'unmapped-bar', latitude: null, longitude: null },
] as never[];

describe('VillageStops — module 05 (stop list)', () => {
  it('renders every venue as a stop, in the order given', () => {
    renderWithProviders(<VillageStops venues={stopVenues} />);
    for (const name of ['Plaza de Chueca', 'Calle Hortaleza', 'Unmapped Bar']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('labels the gap between consecutive stops as distance, never as minutes', () => {
    const { container } = renderWithProviders(<VillageStops venues={stopVenues} />);
    const text = container.textContent ?? '';
    // The product has no routing source, so a walking TIME would be invented
    // precision — a crow-flies minute count is wrong across a canal or a
    // motorway. Distance is what the coordinates actually support.
    expect(text).toMatch(/~\d+\s*m(?![a-z])/);
    expect(text).not.toMatch(/min walk/i);
  });

  it('keeps a coordinate-less venue on the walk rather than dropping it', () => {
    const { container } = renderWithProviders(<VillageStops venues={stopVenues} />);
    expect(screen.getByText('Unmapped Bar')).toBeInTheDocument();
    // Exactly one gap label: the pair with coordinates. The third stop has no
    // measurable gap and must not borrow the previous one.
    expect((container.textContent ?? '').match(/~[\d.]+\s*(?:km|m)(?![a-z])/g)).toHaveLength(1);
  });

  it('renders NO gap label for two venues sharing a coordinate', () => {
    // Caught on production: several Chueca venues carry an identical
    // city-centroid coordinate, so the rounded distance was 0 and the module
    // printed "~0 m". A zero gap is not a gap.
    const coincident = [
      { id: 'x', name: 'Cafe One', slug: 'cafe-one', latitude: 40.4227, longitude: -3.6993 },
      { id: 'y', name: 'Cafe Two', slug: 'cafe-two', latitude: 40.4227, longitude: -3.6993 },
    ] as never[];
    const { container } = renderWithProviders(<VillageStops venues={coincident} />);
    const text = container.textContent ?? '';
    expect(screen.getByText('Cafe Two')).toBeInTheDocument();
    expect(text).not.toMatch(/~\s*0\s*(m|km)/i);
  });

  it('renders nothing at all with no venues', () => {
    const { container } = renderWithProviders(<VillageStops venues={[] as never} />);
    expect(container.firstChild).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Module 03 (occurrences) — village events come from the village's OWN venues.
 * ------------------------------------------------------------------------ */

describe('villageOccurrences', () => {
  it('names the venue the event is at, so a district event is legible as one', () => {
    const rows = villageOccurrences(
      [{ id: 'e1', title: 'Drag Bingo', start_date: '2026-09-04', venue_id: 'a' }] as never,
      [{ id: 'a', name: 'Plaza de Chueca' }] as never,
      'en-GB',
      'Open',
    );
    expect(rows[0].detail).toBe('Drag Bingo · Plaza de Chueca');
    expect(rows[0].date).toMatch(/FRI/);
  });

  it('caps at eight — the module is "what is next", not a listing', () => {
    const many = Array.from({ length: 20 }).map((_, i) => ({
      id: `e${i}`,
      title: `E${i}`,
      start_date: '2026-09-04',
    })) as never;
    expect(villageOccurrences(many, [] as never, 'en-GB', 'Open')).toHaveLength(8);
  });
});
