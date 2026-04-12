import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => { const h: ProxyHandler<object> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) }; return { supabase: { from: () => new Proxy(() => {}, h), storage: { from: () => new Proxy(() => {}, h) } } }; });
import { useCMSMedia } from '../useCMSMedia';
describe('useCMSMedia', () => { it('should expose media API', () => { const { result } = renderHook(() => useCMSMedia()); expect(result.current.media).toEqual([]); expect(typeof result.current.fetchMedia).toBe('function'); expect(typeof result.current.uploadMedia).toBe('function'); expect(typeof result.current.deleteMedia).toBe('function'); }); });
