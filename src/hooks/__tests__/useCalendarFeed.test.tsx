import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: { url: 'https://cal.test/feed' }, error: null }) } },
}));

import { useCalendarFeed } from '../useCalendarFeed';

describe('useCalendarFeed', () => {
  it('should expose expected methods', () => {
    const { result } = renderHook(() => useCalendarFeed());
    expect(typeof result.current.getCalendarFeedUrl).toBe('function');
    expect(typeof result.current.copyCalendarFeedUrl).toBe('function');
    expect(typeof result.current.downloadCalendarFile).toBe('function');
    expect(result.current.loading).toBe(false);
  });
});
