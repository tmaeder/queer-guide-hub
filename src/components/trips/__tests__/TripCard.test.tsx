import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithProviders, screen } from '@/test/test-utils';
import type { Trip, TripMember } from '@/hooks/useTrips';

// Hoisted mocks so the component's import graph picks them up before the
// real modules load. Supabase client is the main concern — it reads env
// at import time and blows up in tests without env config.
const navigateSpy = vi.fn();
const deleteMutateSpy = vi.fn();
const toastSpy = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>(
    'react-router',
  );
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && typeof opts.count === 'number') {
        return `${key}:${opts.count}`;
      }
      if (opts && typeof opts.title === 'string') {
        return `${key}:${opts.title}`;
      }
      return key;
    },
  }),
}));

vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({
    deleteTrip: {
      mutate: deleteMutateSpy,
      isPending: false,
    },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import { TripCard } from '../TripCard';

type TripProp = Parameters<typeof TripCard>[0]['trip'];

function makeTrip(overrides: Partial<TripProp> = {}): TripProp {
  const base: Trip = {
    id: 'trip-1',
    owner_id: 'user-1',
    title: 'Pride Week Berlin',
    description: null,
    cover_image_url: null,
    start_date: null,
    end_date: null,
    currency: 'EUR',
    status: 'planning',
    is_public: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };
  return {
    ...base,
    member_count: 1,
    place_count: 0,
    day_count: 0,
    trip_members: [],
    ...overrides,
  };
}

describe('TripCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the trip title', () => {
      renderWithProviders(<TripCard trip={makeTrip()} />);
      expect(screen.getByText('Pride Week Berlin')).toBeInTheDocument();
    });

    it('renders the planning status badge by default', () => {
      renderWithProviders(<TripCard trip={makeTrip({ status: 'planning' })} />);
      expect(screen.getByText('trips.status.planning')).toBeInTheDocument();
    });

    it('renders the active status badge', () => {
      renderWithProviders(<TripCard trip={makeTrip({ status: 'active' })} />);
      expect(screen.getByText('trips.status.active')).toBeInTheDocument();
    });

    it('renders the completed status badge', () => {
      renderWithProviders(
        <TripCard trip={makeTrip({ status: 'completed' })} />,
      );
      expect(screen.getByText('trips.status.completed')).toBeInTheDocument();
    });

    it('renders the archived status badge', () => {
      renderWithProviders(
        <TripCard trip={makeTrip({ status: 'archived' })} />,
      );
      expect(screen.getByText('trips.status.archived')).toBeInTheDocument();
    });
  });

  describe('Dates', () => {
    it('shows a formatted date range when both dates are set', () => {
      renderWithProviders(
        <TripCard
          trip={makeTrip({
            start_date: '2026-06-20',
            end_date: '2026-06-27',
          })}
        />,
      );
      // Date formatting is locale-stable via date-fns; assert the month tokens
      expect(screen.getByText(/Jun 20/)).toBeInTheDocument();
      expect(screen.getByText(/Jun 27/)).toBeInTheDocument();
    });

    it('shows "from date" when only a start date is set', () => {
      renderWithProviders(
        <TripCard trip={makeTrip({ start_date: '2026-06-20' })} />,
      );
      expect(screen.getByText(/trips\.card\.fromDate/)).toBeInTheDocument();
    });

    it('shows the no-dates label when neither date is set', () => {
      renderWithProviders(<TripCard trip={makeTrip()} />);
      expect(screen.getByText('trips.card.noDates')).toBeInTheDocument();
    });
  });

  describe('Counts pill', () => {
    it('renders the place/day counts pill when counts are non-zero', () => {
      renderWithProviders(
        <TripCard trip={makeTrip({ place_count: 5, day_count: 4 })} />,
      );
      expect(
        screen.getByText(/trips\.card\.placeCount:5/),
      ).toBeInTheDocument();
    });

    it('hides the counts pill when both counts are zero', () => {
      renderWithProviders(
        <TripCard trip={makeTrip({ place_count: 0, day_count: 0 })} />,
      );
      expect(
        screen.queryByText(/trips\.card\.placeCount/),
      ).not.toBeInTheDocument();
    });
  });

  describe('Members', () => {
    it('renders member avatars when the trip has >1 members', () => {
      const members: TripMember[] = [
        {
          id: 'm1',
          trip_id: 'trip-1',
          user_id: 'u1',
          role: 'owner',
          invited_at: '2025-01-01T00:00:00Z',
          accepted_at: '2025-01-02T00:00:00Z',
          profiles: { display_name: 'Alice', avatar_url: null },
        },
        {
          id: 'm2',
          trip_id: 'trip-1',
          user_id: 'u2',
          role: 'editor',
          invited_at: '2025-01-01T00:00:00Z',
          accepted_at: '2025-01-02T00:00:00Z',
          profiles: { display_name: 'Bob', avatar_url: null },
        },
      ];
      renderWithProviders(
        <TripCard
          trip={makeTrip({ member_count: 2, trip_members: members })}
        />,
      );
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('B')).toBeInTheDocument();
    });

    it('shows member count text when no avatar details are available', () => {
      renderWithProviders(
        <TripCard trip={makeTrip({ member_count: 3, trip_members: [] })} />,
      );
      expect(
        screen.getByText(/trips\.card\.memberCount:3/),
      ).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('navigates to the trip detail when the card is clicked', () => {
      renderWithProviders(<TripCard trip={makeTrip({ id: 'trip-42' })} />);
      fireEvent.click(
        screen.getByRole('link', { name: /trips\.card\.ariaLabel/ }),
      );
      expect(navigateSpy.mock.calls[0][0]).toBe('/trips/trip-42');
    });

    it('navigates on Enter key press', () => {
      renderWithProviders(<TripCard trip={makeTrip({ id: 'trip-42' })} />);
      const card = screen.getByRole('link', { name: /trips\.card\.ariaLabel/ });
      fireEvent.keyDown(card, { key: 'Enter' });
      expect(navigateSpy.mock.calls[0][0]).toBe('/trips/trip-42');
    });

    it('navigates on Space key press', () => {
      renderWithProviders(<TripCard trip={makeTrip({ id: 'trip-42' })} />);
      const card = screen.getByRole('link', { name: /trips\.card\.ariaLabel/ });
      fireEvent.keyDown(card, { key: ' ' });
      expect(navigateSpy.mock.calls[0][0]).toBe('/trips/trip-42');
    });

    it('does not navigate on other keys', () => {
      renderWithProviders(<TripCard trip={makeTrip()} />);
      const card = screen.getByRole('link', { name: /trips\.card\.ariaLabel/ });
      fireEvent.keyDown(card, { key: 'Tab' });
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('is keyboard-focusable (tabIndex=0)', () => {
      renderWithProviders(<TripCard trip={makeTrip()} />);
      const card = screen.getByRole('link', { name: /trips\.card\.ariaLabel/ });
      expect(card).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Menu', () => {
    it('does not navigate when the menu button is clicked', () => {
      renderWithProviders(<TripCard trip={makeTrip()} />);
      fireEvent.click(
        screen.getByRole('button', { name: /trips\.card\.menuAria/ }),
      );
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('opens the delete confirm dialog from the menu', () => {
      renderWithProviders(<TripCard trip={makeTrip()} />);
      fireEvent.click(
        screen.getByRole('button', { name: /trips\.card\.menuAria/ }),
      );
      fireEvent.click(screen.getByText('trips.card.delete'));
      // The delete confirm description is unique to the open dialog state
      expect(
        screen.getByText(/trips\.card\.deleteConfirm/),
      ).toBeInTheDocument();
    });

    it('fires deleteTrip.mutate when the user confirms deletion', () => {
      renderWithProviders(<TripCard trip={makeTrip({ id: 'trip-42' })} />);
      fireEvent.click(
        screen.getByRole('button', { name: /trips\.card\.menuAria/ }),
      );
      fireEvent.click(screen.getByText('trips.card.delete'));

      // After the confirm dialog opens, there are two "trips.card.delete" nodes:
      // the menu item (background, aria-hidden) and the confirm button (foreground).
      // Pick the one inside the element whose sibling contains the deleteConfirm text.
      const deleteNodes = screen.getAllByText('trips.card.delete');
      // The confirm button in the dialog is rendered inside an element whose
      // nearest form/dialog-descendant contains the deleteConfirm description.
      const confirm = deleteNodes.find((node) => {
        const dialogRoot = node.closest('[role="dialog"]');
        return dialogRoot !== null;
      });
      expect(confirm).toBeTruthy();
      fireEvent.click(confirm!);
      expect(deleteMutateSpy).toHaveBeenCalledWith(
        'trip-42',
        expect.any(Object),
      );
    });
  });
});
