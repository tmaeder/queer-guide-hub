/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useDiscoverableTrips', () => ({
  useDiscoverableTrips: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import TripsDiscoverPage from '../TripsDiscoverPage';

describe('TripsDiscoverPage', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><TripsDiscoverPage /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
