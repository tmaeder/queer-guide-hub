/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, expectNoNestedInteractive } from '@/test/test-utils';

const state = vi.hoisted(() => ({
  cities: [] as unknown[],
  local: [] as unknown[],
  countryId: null as string | null,
  error: null as Error | null,
  countries: [] as unknown[],
  villages: [] as unknown[],
}));

vi.mock('@/hooks/usePersonalizedCities', () => ({
  fetchTrendingCities: async () => {
    if (state.error) throw state.error;
    return state.cities;
  },
  fetchPersonalizedCitiesByIds: async () => [],
  fetchCountryCities: async () => state.local,
  fetchHomeCountries: async () => state.countries,
  fetchHomeVillages: async () => state.villages,
}));
vi.mock('@/components/home/homeRegionContext', () => ({
  useHomeRegionContext: () => ({
    cityId: state.countryId ? 'Winterthur' : null,
    citySlug: null,
    cityName: null,
    countryId: state.countryId,
    countryCode: null,
    countryName: null,
    source: 'none',
    inferred: false,
    loading: false,
    setRegion: () => {},
  }),
}));
vi.mock('../CityNetwork', () => ({ CityNetwork: () => <svg data-testid="net" /> }));

import CityCards from '../CityCards';

const city = (name: string, equality_score: number | null) => ({
  id: name,
  name,
  slug: name.toLowerCase(),
  image_url: null,
  population: 1,
  editorial_hook: null,
  best_time_to_visit: null,
  countries: { name: 'Somewhere', equality_score },
});

beforeEach(() => {
  state.cities = [];
  state.local = [];
  state.countryId = null;
  state.error = null;
  state.countries = [];
  state.villages = [];
});

const place = (name: string) => ({
  id: name,
  name,
  slug: name.toLowerCase(),
  image_url: null,
  editorial_hook: null,
});

describe('CityCards — mix', () => {
  it('interleaves cities with countries and villages, each linking to its own page', async () => {
    state.cities = [city('Berlin', 100), city('Madrid', 100)];
    state.countries = [place('Spain')];
    state.villages = [place('Chueca')];
    renderWithProviders(<CityCards />);
    const hrefs = (await screen.findAllByRole('link')).map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(['/city/berlin', '/country/spain', '/city/madrid', '/villages/chueca']);
  });
});

describe('CityCards — region', () => {
  it('keeps the band in the visitor country, home city first, no trending mix-in', async () => {
    state.countryId = 'CH';
    state.local = [city('Zürich', 80), city('Winterthur', 80), city('Geneva', 80)];
    state.cities = [city('Berlin', 100)];
    renderWithProviders(<CityCards />);
    const names = (await screen.findAllByRole('link')).map((l) => l.getAttribute('href'));
    expect(names).toEqual(['/city/winterthur', '/city/zürich', '/city/geneva']);
  });
});

describe('CityCards — card', () => {
  it('shows no equality score and names the link after the city alone', async () => {
    state.cities = [city('Zürich', 90)];
    renderWithProviders(<CityCards />);
    const link = await screen.findByRole('link', { name: 'Zürich' });
    expect(link.getAttribute('aria-label')).toBe('Zürich');
    expect(screen.queryByText(/equality/i)).toBeNull();
    expect(screen.queryByText(/90\/100/)).toBeNull();
  });

  it('keeps the whole-card link an overlay sibling', async () => {
    state.cities = [city('Zürich', 90)];
    const { container } = renderWithProviders(<CityCards />);
    await screen.findByText('Zürich');
    expectNoNestedInteractive(container);
  });

  it('shows a recoverable state when the city query fails', async () => {
    state.error = new Error('offline');
    renderWithProviders(<CityCards />);
    expect(await screen.findByRole('status')).toHaveTextContent('This section could not load');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
