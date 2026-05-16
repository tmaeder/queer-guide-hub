/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useEntityTripStatus', () => ({ useEntityTripStatus: () => ({ data: null }) }));
vi.mock('@/hooks/useVisitedPlaceLookup', () => ({ useVisitedPlaceLookup: () => ({ has: () => false, mark: vi.fn() }) }));
vi.mock('@/hooks/useActiveTrip', () => ({ useActiveTrip: () => ({ trip: null, addToTrip: vi.fn(), removeFromTrip: vi.fn(), isInTrip: () => false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { EventCard } from '../EventCard';

describe('EventCard', () => {
  it('renders loading state', () => {
    const { container } = render(<MemoryRouter><EventCard loading /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
  it('renders event', () => {
    const { container } = render(
      <MemoryRouter>
        <EventCard event={{ id: 'e1', title: 'Pride', slug: 'pride', start_date: '2026-06-01' } as never} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
