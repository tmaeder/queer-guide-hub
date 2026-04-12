import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { mockOrder } = vi.hoisted(() => ({ mockOrder: vi.fn() }));

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
    channel: () => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));

import { useNotifications } from '../useNotifications';

describe('useNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
