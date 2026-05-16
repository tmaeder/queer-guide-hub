/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useGroups', () => ({
  useGroups: () => ({
    groups: [], userGroups: [], isLoading: false,
    joinGroup: vi.fn(), isJoining: false,
    requestJoin: vi.fn(), isRequesting: false,
    leaveGroup: vi.fn(), isLeaving: false,
  }),
}));
vi.mock('@/hooks/useGroupPosts', () => ({ useGroupPosts: () => ({ posts: [], isLoading: false }) }));
vi.mock('@/hooks/useGroupEvents', () => ({ useGroupEvents: () => ({ events: [], isLoading: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import GroupDetail from '../GroupDetail';

describe('GroupDetail', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <MemoryRouter initialEntries={['/groups/g1']}>
        <QueryClientProvider client={qc}>
          <Routes><Route path="/groups/:slug" element={<GroupDetail />} /></Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
