import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => { const h: ProxyHandler<any> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) }; return { supabase: { from: () => new Proxy(() => {}, h), functions: { invoke: vi.fn().mockResolvedValue({ data: { keys: [] }, error: null }) } } }; });
import { useApiKeys } from '../useApiKeys';
describe('useApiKeys', () => { it('should start loading', () => { const { result } = renderHook(() => useApiKeys()); expect(result.current.loading).toBe(true); expect(Array.isArray(result.current.keys)).toBe(true); }); });
