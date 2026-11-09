import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import type { TripWithDetails } from '@/hooks/useTrips';
import { TripWorkspaceHero } from '../TripWorkspaceHero';

function makeTrip(overrides: Partial<TripWithDetails> = {}): TripWithDetails {
  return {
    id: 'trip-42',
    owner_id: 'user-1',
    title: 'Berlin after dark',
    description: null,
    cover_image_url: null,
    start_date: '2026-06-01',
    end_date: '2026-06-05',
    currency: 'EUR',
    status: 'planning',
    is_public: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    primary_city_id: 'berlin',
    primary_country_id: 'de',
    primary_city_name: 'Berlin',
    primary_country_code: 'DE',
    timezone: 'Europe/Berlin',
    trip_members: [],
    trip_days: [],
    trip_places: [],
    ...overrides,
  };
}

describe('TripWorkspaceHero', () => {
  it('leads with trip identity and useful context', () => {
    renderWithProviders(
      <TripWorkspaceHero
        trip={makeTrip()}
        dateRange="Jun 1 – Jun 5, 2026 · 5 days"
        statusLabel="Planning"
      />,
    );
    expect(screen.getByRole('heading', { name: 'Berlin after dark' })).toBeInTheDocument();
    expect(screen.getAllByText('Berlin')).toHaveLength(2);
    expect(screen.getByText(/Jun 1 – Jun 5/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /choose a place to stay/i })).toBeInTheDocument();
  });

  it('uses a saved event photo when the trip has no explicit cover', () => {
    const { container } = renderWithProviders(
      <TripWorkspaceHero
        trip={makeTrip({
          trip_places: [
            {
              id: 'place-1',
              events: { images: ['https://images.example/berlin.jpg'] },
            } as TripWithDetails['trip_places'][number],
          ],
        })}
        dateRange={null}
        statusLabel="Planning"
      />,
    );
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://images.example/berlin.jpg',
    );
  });
});
