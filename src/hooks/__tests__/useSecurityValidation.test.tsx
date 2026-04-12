import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));
import { useSecurityValidation } from '../useSecurityValidation';
describe('useSecurityValidation', () => {
  it('should expose validation functions', () => {
    const { result } = renderHook(() => useSecurityValidation());
    expect(typeof result.current.validateContent).toBe('function');
    expect(typeof result.current.validatePassword).toBe('function');
    expect(typeof result.current.validateFileUpload).toBe('function');
    expect(typeof result.current.checkRateLimit).toBe('function');
    expect(result.current.isValidating).toBe(false);
  });
});
