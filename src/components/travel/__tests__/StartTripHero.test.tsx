/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useTrips', () => ({ useTripMutations: () => ({ createTrip: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false } }) }));

import { StartTripHero } from '../StartTripHero';

describe('StartTripHero', () => {
  it('renders', () => {
    const { container } = render(<MemoryRouter><StartTripHero /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
