import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } } }));
import { useAddressResolver } from '../useAddressResolver';
describe('useAddressResolver', () => {
  it('should expose resolver functions', () => {
    const { result } = renderHook(() => useAddressResolver());
    expect(typeof result.current.resolveAddress).toBe('function');
    expect(typeof result.current.resolveNationality).toBe('function');
    expect(typeof result.current.resolveBirthPlace).toBe('function');
    expect(result.current.resolving).toBe(false);
  });
});
