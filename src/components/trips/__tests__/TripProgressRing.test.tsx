import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import type { TripWithDetails } from '@/hooks/useTrips';
import { TripProgressRing } from '../TripProgressRing';

function makeTrip(overrides: Partial<TripWithDetails> = {}): TripWithDetails {
  return {
    id: 'trip-1',
    owner_id: 'user-1',
    title: 'Test Trip',
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

describe('TripProgressRing', () => {
  describe('Rendering', () => {
    it('renders 0% for an empty trip', () => {
      renderWithProviders(<TripProgressRing trip={makeTrip()} />);
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('%')).toBeInTheDocument();
    });

    it('renders 100% for a fully planned group trip', () => {
      const trip = makeTrip({
        start_date: '2026-05-01',
        end_date: '2026-05-07',
        trip_places: [
          { id: 'p1' } as unknown as TripWithDetails['trip_places'][number],
        ],
        trip_days: [
          { id: 'd1' } as unknown as TripWithDetails['trip_days'][number],
        ],
        trip_members: [
          { id: 'm1' } as unknown as TripWithDetails['trip_members'][number],
          { id: 'm2' } as unknown as TripWithDetails['trip_members'][number],
        ],
      });
      renderWithProviders(<TripProgressRing trip={trip} />);
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('renders 50% when half the checkpoints are done', () => {
      const trip = makeTrip({
        trip_places: [
          { id: 'p1' } as unknown as TripWithDetails['trip_places'][number],
        ],
        trip_days: [
          { id: 'd1' } as unknown as TripWithDetails['trip_days'][number],
        ],
      });
      renderWithProviders(<TripProgressRing trip={trip} />);
      expect(screen.getByText('50')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('exposes the percent via aria-label', () => {
      renderWithProviders(<TripProgressRing trip={makeTrip()} />);
      expect(
        screen.getByRole('img', { name: /0% complete/i }),
      ).toBeInTheDocument();
    });

    it('aria-label updates with progress', () => {
      const trip = makeTrip({
        start_date: '2026-05-01',
        end_date: '2026-05-07',
      });
      renderWithProviders(<TripProgressRing trip={trip} />);
      expect(
        screen.getByRole('img', { name: /25% complete/i }),
      ).toBeInTheDocument();
    });
  });

  describe('Props', () => {
    it('respects a custom size', () => {
      const { container } = renderWithProviders(
        <TripProgressRing trip={makeTrip()} size={120} />,
      );
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('width', '120');
      expect(svg).toHaveAttribute('height', '120');
    });

    it('defaults to size 72 when no size is given', () => {
      const { container } = renderWithProviders(
        <TripProgressRing trip={makeTrip()} />,
      );
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('width', '72');
      expect(svg).toHaveAttribute('height', '72');
    });
  });
});
