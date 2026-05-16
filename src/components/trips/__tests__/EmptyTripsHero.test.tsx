/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { navigateFn, useDiscoverableTripsMock } = vi.hoisted(() => ({
  navigateFn: vi.fn(),
  useDiscoverableTripsMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigateFn }));
vi.mock('@/hooks/useDiscoverableTrips', () => ({ useDiscoverableTrips: useDiscoverableTripsMock }));
vi.mock('../PublicTripCard', () => ({
  PublicTripCard: (p: { trip: { id: string } }) => <div data-testid="public">{p.trip.id}</div>,
}));
vi.mock('../TripTemplates', () => ({ TripTemplates: () => <div data-testid="templates" /> }));

import { EmptyTripsHero } from '../EmptyTripsHero';

beforeEach(() => {
  navigateFn.mockReset();
  useDiscoverableTripsMock.mockReset();
  useDiscoverableTripsMock.mockReturnValue({ data: [], isLoading: false });
});

describe('EmptyTripsHero', () => {
  it('renders three path cards', () => {
    render(<EmptyTripsHero onCreate={vi.fn()} />);
    expect(screen.getByText(/Start from scratch/i)).toBeInTheDocument();
    expect(screen.getByText(/Use a template/i)).toBeInTheDocument();
    expect(screen.getByText(/Fork a public trip/i)).toBeInTheDocument();
  });

  it('Create trip path fires onCreate', () => {
    const onCreate = vi.fn();
    render(<EmptyTripsHero onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: /Create trip/i }));
    expect(onCreate).toHaveBeenCalled();
  });

  it('Open Discover navigates to /trips/discover', () => {
    render(<EmptyTripsHero onCreate={vi.fn()} />);
    const discoverButtons = screen.getAllByRole('button', { name: /Open Discover/i });
    fireEvent.click(discoverButtons[0]);
    expect(navigateFn).toHaveBeenCalledWith('/trips/discover');
  });

  it('shows preview public trip cards when available', () => {
    useDiscoverableTripsMock.mockReturnValue({
      data: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }],
      isLoading: false,
    });
    render(<EmptyTripsHero onCreate={vi.fn()} />);
    expect(screen.getAllByTestId('public')).toHaveLength(3);
  });

  it('renders TripTemplates section', () => {
    render(<EmptyTripsHero onCreate={vi.fn()} />);
    expect(screen.getByTestId('templates')).toBeInTheDocument();
  });
});
