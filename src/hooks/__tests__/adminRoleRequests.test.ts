import { describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ eq: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => ({ eq: api.eq }) }) },
}));
import { loadAdminRoles } from '../adminRoleRequests';

describe('admin role request coalescing', () => {
  it('shares simultaneous reads but queries again after completion so grants stay fresh', async () => {
    let resolve!: (value: { data: never[]; error: null }) => void;
    api.eq.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const first = loadAdminRoles('same-user');
    expect(loadAdminRoles('same-user')).toBe(first);
    expect(api.eq).toHaveBeenCalledTimes(1);
    resolve({ data: [], error: null });
    await first;
    api.eq.mockResolvedValueOnce({ data: [], error: null });
    await loadAdminRoles('same-user');
    expect(api.eq).toHaveBeenCalledTimes(2);
  });
  it('does not share requests across accounts', async () => {
    api.eq.mockClear();
    api.eq.mockResolvedValue({ data: [], error: null });
    await Promise.all([loadAdminRoles('one'), loadAdminRoles('two')]);
    expect(api.eq).toHaveBeenCalledTimes(2);
  });
  it('retries a failed read instead of retaining a rejected promise', async () => {
    api.eq.mockRejectedValueOnce(new Error('offline'));
    await expect(loadAdminRoles('retry')).rejects.toThrow('offline');
    api.eq.mockResolvedValueOnce({ data: [], error: null });
    await expect(loadAdminRoles('retry')).resolves.toEqual({ data: [], error: null });
  });
});
