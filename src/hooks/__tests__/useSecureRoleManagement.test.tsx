import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }), from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }) }) },
}));
import { useSecureRoleManagement } from '../useSecureRoleManagement';
describe('useSecureRoleManagement', () => {
  it('should expose role management functions', () => {
    const { result } = renderHook(() => useSecureRoleManagement());
    expect(typeof result.current.assignRole).toBe('function');
    expect(typeof result.current.removeRole).toBe('function');
    expect(typeof result.current.fetchAuditLogs).toBe('function');
    expect(result.current.loading).toBe(false);
  });
});
