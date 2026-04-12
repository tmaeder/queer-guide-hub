import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => { const h: ProxyHandler<any> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) }; return { supabase: { from: () => new Proxy(() => {}, h), rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } }; });
import { useGeoLink } from '../useGeoLink';
describe('useGeoLink', () => { it('should expose geo-link API', () => { const { result } = renderHook(() => useGeoLink()); expect(typeof result.current.linkSingle).toBe('function'); expect(typeof result.current.batchLink).toBe('function'); expect(typeof result.current.getUnlinkedCounts).toBe('function'); expect(result.current.loading).toBe(false); }); });
