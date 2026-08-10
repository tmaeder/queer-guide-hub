/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/routing/LocalizedLink', () => ({ LocalizedLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import {
  buildVillageBreadcrumbs,
  VillageHero,
  VillageOverviewTab,
  VillagePhotosTab,
} from '../QueerVillageDetail.parts';

const village = { id: 'v1', name: 'Castro', slug: 'castro', city: { name: 'SF' }, country: { name: 'US' } } as never;

describe('QueerVillageDetail.parts', () => {
  it('buildVillageBreadcrumbs returns array', () => {
    const bc = buildVillageBreadcrumbs(village, ((_k: string, d: string) => d) as never);
    expect(Array.isArray(bc)).toBe(true);
  });
  it('VillageHero renders', () => {
    const { container } = render(<MemoryRouter><VillageHero village={village} isFavorited={false} onFavoriteToggle={vi.fn()} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
  it('VillageOverviewTab renders', () => {
    const { container } = render(<MemoryRouter><VillageOverviewTab village={village} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
  it('VillagePhotosTab renders', () => {
    const { container } = render(<VillagePhotosTab village={village} />);
    expect(container).toBeTruthy();
  });
});

/* ---------------------------------------------------------------------------
 * Module 05 (stop list) — the module the spec says DEFINES this type.
 * ------------------------------------------------------------------------ */

import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { VillageVenuesTab, type VillageWithRelations } from '../QueerVillageDetail.parts';

const stopVillage = {
  id: 'v1',
  name: 'Chueca',
  slug: 'chueca',
  cities: { id: 'c1', slug: 'madrid', name: 'Madrid' },
  countries: null,
} as unknown as VillageWithRelations;

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

describe('VillageVenuesTab — module 05 (stop list)', () => {
  it('renders every venue as a stop, in the order given', () => {
    renderWithProviders(<VillageVenuesTab village={stopVillage} venues={stopVenues} loading={false} />);
    for (const name of ['Plaza de Chueca', 'Calle Hortaleza', 'Unmapped Bar']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('labels the gap between consecutive stops as distance, never as minutes', () => {
    const { container } = renderWithProviders(
      <VillageVenuesTab village={stopVillage} venues={stopVenues} loading={false} />,
    );
    const text = container.textContent ?? '';
    // The product has no routing source, so a walking TIME would be invented
    // precision — a crow-flies minute count is wrong across a canal or a
    // motorway. Distance is what the coordinates actually support.
    expect(text).toMatch(/~\d+\s*m(?![a-z])/);
    expect(text).not.toMatch(/min walk/i);
  });

  it('keeps a coordinate-less venue on the walk rather than dropping it', () => {
    const { container } = renderWithProviders(
      <VillageVenuesTab village={stopVillage} venues={stopVenues} loading={false} />,
    );
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
    const { container } = renderWithProviders(
      <VillageVenuesTab village={stopVillage} venues={coincident} loading={false} />,
    );
    const text = container.textContent ?? '';
    expect(screen.getByText('Cafe Two')).toBeInTheDocument();
    expect(text).not.toMatch(/~\s*0\s*(m|km)/i);
  });
});
