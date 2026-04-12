import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => { const h: ProxyHandler<any> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) }; return { supabase: { from: () => new Proxy(() => {}, h), functions: { invoke: vi.fn() } } }; });
import { useContentLinks } from '../useContentLinks';
describe('useContentLinks', () => { it('should start with empty links', () => { const { result } = renderHook(() => useContentLinks()); expect(result.current.links).toEqual([]); expect(result.current.loading).toBe(false); expect(typeof result.current.fetchLinks).toBe('function'); expect(typeof result.current.deleteLink).toBe('function'); }); });
