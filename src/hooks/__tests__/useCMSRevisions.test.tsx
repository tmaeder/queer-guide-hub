import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/integrations/supabase/client', () => { const h: ProxyHandler<object> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) }; return { supabase: { from: () => new Proxy(() => {}, h) } }; });
import { useCMSRevisions } from '../useCMSRevisions';
describe('useCMSRevisions', () => { it('should start with empty revisions', () => { const { result } = renderHook(() => useCMSRevisions()); expect(result.current.revisions).toEqual([]); expect(result.current.loading).toBe(false); }); });
