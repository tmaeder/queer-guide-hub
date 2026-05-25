/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, loading: false, hasPasskey: false,
    signUp: vi.fn(), signIn: vi.fn(), signInWithOAuth: vi.fn(), resendVerification: vi.fn(),
    resetPassword: vi.fn(), signOut: vi.fn(), enrollPasskey: vi.fn(), signInWithPasskey: vi.fn() }),
}));
vi.mock('@/hooks/useVenues', () => ({ useVenues: () => ({ venues: [], loading: false, error: null, hasMore: false, datasetTotal: 0, filteredTotal: 0, fetchVenues: vi.fn(), loadingTimedOut: false }) }));
vi.mock('@/hooks/useRecentVenues', () => ({ useRecentVenues: () => ({ venues: [], loading: false }) }));
vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ events: [], loading: false, fetchEvents: vi.fn() }) }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));

import Venues from '../Venues';

describe('Venues', () => {
  it('renders without crashing', () => {
    const { container } = renderWithProviders(<Venues />);
    expect(container).toBeTruthy();
  });
});
