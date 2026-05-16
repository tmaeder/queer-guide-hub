/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useTripMutationsMock, removeMutate } = vi.hoisted(() => ({
  useTripMutationsMock: vi.fn(),
  removeMutate: vi.fn(),
}));

vi.mock('@/hooks/useTrips', () => ({ useTripMutations: useTripMutationsMock }));
vi.mock('@/utils/equalityScore', () => ({ getScoreRingColor: () => '#0f0' }));
vi.mock('../AddPlaceDialog', () => ({
  AddPlaceDialog: (p: { open: boolean }) => (p.open ? <div data-testid="dlg" /> : null),
}));

import { ItineraryView } from '../ItineraryView';

beforeEach(() => {
  useTripMutationsMock.mockReset();
  removeMutate.mockReset();
  useTripMutationsMock.mockReturnValue({ removePlace: { mutate: removeMutate } });
});

const day = { id: 'd1', date: '2026-06-01', title: null } as never;

describe('ItineraryView', () => {
  it('shows empty message when no days + no places', () => {
    render(<ItineraryView tripId="t1" days={[]} places={[]} />);
    expect(screen.getByText(/itinerary is empty/i)).toBeInTheDocument();
  });

  it('lists unassigned places above day groups', () => {
    const place = { id: 'p1', day_id: null, custom_name: 'Custom', sort_order: 0 } as never;
    render(<ItineraryView tripId="t1" days={[]} places={[place]} />);
    expect(screen.getByText(/Unassigned Places/i)).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('renders one row per day and the No-places hint when empty', () => {
    render(<ItineraryView tripId="t1" days={[day]} places={[]} />);
    expect(screen.getByText(/No places for this day/i)).toBeInTheDocument();
  });

  it('opens AddPlaceDialog when Add Place clicked', () => {
    render(<ItineraryView tripId="t1" days={[]} places={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Add Place/i }));
    expect(screen.getByTestId('dlg')).toBeInTheDocument();
  });

  it('delete button calls removePlace mutate', () => {
    const place = { id: 'p1', day_id: null, custom_name: 'X', sort_order: 0 } as never;
    render(<ItineraryView tripId="t1" days={[]} places={[place]} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(removeMutate).toHaveBeenCalledWith({ id: 'p1', tripId: 't1' });
  });
});
