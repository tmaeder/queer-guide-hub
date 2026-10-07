/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// One friendship in each direction plus one where "me" is the target.
const rows = [
  { user_id: 'me', target_user_id: 'f-1' },
  { user_id: 'f-2', target_user_id: 'me' },
  { user_id: 'me', target_user_id: 'f-3' },
];

vi.mock('@/integrations/supabase/client', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    or: () => Promise.resolve({ data: rows, error: null }),
  };
  return { supabase: { from: () => chain } };
});
vi.mock('@/hooks/useConversationPresence', () => ({
  useGlobalPresence: () => new Set(['f-2', 'f-3', 'stranger']),
}));

import { useFriendIds, useFriendsOnlineCount } from '../useFriendIds';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useFriendIds', () => {
  it('returns the other side of each friendship row', async () => {
    const { result } = renderHook(() => useFriendIds('me'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect([...result.current.data!].sort()).toEqual(['f-1', 'f-2', 'f-3']);
  });
});

describe('useFriendsOnlineCount', () => {
  it('counts only friends who are online, ignoring online non-friends', async () => {
    const { result } = renderHook(() => useFriendsOnlineCount('me'), { wrapper });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(2));
  });
});
