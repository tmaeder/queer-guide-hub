/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const {
  navigateFn, useAuthMock, useTripMutationsMock, useToastMock, useTemplatesMock,
  createTripMutate, addPlacesBulkMock, toastFn,
} = vi.hoisted(() => ({
  navigateFn: vi.fn(),
  useAuthMock: vi.fn(),
  useTripMutationsMock: vi.fn(),
  useToastMock: vi.fn(),
  useTemplatesMock: vi.fn(),
  createTripMutate: vi.fn(),
  addPlacesBulkMock: vi.fn(),
  toastFn: vi.fn(),
}));

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigateFn }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/useTrips', () => ({ useTripMutations: useTripMutationsMock }));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/hooks/useTripTemplates', () => ({ useTripTemplates: useTemplatesMock }));
vi.mock('@/components/animation/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { TripTemplates } from '../TripTemplates';

beforeEach(() => {
  navigateFn.mockReset();
  useAuthMock.mockReset();
  useTripMutationsMock.mockReset();
  useToastMock.mockReset();
  useTemplatesMock.mockReset();
  createTripMutate.mockReset();
  addPlacesBulkMock.mockReset();
  toastFn.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
  useTripMutationsMock.mockReturnValue({
    createTrip: { mutate: createTripMutate, isPending: false },
    addPlacesBulk: { mutateAsync: addPlacesBulkMock },
  });
  useToastMock.mockReturnValue({ toast: toastFn });
  addPlacesBulkMock.mockResolvedValue(undefined);
});

describe('TripTemplates', () => {
  it('renders skeletons while loading', () => {
    useTemplatesMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<TripTemplates />);
    expect(container.querySelectorAll('[class*="animate-pulse"], [class*="MuiSkeleton"]').length).toBeGreaterThan(0);
  });

  it('renders one card per template', () => {
    useTemplatesMock.mockReturnValue({
      data: [
        { id: '1', title: 'Berlin Pride', cities: 'Berlin', days: 7, currency: 'EUR', cityIds: ['c1'], primaryCityId: 'c1', primaryCountryId: 'k1', coverImageUrl: null, gradient: '#000' },
        { id: '2', title: 'NYC Drag Tour', cities: 'NYC', days: 5, currency: 'USD', cityIds: ['c2'], primaryCityId: 'c2', primaryCountryId: 'k2', coverImageUrl: null, gradient: '#000' },
      ],
      isLoading: false,
    });
    render(<TripTemplates />);
    expect(screen.getByText('Berlin Pride')).toBeInTheDocument();
    expect(screen.getByText('NYC Drag Tour')).toBeInTheDocument();
    // The day count goes through i18n interpolation, which react-i18next does
    // not run in this suite (no i18n instance is initialised in the test setup,
    // so `t` returns its default string verbatim). Assert on the template's own
    // fields instead of on interpolated copy, which is what this test is
    // actually about.
    expect(screen.getAllByRole('button', { name: /use template/i })).toHaveLength(2);
  });

  it('clicking Use Template fires createTrip mutation with template data', () => {
    useTemplatesMock.mockReturnValue({
      data: [{ id: '1', title: 'X', cities: 'X', days: 3, currency: 'EUR', cityIds: ['c1'], primaryCityId: 'c1', primaryCountryId: 'k1', coverImageUrl: null, gradient: '#000' }],
      isLoading: false,
    });
    render(<TripTemplates />);
    fireEvent.click(screen.getAllByRole('button', { name: /Use Template/i })[0]);
    expect(createTripMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'X',
        currency: 'EUR',
        // THE POINT OF THIS ASSERTION. `trips.primary_city_id` and
        // `primary_country_id` are NOT NULL, and this call site sent neither
        // until 2026-08 — so every click raised 23502 and the button had never
        // once worked. The old version of this test asserted only title and
        // currency against a mocked mutation, which is exactly why nothing
        // caught it. Do not relax these two.
        primary_city_id: 'c1',
        primary_country_id: 'k1',
      }),
      expect.any(Object),
    );
  });

  it('seeds trip_places through addPlacesBulk, in template order', async () => {
    useTemplatesMock.mockReturnValue({
      data: [
        {
          id: '1', title: 'X', cities: 'A, B', days: 3, currency: 'EUR',
          cityIds: ['c1', 'c2'], primaryCityId: 'c1', primaryCountryId: 'k1',
          coverImageUrl: null, gradient: '#000',
        },
      ],
      isLoading: false,
    });
    render(<TripTemplates />);
    fireEvent.click(screen.getAllByRole('button', { name: /use template/i })[0]);

    // Drive the mutation's own success path, the way the real hook would.
    const onSuccess = createTripMutate.mock.calls[0][1].onSuccess;
    await onSuccess({ id: 'trip-1' });

    expect(addPlacesBulkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip-1',
        rows: [
          expect.objectContaining({ city_id: 'c1', country_id: 'k1', sort_order: 0 }),
          expect.objectContaining({ city_id: 'c2', country_id: 'k1', sort_order: 1 }),
        ],
      }),
    );
  });
});
