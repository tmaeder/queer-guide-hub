/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ events: [], loading: false, error: null, fetchEvents: vi.fn(), totalCount: 0, hasMore: false }) }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/hooks/useVisitorLocation', () => ({ useVisitorLocation: () => ({ location: null }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useActiveTrip', () => ({ useActiveTrip: () => ({ trip: null, setTrip: vi.fn(), addToTrip: vi.fn(), removeFromTrip: vi.fn(), isInTrip: () => false }), ActiveTripProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import Events from '../Events';

describe('Events', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<MemoryRouter><QueryClientProvider client={qc}><Events /></QueryClientProvider></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
