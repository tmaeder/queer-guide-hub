import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => { const h: ProxyHandler<object> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) }; return { supabase: { from: () => new Proxy(() => {}, h) } }; });
import { useUnifiedTags } from '../useUnifiedTags';
describe('useUnifiedTags', () => { it('should start with empty tags', () => { const { result } = renderHook(() => useUnifiedTags()); expect(result.current.tags).toEqual([]); expect(result.current.loading).toBe(true); }); it('should expose CRUD methods', () => { const { result } = renderHook(() => useUnifiedTags()); expect(typeof result.current.createTag).toBe('function'); expect(typeof result.current.deleteTag).toBe('function'); expect(typeof result.current.searchTags).toBe('function'); }); });
