/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null, count: 0 }) }) }),
  },
}));

import { useUniversalCMS } from '../useUniversalCMS';

describe('useUniversalCMS', () => {
  it('returns shape', () => {
    const { result } = renderHook(() => useUniversalCMS());
    expect(result.current).toBeDefined();
  });
});
