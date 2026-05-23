import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { mockOrder, channelNames } = vi.hoisted(() => ({
  mockOrder: vi.fn(),
  channelNames: [] as string[],
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: mockOrder,
          }),
          is: () => ({
            select: () => mockOrder,
          }),
        }),
      }),
      update: () => ({
        eq: () => ({
          is: () => mockOrder,
        }),
      }),
    }),
    channel: (name: string) => {
      channelNames.push(name);
      return {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(),
      };
    },
    removeChannel: vi.fn(),
  },
}));

import { useNotifications } from '../useNotifications';

describe('useNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channelNames.length = 0;
    mockOrder.mockResolvedValue({ data: [], error: null, count: 0 });
  });

  it('should start loading', () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current.loading).toBe(true);
  });

  it('should expose expected API', () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current).toHaveProperty('notifications');
    expect(result.current).toHaveProperty('unreadCount');
    expect(typeof result.current.markAsRead).toBe('function');
    expect(typeof result.current.markAllAsRead).toBe('function');
  });

  it('should start with 0 unread count', () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current.unreadCount).toBe(0);
  });

  // D2 regression: two simultaneous consumers (e.g. Header + NotificationBell)
  // must NOT share a channel topic — a shared topic returns the same
  // already-subscribed channel from the realtime client, and the second
  // `.on('postgres_changes', …)` would throw at runtime.
  it('uses a unique realtime channel name per hook instance', () => {
    renderHook(() => useNotifications());
    renderHook(() => useNotifications());
    expect(channelNames).toHaveLength(2);
    expect(channelNames[0]).not.toBe(channelNames[1]);
    expect(channelNames[0]).toMatch(/^notifications-changes:user-1:/);
    expect(channelNames[1]).toMatch(/^notifications-changes:user-1:/);
  });
});
