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
      return def.replace(/\{\{(\w+)\}\}/g, (_, k) => String((o as Record<string, unknown>)[k] ?? ''));
    },
  }),
}));
vi.mock('@/hooks/useCitiesDirectory', () => ({
  useCitiesDirectory: useDirectoryMock,
}));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/components/discovery', () => ({
  PageHero: () => <div data-testid="hero" />,
}));
vi.mock('../cities/CitiesMapPane', () => ({
  CitiesMapPane: () => <div data-testid="map-pane" />,
}));

import Cities from '../Cities';

const berlin: DirectoryCity = {
  id: 'berlin',
  slug: 'berlin',
  name: 'Berlin',
  population: 3_700_000,
  latitude: 52.5,
  longitude: 13.4,
  countries: {
    id: 'de',
    name: 'Germany',
    slug: 'germany',
    equality_score: 75,
    continents: { code: 'EU', name: 'Europe' },
  },
};
const madrid: DirectoryCity = {
  id: 'madrid',
  slug: 'madrid',
  name: 'Madrid',
  population: 3_300_000,
  latitude: 40.4,
  longitude: -3.7,
  countries: {
    id: 'es',
    name: 'Spain',
    slug: 'spain',
    equality_score: 89,
    continents: { code: 'EU', name: 'Europe' },
  },
};

beforeEach(() => useDirectoryMock.mockReset());

describe('Cities page', () => {
  it('renders skeleton list while loading', () => {
    useDirectoryMock.mockReturnValue({
      cities: [],
      filtered: [],
      continents: [],
      venueCounts: new Map(),
      loading: true,
      error: null,
    });
    renderWithProviders(<Cities />, { route: '/cities' });
    // No real city rows
    expect(screen.queryByText('Berlin')).not.toBeInTheDocument();
  });

  it('renders error state when the hook errors', () => {
    useDirectoryMock.mockReturnValue({
      cities: [],
      filtered: [],
      continents: [],
      venueCounts: new Map(),
      loading: false,
      error: 'boom',
    });
    renderWithProviders(<Cities />, { route: '/cities' });
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('renders a row per filtered city', () => {
    useDirectoryMock.mockReturnValue({
      cities: [berlin, madrid],
      filtered: [berlin, madrid],
      continents: [{ code: 'EU', name: 'Europe' }],
      venueCounts: new Map([['berlin', 142], ['madrid', 98]]),
      loading: false,
      error: null,
    });
    renderWithProviders(<Cities />, { route: '/cities' });
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('Madrid')).toBeInTheDocument();
    expect(screen.getByText('142 venues')).toBeInTheDocument();
    expect(screen.getByText('98 venues')).toBeInTheDocument();
  });

  it('shows filtered empty state when filters active but nothing matches', () => {
    useDirectoryMock.mockReturnValue({
      cities: [berlin, madrid],
      filtered: [],
      continents: [{ code: 'EU', name: 'Europe' }],
      venueCounts: new Map(),
      loading: false,
      error: null,
    });
    renderWithProviders(<Cities />, { route: '/cities?q=tokyo' });
    expect(screen.getByText(/Try removing a filter/i)).toBeInTheDocument();
  });

  it('result count reflects filtered + total', () => {
    useDirectoryMock.mockReturnValue({
      cities: [berlin, madrid],
      filtered: [berlin],
      continents: [{ code: 'EU', name: 'Europe' }],
      venueCounts: new Map(),
      loading: false,
      error: null,
    });
    renderWithProviders(<Cities />, { route: '/cities?q=ber' });
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 cities');
  });

  it('typing in the search input updates the URL', () => {
    useDirectoryMock.mockReturnValue({
      cities: [berlin, madrid],
      filtered: [berlin, madrid],
      continents: [{ code: 'EU', name: 'Europe' }],
      venueCounts: new Map(),
      loading: false,
      error: null,
    });
    renderWithProviders(<Cities />, { route: '/cities' });
    const input = screen.getByPlaceholderText('Search cities…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ber' } });
    expect(input.value).toBe('ber');
  });

  it('renders mobile view tabs for switching list and map', () => {
    useDirectoryMock.mockReturnValue({
      cities: [berlin, madrid],
      filtered: [berlin, madrid],
      continents: [{ code: 'EU', name: 'Europe' }],
      venueCounts: new Map(),
      loading: false,
      error: null,
    });
    renderWithProviders(<Cities />, { route: '/cities' });
    expect(screen.getByRole('tab', { name: 'List' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Map' })).toBeInTheDocument();
  });

  it('the active tab matches ?view= in the URL on first render', () => {
    useDirectoryMock.mockReturnValue({
      cities: [berlin, madrid],
      filtered: [berlin, madrid],
      continents: [{ code: 'EU', name: 'Europe' }],
      venueCounts: new Map(),
      loading: false,
      error: null,
    });
    renderWithProviders(<Cities />, { route: '/cities?view=map' });
    expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tab', { name: 'List' })).toHaveAttribute('data-state', 'inactive');
  });
});
