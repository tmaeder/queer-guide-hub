import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
const state = vi.hoisted(() => ({
  flags: { isAdmin: true, isModerator: false, isEditor: false, loading: false },
  from: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => state.flags }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.from } }));
import { useGranularRoles } from '../useGranularRoles';
beforeEach(() => {
  state.from.mockClear();
  state.flags = { isAdmin: true, isModerator: false, isEditor: false, loading: false };
  state.from.mockReturnValue({ select: () => ({ eq: state.eq }) });
  state.eq.mockResolvedValue({
    data: [{ id: 'p', user_id: 'u-1', content_type: 'venues', permissions: ['publish'] }],
  });
});
describe('staff readiness', () => {
  it('does not wait for irrelevant granular reads for a verified admin', () => {
    const { result } = renderHook(() => useGranularRoles());
    expect(result.current.loading).toBe(false);
    expect(result.current.effectiveRole).toBe('admin');
    expect(state.from).not.toHaveBeenCalled();
  });
  it('keeps moderator permissions and does not fetch granular grants', () => {
    state.flags.isAdmin = false;
    state.flags.isModerator = true;
    const { result } = renderHook(() => useGranularRoles());
    expect(result.current.loading).toBe(false);
    expect(result.current.can('delete', 'venues')).toBe(false);
    expect(state.from).not.toHaveBeenCalled();
  });
  it('still fetches and honors editor-specific grants', async () => {
    state.flags.isAdmin = false;
    state.flags.isEditor = true;
    const { result } = renderHook(() => useGranularRoles());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(state.from).toHaveBeenCalledWith('user_role_permissions');
    expect(result.current.can('publish', 'venues')).toBe(true);
  });
});
