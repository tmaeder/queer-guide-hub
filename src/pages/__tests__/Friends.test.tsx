/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useUserRelationships', () => ({
  useUserRelationships: () => ({
    acceptFriendRequest: vi.fn(),
    rejectFriendRequest: vi.fn(),
    removeRelationship: vi.fn(),
    getFriends: () => [],
    getPendingRequests: () => [],
    loading: false,
  }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ fetchProfilesByUserIds: vi.fn().mockResolvedValue([]) }));
vi.mock('@/hooks/useSOS', () => ({ useSOS: () => ({ triggerSOS: vi.fn(), isActive: false }) }));

import Friends from '../Friends';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}>{children}</QueryClientProvider></MemoryRouter>;
}

describe('Friends', () => {
  it('renders without crashing', () => {
    const { container } = render(<Friends />, { wrapper });
    expect(container).toBeTruthy();
  });
});
