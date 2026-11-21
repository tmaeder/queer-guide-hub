import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

/**
 * The /venues and /travel heroes load their content after first paint. Both
 * used to render nothing until then and then insert a 224-280px card above the
 * page, which pushed every filter and result down on a phone (mobile CLS 0.197
 * on /venues, 0.114 on /travel). They now hold the space while loading, and
 * still collapse when there is genuinely nothing to show.
 */

const featured = vi.hoisted(() => ({ venues: [] as unknown[], loading: false }));
vi.mock('@/hooks/useVenuesV2Data', () => ({
  useFeaturedVenues: () => ({ venues: featured.venues, loading: featured.loading }),
}));

const cover = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  destLoading: false,
}));
vi.mock('@/hooks/useTravelCoverStory', () => ({
  useTravelCoverStory: () => ({ data: cover.data, isLoading: cover.isLoading }),
}));
vi.mock('@/hooks/useGoNowDestinations', () => ({
  useGoNowDestinations: () => ({ data: [], isLoading: cover.destLoading }),
}));

import { VenuesHero } from '../venues/VenuesHero';
import { TravelCoverStory } from '../travel/TravelCoverStory';

afterEach(() => {
  featured.venues = [];
  featured.loading = false;
  cover.data = undefined;
  cover.isLoading = false;
  cover.destLoading = false;
});

describe('VenuesHero', () => {
  it('holds the slide height while the featured venues load', () => {
    featured.loading = true;
    renderWithProviders(<VenuesHero />);
    const ph = screen.getByTestId('venues-hero-placeholder');
    expect(ph.className).toMatch(/\bmin-h-56\b/);
    expect(ph.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders nothing once loaded with no venue to show', () => {
    const { container } = renderWithProviders(<VenuesHero />);
    expect(screen.queryByTestId('venues-hero-placeholder')).toBeNull();
    expect(container.querySelector('section')).toBeNull();
  });
});

describe('TravelCoverStory', () => {
  it('holds an image band and caption block while the story loads', () => {
    cover.isLoading = true;
    renderWithProviders(<TravelCoverStory />);
    const ph = screen.getByTestId('travel-cover-placeholder');
    expect(ph.querySelector('.aspect-\\[21\\/9\\]')).not.toBeNull();
    expect(ph.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps holding the space while the destinations are still loading', () => {
    cover.destLoading = true;
    renderWithProviders(<TravelCoverStory />);
    expect(screen.getByTestId('travel-cover-placeholder')).toBeTruthy();
  });

  it('renders nothing once loaded with no slide to show', () => {
    renderWithProviders(<TravelCoverStory />);
    expect(screen.queryByTestId('travel-cover-placeholder')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
  });
});
