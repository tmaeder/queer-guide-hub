/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  rail: vi.fn(() => ({ loading: false, venues: [] })),
  user: null as { id: string } | null,
}));
vi.mock('@/hooks/useVenueRail', () => ({ useVenueRail: mocks.rail }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string | { defaultValue: string }) =>
      typeof fallback === 'string' ? fallback : fallback.defaultValue,
  }),
}));
vi.mock('@/components/venues/VenueCard', () => ({ VenueCard: () => <div>Venue</div> }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
import { VenuesRails } from '../VenuesRails';

let callbacks: IntersectionObserverCallback[];
beforeEach(() => {
  mocks.rail.mockClear();
  mocks.user = null;
  callbacks = [];
  class Observer {
    constructor(callback: IntersectionObserverCallback) {
      callbacks.push(callback);
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', Observer);
});
afterEach(() => vi.unstubAllGlobals());
const intersect = (index: number, isIntersecting = true) =>
  act(() =>
    callbacks[index]([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver),
  );

describe('Venues discovery query ownership', () => {
  it('does not query offscreen rails and activates only the approached rail', () => {
    render(<VenuesRails userLocation={null} primaryCityId={null} primaryCityName={null} />);
    expect(mocks.rail).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'New this month' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Editor’s picks' })).toBeVisible();
    intersect(0);
    expect(mocks.rail).toHaveBeenCalledExactlyOnceWith(
      true,
      expect.objectContaining({ sort: 'created_at' }),
    );
    intersect(0, false);
    expect(mocks.rail).toHaveBeenCalledTimes(1);
    intersect(1);
    expect(mocks.rail).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({ sort: 'featured' }),
    );
  });

  it('keeps personalization and location parameters on the deferred owner', () => {
    mocks.user = { id: 'reader' };
    render(
      <VenuesRails
        userLocation={{ latitude: 47, longitude: 8 }}
        primaryCityId="city"
        primaryCityName="City"
      />,
    );
    expect(mocks.rail).not.toHaveBeenCalled();
    intersect(0);
    expect(mocks.rail).toHaveBeenCalledExactlyOnceWith(true, {
      userId: 'reader',
      lat: 47,
      lng: 8,
      sort: 'nearest',
      filters: { radiusKm: 30 },
    });
    intersect(3);
    expect(mocks.rail).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({
        userId: 'reader',
        filters: { cityId: 'city', city: 'City' },
      }),
    );
  });

  it('loads all available rails when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<VenuesRails userLocation={null} primaryCityId={null} primaryCityName={null} />);
    expect(mocks.rail).toHaveBeenCalledTimes(2);
  });
});
