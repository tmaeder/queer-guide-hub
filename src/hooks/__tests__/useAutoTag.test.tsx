import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => { const h: ProxyHandler<any> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) }; return { supabase: { from: () => new Proxy(() => {}, h), functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } } }; });
import { useAutoTag } from '../useAutoTag';
describe('useAutoTag', () => { it('should expose auto-tag API', () => { const { result } = renderHook(() => useAutoTag()); expect(result.current.loading).toBe(false); expect(typeof result.current.suggestTags).toBe('function'); expect(typeof result.current.applyTags).toBe('function'); expect(typeof result.current.clearSuggestions).toBe('function'); }); });
