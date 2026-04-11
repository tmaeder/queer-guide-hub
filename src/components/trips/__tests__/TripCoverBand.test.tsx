import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import type { TripWithDetails } from '@/hooks/useTrips';
import { TripCoverBand } from '../TripCoverBand';

function makeTrip(overrides: Partial<TripWithDetails> = {}): TripWithDetails {
  return {
    id: 'trip-abc',
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
    trip_members: [],
    trip_days: [],
    trip_places: [],
    ...overrides,
  };
}

describe('TripCoverBand', () => {
  describe('Rendering', () => {
    it('renders the trip title as a heading', () => {
      renderWithProviders(
        <TripCoverBand
          trip={makeTrip()}
          dateRange={null}
          statusLabel="Planning"
        />,
      );
      expect(
        screen.getByRole('heading', { name: /pride week berlin/i }),
      ).toBeInTheDocument();
    });

    it('renders the status label', () => {
      renderWithProviders(
        <TripCoverBand
          trip={makeTrip()}
          dateRange={null}
          statusLabel="In progress"
        />,
      );
      expect(screen.getByText('In progress')).toBeInTheDocument();
    });

    it('renders the date range when provided', () => {
      renderWithProviders(
        <TripCoverBand
          trip={makeTrip()}
          dateRange="Jun 1 – Jun 7, 2026"
          statusLabel="Planning"
        />,
      );
      expect(screen.getByText('Jun 1 – Jun 7, 2026')).toBeInTheDocument();
    });

    it('renders the trip description when set', () => {
      renderWithProviders(
        <TripCoverBand
          trip={makeTrip({ description: 'A week in Berlin for Pride' })}
          dateRange={null}
          statusLabel="Planning"
        />,
      );
      expect(
        screen.getByText(/a week in berlin for pride/i),
      ).toBeInTheDocument();
    });

    it('omits the description block when description is null', () => {
      renderWithProviders(
        <TripCoverBand
          trip={makeTrip({ description: null })}
          dateRange={null}
          statusLabel="Planning"
        />,
      );
      // Only the title heading should be present — no stray body text
      expect(
        screen.queryByText(/week in berlin for pride/i),
      ).not.toBeInTheDocument();
    });
  });

  describe('Cover image', () => {
    it('uses a deterministic gradient when no cover image is set', () => {
      // Render the same trip twice and verify the computed background
      // doesn't change between renders (deterministic hash of trip.id).
      const { container, unmount } = renderWithProviders(
        <TripCoverBand
          trip={makeTrip({ id: 'stable-id' })}
          dateRange={null}
          statusLabel="Planning"
        />,
      );
      const firstBand = container.querySelector('[class*="MuiBox-root"]');
      const firstStyle = firstBand?.getAttribute('style') ?? '';
      unmount();

      const { container: container2 } = renderWithProviders(
        <TripCoverBand
          trip={makeTrip({ id: 'stable-id' })}
          dateRange={null}
          statusLabel="Planning"
        />,
      );
      const secondBand = container2.querySelector('[class*="MuiBox-root"]');
      const secondStyle = secondBand?.getAttribute('style') ?? '';
      expect(secondStyle).toBe(firstStyle);
    });
  });

  describe('Members', () => {
    it('renders an avatar group when the trip has members', () => {
      const trip = makeTrip({
        trip_members: [
          {
            id: 'm1',
            trip_id: 'trip-abc',
            user_id: 'u1',
            role: 'owner',
            invited_at: '2025-01-01T00:00:00Z',
            accepted_at: '2025-01-02T00:00:00Z',
            profiles: { display_name: 'Alice', avatar_url: null },
          },
          {
            id: 'm2',
            trip_id: 'trip-abc',
            user_id: 'u2',
            role: 'editor',
            invited_at: '2025-01-01T00:00:00Z',
            accepted_at: '2025-01-02T00:00:00Z',
            profiles: { display_name: 'Bob', avatar_url: null },
          },
        ],
      });
      renderWithProviders(
        <TripCoverBand
          trip={trip}
          dateRange={null}
          statusLabel="Planning"
        />,
      );
      // Each member avatar falls back to the first letter when no image URL
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('B')).toBeInTheDocument();
    });

    it('does not render the avatar group when there are no members', () => {
      renderWithProviders(
        <TripCoverBand
          trip={makeTrip({ trip_members: [] })}
          dateRange={null}
          statusLabel="Planning"
        />,
      );
      // No avatar group in an empty-members trip
      expect(
        screen.queryByRole('img', { name: /member/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('Actions slot', () => {
    it('renders actions when provided', () => {
      renderWithProviders(
        <TripCoverBand
          trip={makeTrip()}
          dateRange={null}
          statusLabel="Planning"
          actions={<button type="button">Share</button>}
        />,
      );
      expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument();
    });
  });
});
