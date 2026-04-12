import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn() } },
}));

import { useSecureTurnstile } from '../useSecureTurnstile';

describe('useSecureTurnstile', () => {
  it('should not be configured when no user', () => {
    const { result } = renderHook(() => useSecureTurnstile());
    expect(result.current.isConfigured).toBe(false);
    expect(result.current.config).toBeNull();
  });
});
