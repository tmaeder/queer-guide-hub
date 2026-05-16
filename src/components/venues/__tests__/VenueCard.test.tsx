/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useEntityTripStatus', () => ({ useEntityTripStatus: () => ({ data: null }) }));
vi.mock('@/hooks/useVisitedPlaceLookup', () => ({ useVisitedPlaceLookup: () => ({ has: () => false, mark: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useActiveTrip', () => ({ useActiveTrip: () => ({ trip: null, addToTrip: vi.fn(), removeFromTrip: vi.fn(), isInTrip: () => false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { VenueCard } from '../VenueCard';

describe('VenueCard', () => {
  it('renders loading state', () => {
    const { container } = render(<MemoryRouter><VenueCard loading /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
  it('renders venue', () => {
    const { container } = render(
      <MemoryRouter>
        <VenueCard venue={{ id: 'v1', name: 'Bar', slug: 'bar', city: 'X', country: 'Y' } as never} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
