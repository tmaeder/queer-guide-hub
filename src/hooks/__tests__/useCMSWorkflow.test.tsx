import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => { const h: ProxyHandler<any> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) }; return { supabase: { from: () => new Proxy(() => {}, h) } }; });
import { useCMSWorkflow } from '../useCMSWorkflow';
describe('useCMSWorkflow', () => { it('should expose workflow API', () => { const { result } = renderHook(() => useCMSWorkflow()); expect(typeof result.current.transition).toBe('function'); expect(result.current.isTransitioning).toBe(false); }); });
