import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => { const h: ProxyHandler<object> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) }; return { supabase: { from: () => new Proxy(() => {}, h) } }; });
import { useReviewBulkActions } from '../useReviewBulkActions';
describe('useReviewBulkActions', () => { it('should expose bulk action API', () => { const { result } = renderHook(() => useReviewBulkActions('venues')); expect(result.current.bulkDialogOpen).toBe(false); expect(result.current.bulkRunning).toBe(false); expect(typeof result.current.openBulkDialog).toBe('function'); expect(typeof result.current.handleBulkExecute).toBe('function'); }); });
