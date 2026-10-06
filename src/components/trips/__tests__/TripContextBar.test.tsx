import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { TripListItem } from '@/hooks/useTrips';

const mockUseLocation = vi.fn();
const mockUseActiveTrip = vi.fn();
const mockUseTrip = vi.fn();
const mockIsMobile = vi.fn(() => false);

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useLocation: () => mockUseLocation() };
});

vi.mock('@/hooks/useActiveTrip', () => ({
  useActiveTrip: () => ({
    dockOpen: false,
    openDock: vi.fn(),
    closeDock: vi.fn(),
    ...mockUseActiveTrip(),
  }),
}));
vi.mock('@/hooks/useTrips', () => ({
  useTrip: (id?: string) => mockUseTrip(id),
}));
vi.mock('@/hooks/useTripReservations', () => ({
  useTripReservations: () => ({ data: [] }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mockIsMobile() }));

import { TripContextBar } from '../TripContextBar';

const baseTrip: TripListItem = {
  id: 'trip-1',
  owner_id: 'u-1',
  title: 'Berlin Pride 2026',
  description: null,
  cover_image_url: null,
  start_date: '2099-06-01',
  end_date: '2099-06-08',
  currency: 'EUR',
  status: 'planning',
  is_public: false,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  primary_city_id: null,
  primary_country_id: null,
  primary_city_name: null,
  primary_country_code: null,
  timezone: null,
  member_count: 1,
  place_count: 0,
  day_count: 0,
  min_equality_score: null,
};

function renderBar() {
  return render(
    <MemoryRouter>
      <TripContextBar />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  mockUseTrip.mockReset();
});

describe('TripContextBar', () => {
  beforeEach(() => {
    mockIsMobile.mockReturnValue(false);
    mockUseTrip.mockImplementation((id?: string) => ({
      data: id ? { ...baseTrip, trip_members: [], trip_days: [], trip_places: [] } : undefined,
      isLoading: false,
    }));
  });

  it('renders the active trip title and Open trip link', { timeout: 30000 }, () => {
    mockUseLocation.mockReturnValue({ pathname: '/' });
    mockUseActiveTrip.mockReturnValue({
      activeTrip: baseTrip,
      isDismissed: false,
      dismiss: vi.fn(),
      dockOpen: true,
    });
    renderBar();
    expect(screen.getAllByText('Berlin Pride 2026')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /open trip/i })).toHaveAttribute(
      'href',
      '/trips/trip-1',
    );
  });

  it('renders nothing when there is no active trip', () => {
    mockUseLocation.mockReturnValue({ pathname: '/' });
    mockUseActiveTrip.mockReturnValue({ activeTrip: null, isDismissed: false, dismiss: vi.fn() });
    const { container } = renderBar();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when dismissed', () => {
    mockUseLocation.mockReturnValue({ pathname: '/' });
    mockUseActiveTrip.mockReturnValue({
      activeTrip: baseTrip,
      isDismissed: true,
      dismiss: vi.fn(),
    });
    const { container } = renderBar();
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['/trips'],
    ['/trips/abc'],
    ['/admin/dashboard'],
    ['/auth'],
    ['/onboarding/welcome'],
    ['/settings'],
    ['/account/billing'],
    ['/checkout'],
    ['/legal/terms'],
  ])('is suppressed on route %s', (pathname) => {
    mockUseLocation.mockReturnValue({ pathname });
    mockUseActiveTrip.mockReturnValue({
      activeTrip: baseTrip,
      isDismissed: false,
      dismiss: vi.fn(),
    });
    const { container } = renderBar();
    expect(container).toBeEmptyDOMElement();
  });

  it('clicking the dismiss button calls dismiss()', { timeout: 30000 }, () => {
    mockUseLocation.mockReturnValue({ pathname: '/' });
    const dismiss = vi.fn();
    mockUseActiveTrip.mockReturnValue({ activeTrip: baseTrip, isDismissed: false, dismiss });
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('does not request trip details until the dock opens', () => {
    mockUseLocation.mockReturnValue({ pathname: '/' });
    mockUseActiveTrip.mockReturnValue({
      activeTrip: baseTrip,
      isDismissed: false,
      dismiss: vi.fn(),
      dockOpen: false,
    });
    renderBar();
    expect(mockUseTrip).toHaveBeenCalledWith(undefined);
    expect(mockUseTrip).not.toHaveBeenCalledWith('trip-1');
  });

  it('uses a bottom sheet with mobile safe-area padding', () => {
    mockIsMobile.mockReturnValue(true);
    mockUseLocation.mockReturnValue({ pathname: '/' });
    mockUseActiveTrip.mockReturnValue({
      activeTrip: baseTrip,
      isDismissed: false,
      dismiss: vi.fn(),
      dockOpen: true,
    });
    renderBar();
    expect(document.getElementById('active-trip-dock')).toHaveClass(
      'pb-[calc(1.5rem+env(safe-area-inset-bottom))]',
    );
  });

  it('renders nothing when VITE_TRIP_CONTEXT_BAR kill-switch is "off"', () => {
    vi.stubEnv('VITE_TRIP_CONTEXT_BAR', 'off');
    mockUseLocation.mockReturnValue({ pathname: '/' });
    mockUseActiveTrip.mockReturnValue({
      activeTrip: baseTrip,
      isDismissed: false,
      dismiss: vi.fn(),
    });
    const { container } = renderBar();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the trip title looks malformed (starts with "<")', () => {
    mockUseLocation.mockReturnValue({ pathname: '/' });
    mockUseActiveTrip.mockReturnValue({
      activeTrip: { ...baseTrip, title: "<script>alert('XSS')</script>" },
      isDismissed: false,
      dismiss: vi.fn(),
    });
    const { container } = renderBar();
    expect(container).toBeEmptyDOMElement();
  });
});
