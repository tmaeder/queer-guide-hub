import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => {
  const h: ProxyHandler<object> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) };
  return { supabase: { from: () => new Proxy(() => {}, h), rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } };
});
import { useCMS } from '../useCMS';
describe('useCMS', () => {
  it('should start with empty content', () => {
    const { result } = renderHook(() => useCMS());
    expect(Array.isArray(result.current.content)).toBe(true);
    expect(result.current.loading).toBe(true);
  });
  it('should expose CRUD methods', () => {
    const { result } = renderHook(() => useCMS());
    expect(typeof result.current.fetchContent).toBe('function');
  });
});
