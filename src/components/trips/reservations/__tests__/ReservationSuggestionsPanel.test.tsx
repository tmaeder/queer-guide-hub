/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useSuggestionsMock } = vi.hoisted(() => ({ useSuggestionsMock: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@/hooks/useTripReservationSuggestions', () => ({
  useTripReservationSuggestions: useSuggestionsMock,
}));
vi.mock('@/utils/tripTracking', () => ({
  recordSuggestionImpression: vi.fn(),
  recordSuggestionClick: vi.fn(),
}));
vi.mock('@/components/trips/shared/SuggestionCard', () => ({
  SuggestionCard: (p: { title: string }) => <div data-testid="sug">{p.title}</div>,
}));
vi.mock('@/components/layout/PageLoadingState', () => ({
  PageLoadingState: () => <div data-testid="loading" />,
}));

import { ReservationSuggestionsPanel } from '../ReservationSuggestionsPanel';

beforeEach(() => useSuggestionsMock.mockReset());

describe('ReservationSuggestionsPanel', () => {
  it('shows loading state', () => {
    useSuggestionsMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<ReservationSuggestionsPanel tripId="t1" />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('renders nothing when both accommodations and transport empty', () => {
    useSuggestionsMock.mockReturnValue({ data: { accommodations: [], transport: [] }, isLoading: false });
    const { container } = render(<ReservationSuggestionsPanel tripId="t1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders accommodation cards under stay heading', () => {
    useSuggestionsMock.mockReturnValue({
      data: { accommodations: [{ id: 'a1', title: 'Cozy hotel', provider: 'Booking', externalUrl: 'x', rank: 1, listingId: null }], transport: [] },
      isLoading: false,
    });
    render(<ReservationSuggestionsPanel tripId="t1" />);
    expect(screen.getByText(/stayTitle/i)).toBeInTheDocument();
    expect(screen.getByText('Cozy hotel')).toBeInTheDocument();
  });

  it('groups transport by kind', () => {
    useSuggestionsMock.mockReturnValue({
      data: {
        accommodations: [],
        transport: [
          { id: 'f1', kind: 'flight', title: 'BCN→BER', provider: 'Skyscanner', externalUrl: 'x', rank: 1 },
          { id: 'r1', kind: 'rail', title: 'Train', provider: 'Trainline', externalUrl: 'x', rank: 1 },
        ],
      },
      isLoading: false,
    });
    render(<ReservationSuggestionsPanel tripId="t1" />);
    expect(screen.getByText('BCN→BER')).toBeInTheDocument();
    expect(screen.getByText('Train')).toBeInTheDocument();
    expect(screen.getByText(/mode.flight/i)).toBeInTheDocument();
    expect(screen.getByText(/mode.rail/i)).toBeInTheDocument();
  });
});
