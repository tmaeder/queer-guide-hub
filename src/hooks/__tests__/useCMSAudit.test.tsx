import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/integrations/supabase/client', () => { const h: ProxyHandler<any> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) }; return { supabase: { from: () => new Proxy(() => {}, h) } }; });
import { useCMSAudit } from '../useCMSAudit';
describe('useCMSAudit', () => { it('should expose audit API', () => { const { result } = renderHook(() => useCMSAudit()); expect(result.current.entries).toEqual([]); expect(typeof result.current.loadForContent).toBe('function'); expect(typeof result.current.writeEntry).toBe('function'); }); });
