/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, expectNoNestedInteractive } from '@/test/test-utils';

const state = vi.hoisted(() => ({ cities: [] as unknown[] }));

vi.mock('@/hooks/usePersonalizedCities', () => ({
  fetchTrendingCities: async () => state.cities,
  fetchPersonalizedCitiesByIds: async () => [],
}));
vi.mock('@/components/home/HomeRegionProvider', () => ({
  useHomeRegionContext: () => ({
    cityId: null,
    citySlug: null,
    cityName: null,
    countryId: null,
    countryCode: null,
    countryName: null,
    source: 'none',
    inferred: false,
    loading: false,
    setRegion: () => {},
  }),
}));
vi.mock('../CityNetwork', () => ({ CityNetwork: () => <svg data-testid="net" /> }));

import { CityCards } from '../CityCards';

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
});

describe('CityCards — equality score', () => {
  it('labels the score and states its scale', async () => {
    state.cities = [city('Zürich', 90)];
    renderWithProviders(<CityCards />);
    // The old card rendered "90" with only a hover title — a figure a reader
    // cannot calibrate, on a safety-adjacent metric.
    expect(await screen.findByText(/equality\s*90\/100/i)).toBeTruthy();
  });

  it('stays silent about the tier when there is nothing to caution about', async () => {
    // The curated set is all rights-affirming, so printing the tier word put
    // "Very High" on all eight cards. A label that never varies is noise.
    state.cities = [city('Zürich', 90), city('Madrid', 100)];
    renderWithProviders(<CityCards />);
    await screen.findByText(/equality\s*90\/100/i);
    expect(screen.queryByText(/very high/i)).toBeNull();
  });

  it('names the tier when the score IS a caution', async () => {
    // The visitor's own city is prepended with no equality filter, so this is
    // the case that matters and it must not be silent.
    state.cities = [city('Somewhere', 15)];
    renderWithProviders(<CityCards />);
    expect(await screen.findByText(/equality\s*15\/100\s*·\s*very low/i)).toBeTruthy();
  });

  it('uses the canonical tier vocabulary, not its own thresholds', async () => {
    state.cities = [city('A', 90), city('B', 65), city('C', 45), city('D', 25), city('E', 5)];
    const { container } = renderWithProviders(<CityCards />);
    await screen.findByText(/equality 90/i);
    const lines = Array.from(container.querySelectorAll('.uppercase')).map((e) =>
      (e.textContent || '').trim(),
    );
    // Exact tier words, so "High" cannot be satisfied by "Very High".
    expect(lines).toEqual(
      expect.arrayContaining([
        // At or above `high`, the number stands alone.
        expect.stringMatching(/^Equality 90\/100$/i),
        expect.stringMatching(/^Equality 65\/100$/i),
        // Below it, the canonical tier word is spelled out. Exact, so "Low"
        // cannot be satisfied by "Very Low".
        expect.stringMatching(/^Equality 45\/100 · Moderate$/i),
        expect.stringMatching(/^Equality 25\/100 · Low$/i),
        expect.stringMatching(/^Equality 5\/100 · Very Low$/i),
      ]),
    );
  });

  it('omits the line entirely when the score is unknown', async () => {
    // 11 countries genuinely have no score. Printing "0" or "50" there would
    // be a false claim about a safety-adjacent metric.
    state.cities = [city('Nowhere', null)];
    renderWithProviders(<CityCards />);
    await screen.findByText('Nowhere');
    expect(screen.queryByText(/equality/i)).toBeNull();
  });

  it('tells assistive tech the score is NATIONAL, not the city’s own', async () => {
    state.cities = [city('Zürich', 90)];
    const { container } = renderWithProviders(<CityCards />);
    await screen.findByText('Zürich');
    const label = container.querySelector('a.absolute')?.getAttribute('aria-label') ?? '';
    // This suite has no i18next instance, so `t()` returns the raw template and
    // {{city}}/{{score}} stay uninterpolated — the same call shape ships in
    // ArchiveBand and does interpolate in the app. Assert the SUBSTANCE that is
    // independent of interpolation: it explains the number, and it says the
    // score belongs to the country rather than to this city.
    expect(label).toMatch(/of 100/i);
    expect(label).toMatch(/national/i);
    expect(label).not.toBe('Zürich');
  });

  it('falls back to the plain city name when there is no score to explain', async () => {
    state.cities = [city('Nowhere', null)];
    renderWithProviders(<CityCards />);
    const link = await screen.findByRole('link', { name: 'Nowhere' });
    expect(link.getAttribute('aria-label')).toBe('Nowhere');
  });

  it('keeps the whole-card link an overlay sibling', async () => {
    state.cities = [city('Zürich', 90)];
    const { container } = renderWithProviders(<CityCards />);
    await screen.findByText('Zürich');
    expectNoNestedInteractive(container);
  });
});
