/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

// The region resolves AFTER first paint. 7d5451f4b replaced a hardcoded Zürich with
// `city.name`, and for the ~300-800ms before the region lands there is no city at all:
// measured on prod, the homepage published `/events?city=` with an EMPTY filter at
// t+300ms and only named the city by t+800ms.
//
// A Playwright assertion cannot guard that: web-first assertions RETRY, so a 300ms
// transient is gone before the assertion settles -- verified by reverting the fix and
// watching the de-pinned e2e cases pass anyway. This is the guard, because rendering
// the component at a chosen state is deterministic.
const state = vi.hoisted(() => ({
  loading: true,
  citySlug: null as string | null,
  city: undefined as Record<string, unknown> | undefined,
  photos: [] as Array<{
    url: string;
    attribution: string | null;
    license: string | null;
    alt: string | null;
  }>,
  reduced: false,
}));

vi.mock('@/components/home/homeRegionContext', () => ({
  useHomeRegionContext: () => ({
    cityId: null,
    citySlug: state.citySlug,
    cityName: null,
    countryId: null,
    countryCode: null,
    countryName: null,
    source: 'none',
    inferred: false,
    loading: state.loading,
    setRegion: () => {},
  }),
}));
vi.mock('@/hooks/usePlaces', () => ({ useOptimizedCity: () => ({ city: state.city }) }));
vi.mock('@/hooks/useEvents', () => ({ useEventsQuery: () => ({ events: [] }) }));
vi.mock('@/hooks/useCityPhotos', () => ({ useCityPhotos: () => ({ data: state.photos }) }));
vi.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => state.reduced }));
vi.mock('../CityNetwork', () => ({ CityNetwork: () => <svg data-testid="net" /> }));

import { HomeCityFeature } from '../HomeCityFeature';

beforeEach(() => {
  state.loading = true;
  state.citySlug = null;
  state.city = undefined;
  state.photos = [];
  state.reduced = false;
});

const resolved = {
  id: 'c1',
  name: 'Zurich',
  slug: 'zuerich',
  image_url: null,
  timezone: 'Europe/Zurich',
};

describe('HomeCityFeature: no half-built city while the region resolves', () => {
  it('publishes no empty ?city= link and no second "Browse places" before the city lands', () => {
    const { container } = renderWithProviders(<HomeCityFeature />);

    // The defect, exactly: an href built from an empty city name.
    expect(container.querySelectorAll('a[href*="city="]')).toHaveLength(0);
    // The hero already has its own "Browse places"; a second one inside this card is a
    // duplicate accessible name and a strict-mode violation for any locator by that name.
    expect(screen.queryByRole('link', { name: /Browse places/i })).toBeNull();
    // NOT asserted here: the "Browse  events" double space the empty interpolation
    // produces in the browser. Under this harness `t()` returns the raw default and
    // never interpolates -- it renders the literal `Browse {{city}} events` -- so an
    // assertion on interpolated copy is vacuous. Everything asserted in this file is
    // interpolation-independent: hrefs come from template literals, and 'Browse places'
    // takes no arguments.
    // A link whose accessible name is just " city guide" names nothing.
    expect(screen.queryByRole('link', { name: /city guide/i })).toBeNull();
  });

  it('renders the full card once the city resolves', () => {
    state.loading = false;
    state.citySlug = 'zuerich';
    state.city = resolved;
    const { container } = renderWithProviders(<HomeCityFeature />);

    // Positive control: the first test must be passing because the card is HELD BACK,
    // not because this component never renders a city guide link at all.
    const guide = screen.getByRole('link', { name: /city guide/i });
    expect(guide).toHaveAttribute('href', expect.stringContaining('/city/zuerich'));
    // And the city-scoped links now carry a real value rather than a bare `city=`.
    const scoped = [...container.querySelectorAll('a[href*="city="]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(scoped.length).toBeGreaterThan(0);
    for (const href of scoped) expect(href).toMatch(/city=[^&]+$/);
  });
});

describe('HomeCityFeature: city picker and photo slider', () => {
  const photos = ['A', 'B', 'C'].map((p) => ({
    url: `https://img.queer.guide/${p}.jpg`,
    attribution: `Photographer ${p}`,
    license: null,
    alt: null,
  }));

  it('offers the city picker on the plate', () => {
    state.loading = false;
    state.citySlug = 'zuerich';
    state.city = resolved;
    renderWithProviders(<HomeCityFeature />);
    expect(screen.getByRole('button', { name: /Change city/i })).toBeInTheDocument();
  });

  it('steps through several photos, each with its own credit', () => {
    state.loading = false;
    state.citySlug = 'zuerich';
    state.city = resolved;
    state.photos = photos;
    renderWithProviders(<HomeCityFeature />);
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText(/Photographer A/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText(/Photographer B/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    expect(screen.getByText('3/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause slideshow' })).toBeInTheDocument();
  });

  it('has no slideshow controls for one photo, and no autoplay control under reduced motion', () => {
    state.loading = false;
    state.citySlug = 'zuerich';
    state.city = resolved;
    state.photos = [photos[0]];
    const { unmount } = renderWithProviders(<HomeCityFeature />);
    expect(screen.queryByRole('button', { name: 'Next photo' })).toBeNull();
    expect(screen.getByText(/Photographer A/)).toBeInTheDocument();
    unmount();
    state.photos = photos;
    state.reduced = true;
    renderWithProviders(<HomeCityFeature />);
    expect(screen.getByRole('button', { name: 'Next photo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause slideshow' })).toBeNull();
  });
  it('keeps autoplay paused while either keyboard focus or hover remains', () => {
    vi.useFakeTimers();
    state.loading = false;
    state.citySlug = 'zuerich';
    state.city = resolved;
    state.photos = photos;
    const { unmount } = renderWithProviders(<HomeCityFeature />);
    try {
      const group = screen.getByRole('group', { name: 'Photos' });
      const next = screen.getByRole('button', { name: 'Next photo' });
      fireEvent.focus(next);
      fireEvent.mouseEnter(group);
      fireEvent.mouseLeave(group);
      act(() => vi.advanceTimersByTime(7000));
      expect(screen.getByText('1/3')).toBeInTheDocument();
      fireEvent.mouseEnter(group);
      fireEvent.blur(next, { relatedTarget: document.body });
      act(() => vi.advanceTimersByTime(7000));
      expect(screen.getByText('1/3')).toBeInTheDocument();
      fireEvent.mouseLeave(group);
      act(() => vi.advanceTimersByTime(7000));
      expect(screen.getByText('2/3')).toBeInTheDocument();
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });
});
