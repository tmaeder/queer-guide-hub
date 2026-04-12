import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/integrations/supabase/client', () => {
  const h: ProxyHandler<any> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) };
  return { supabase: { from: () => new Proxy(() => {}, h), rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } };
});
import { useSearchSuggestions } from '../useSearchSuggestions';
describe('useSearchSuggestions', () => {
  it('should start with empty suggestions', () => {
    const { result } = renderHook(() => useSearchSuggestions(''));
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
