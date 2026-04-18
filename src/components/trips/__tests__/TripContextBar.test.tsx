import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { TripListItem } from '@/hooks/useTrips';

const mockUseLocation = vi.fn();
const mockUseActiveTrip = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useLocation: () => mockUseLocation(),
  };
});

vi.mock('@/hooks/useActiveTrip', () => ({
  useActiveTrip: () => mockUseActiveTrip(),
}));

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

describe('TripContextBar', () => {
  it('renders the active trip title and Open trip link', () => {
    mockUseLocation.mockReturnValue({ pathname: '/' });
    mockUseActiveTrip.mockReturnValue({
      activeTrip: baseTrip,
      isDismissed: false,
      dismiss: vi.fn(),
    });
    renderBar();
    expect(screen.getByText('Berlin Pride 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open trip/i })).toHaveAttribute(
      'href',
      '/trips/trip-1',
    );
  });

  it('renders nothing when there is no active trip', () => {
    mockUseLocation.mockReturnValue({ pathname: '/' });
    mockUseActiveTrip.mockReturnValue({
      activeTrip: null,
      isDismissed: false,
      dismiss: vi.fn(),
    });
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

  it.each([['/trips'], ['/trips/abc'], ['/admin/dashboard'], ['/auth'], ['/onboarding/welcome']])(
    'is suppressed on route %s',
    (pathname) => {
      mockUseLocation.mockReturnValue({ pathname });
      mockUseActiveTrip.mockReturnValue({
        activeTrip: baseTrip,
        isDismissed: false,
        dismiss: vi.fn(),
      });
      const { container } = renderBar();
      expect(container).toBeEmptyDOMElement();
    },
  );
});
