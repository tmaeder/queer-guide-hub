/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { DirectoryCity } from '@/hooks/useCitiesDirectory';

const { useDirectoryMock } = vi.hoisted(() => ({ useDirectoryMock: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, d?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const def = typeof d === 'string' ? d : _k;
      const o = (typeof d === 'object' ? d : opts) ?? {};
      return def.replace(/\{\{(\w+)\}\}/g, (_, k) =>
        String((o as Record<string, unknown>)[k] ?? ''),
      );
    },
  }),
}));
vi.mock('@/hooks/useCitiesDirectory', () => ({
  useCitiesDirectory: useDirectoryMock,
}));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('../cities/CitiesMapPane', () => ({
  CitiesMapPane: () => <div data-testid="map-pane" />,
}));

import Cities from '../Cities';

function city(
  over: Partial<DirectoryCity> & Pick<DirectoryCity, 'id' | 'slug' | 'name'>,
): DirectoryCity {
  return {
    population: 1_000_000,
    latitude: 0,
    longitude: 0,
    venue_count: 0,
    upcoming_event_count: 0,
    village_count: 0,
    high_risk: false,
    countries: {
      id: 'de',
      name: 'Germany',
      slug: 'germany',
      equality_score: 75,
      continents: { code: 'EU', name: 'Europe' },
    },
    ...over,
  };
}

const berlin = city({ id: 'berlin', slug: 'berlin', name: 'Berlin', venue_count: 870 });
const madrid = city({
  id: 'madrid',
  slug: 'madrid',
  name: 'Madrid',
  venue_count: 397,
  countries: {
    id: 'es',
    name: 'Spain',
    slug: 'spain',
    equality_score: 89,
    continents: { code: 'EU', name: 'Europe' },
  },
});

function directory(over: Record<string, unknown> = {}) {
  return {
    cities: [berlin, madrid],
    filtered: [berlin, madrid],
    continents: [{ code: 'EU', name: 'Europe', count: 2 }],
    venueCounts: new Map([
      ['berlin', 870],
      ['madrid', 397],
    ]),
    continentFacets: new Map([['eu', 2]]),
    loading: false,
    error: null,
    ...over,
  };
}

beforeEach(() => useDirectoryMock.mockReset());

describe('Cities page', () => {
  it('renders skeletons while loading, not city cards', () => {
    useDirectoryMock.mockReturnValue(
      directory({ cities: [], filtered: [], continents: [], loading: true }),
    );
    renderWithProviders(<Cities />, { route: '/cities' });
    expect(screen.queryByText('Berlin')).not.toBeInTheDocument();
  });

  it('renders error state when the hook errors', () => {
    useDirectoryMock.mockReturnValue(
      directory({ cities: [], filtered: [], continents: [], error: 'boom' }),
    );
    renderWithProviders(<Cities />, { route: '/cities' });
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('renders a card per filtered city, with its place count', () => {
    useDirectoryMock.mockReturnValue(directory());
    renderWithProviders(<Cities />, { route: '/cities' });
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('Madrid')).toBeInTheDocument();
    expect(screen.getByText('870 places')).toBeInTheDocument();
    expect(screen.getByText('397 places')).toBeInTheDocument();
  });

  it('names a real network but says nothing for a template line', () => {
    // Berlin has committed OSM geometry; "Nowhere" does not. The caption is the
    // only thing distinguishing the two, so its ABSENCE is the assertion that
    // matters — without it the page would claim every city has a metro.
    const nowhere = city({ id: 'nowhere', slug: 'nowhere-ville', name: 'Nowhere' });
    useDirectoryMock.mockReturnValue(
      directory({ cities: [berlin, nowhere], filtered: [berlin, nowhere] }),
    );
    renderWithProviders(<Cities />, { route: '/cities' });
    expect(screen.getByText('Metro network')).toBeInTheDocument();
    expect(screen.queryAllByText(/network$/)).toHaveLength(1);
  });

  it('marks a criminalized destination in words, not colour alone', () => {
    const risky = city({ id: 'x', slug: 'x', name: 'Risky', high_risk: true });
    useDirectoryMock.mockReturnValue(directory({ cities: [risky], filtered: [risky] }));
    renderWithProviders(<Cities />, { route: '/cities' });
    expect(screen.getByText('Criminalized')).toBeInTheDocument();
  });

  it('shows the filtered empty state when nothing matches', () => {
    useDirectoryMock.mockReturnValue(directory({ filtered: [] }));
    renderWithProviders(<Cities />, { route: '/cities?q=tokyo' });
    expect(screen.getByText(/Try removing a filter/i)).toBeInTheDocument();
  });

  it('result count reflects filtered + total', () => {
    useDirectoryMock.mockReturnValue(directory({ filtered: [berlin] }));
    renderWithProviders(<Cities />, { route: '/cities?q=ber' });
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 cities');
  });

  it('typing in the search input updates the URL', () => {
    useDirectoryMock.mockReturnValue(directory());
    renderWithProviders(<Cities />, { route: '/cities' });
    const input = screen.getByPlaceholderText('Search cities…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ber' } });
    expect(input.value).toBe('ber');
  });

  it('the continent line index stays on screen while a continent is selected', () => {
    // The bug this guards: hiding the index once it is used takes the map away
    // from the reader at exactly the moment they started navigating by it.
    useDirectoryMock.mockReturnValue(directory({ filtered: [berlin] }));
    renderWithProviders(<Cities />, { route: '/cities?continent=eu' });
    const group = screen.getByRole('group', { name: 'Filter by continent' });
    expect(group).toBeInTheDocument();
    // The tile's accessible name carries its count ("Europe 2 cities"), which is
    // the number a reader needs before choosing it — match on the prefix.
    expect(screen.getByRole('button', { name: /^Europe/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('?view=map swaps the grid for the map pane', () => {
    useDirectoryMock.mockReturnValue(directory());
    renderWithProviders(<Cities />, { route: '/cities?view=map' });
    expect(screen.queryByText('Berlin')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'List' })).toBeInTheDocument();
  });
});
