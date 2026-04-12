import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/integrations/supabase/client', () => { const h: ProxyHandler<object> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) }; return { supabase: { from: () => new Proxy(() => {}, h) } }; });
import { useCMSComments } from '../useCMSComments';
describe('useCMSComments', () => { it('should expose comments API', () => { const { result } = renderHook(() => useCMSComments()); expect(result.current.comments).toEqual([]); expect(typeof result.current.loadComments).toBe('function'); expect(typeof result.current.addComment).toBe('function'); }); });
