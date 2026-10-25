import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { fetchAdminUsers, fetchAdminUsersForExport } from '../adminUsers';

beforeEach(() => rpc.mockReset());

describe('admin user reads', () => {
  it('propagates permission failures', async () => {
    const error = { message: 'admin role required' };
    rpc.mockResolvedValue({ data: null, error });
    await expect(fetchAdminUsers()).rejects.toEqual(error);
  });

  it('rejects malformed responses instead of showing an empty list', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(fetchAdminUsers()).rejects.toThrow('Invalid user list response');
  });

  it('pages selected exports through the bounded RPC projection', async () => {
    const first = Array.from({ length: 500 }, (_, i) => ({ id: String(i) }));
    rpc.mockResolvedValueOnce({ data: { items: first, total: 501 }, error: null });
    rpc.mockResolvedValueOnce({ data: { items: [{ id: '500' }], total: 501 }, error: null });
    const ids = first.map((row) => row.id).concat('500');
    expect(await fetchAdminUsersForExport(ids)).toHaveLength(501);
    expect(rpc).toHaveBeenNthCalledWith(2, 'admin_users_list', {
      p_ids: ids,
      p_sort: 'display_name',
      p_sort_asc: true,
      p_page: 2,
      p_per_page: 500,
    });
  });

  it('exports every user without forwarding list filters', async () => {
    rpc.mockResolvedValueOnce({
      data: { items: Array.from({ length: 500 }, (_, id) => ({ id })), total: 501 },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: { items: [{ id: 500 }], total: 501 }, error: null });
    expect(await fetchAdminUsersForExport()).toHaveLength(501);
    expect(
      rpc.mock.calls.every(
        ([, args]) => !args.p_search && !args.p_filters && args.p_ids === undefined,
      ),
    ).toBe(true);
  });

  it('rejects a premature empty page rather than returning a partial user export', async () => {
    rpc.mockResolvedValueOnce({ data: { items: [{ id: 1 }], total: 2 }, error: null });
    rpc.mockResolvedValueOnce({ data: { items: [], total: 2 }, error: null });
    await expect(fetchAdminUsersForExport()).rejects.toThrow('Incomplete user export');
  });

  it('never exports all users when selection is empty', async () => {
    expect(await fetchAdminUsersForExport([])).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
