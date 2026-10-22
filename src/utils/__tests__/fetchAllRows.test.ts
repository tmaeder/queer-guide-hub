import { describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '../excelExport';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

describe('fetchAllRows', () => {
  it('continues beyond the API page limit without applying table filters', async () => {
    const pages = [Array.from({ length: 1000 }, (_, id) => ({ id })), [{ id: 1000 }]];
    const order = vi
      .fn()
      .mockImplementation(() => Promise.resolve({ data: pages.shift(), error: null }));
    const range = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ range });
    vi.mocked(supabase.from).mockReturnValue({ select } as never);
    const rows = await fetchAllRows('unified_tags', '*', { column: 'name', ascending: true });
    expect(rows).toHaveLength(1001);
    expect(rows.at(-1)).toEqual({ id: 1000 });
    expect(range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(select.mock.calls).toEqual([['*'], ['*']]);
    expect(order.mock.calls).toEqual([
      ['name', { ascending: true }],
      ['name', { ascending: true }],
    ]);
  });

  it('rejects a failed page instead of returning an incomplete export', async () => {
    const range = vi.fn().mockResolvedValue({ data: null, error: { message: 'Unavailable' } });
    vi.mocked(supabase.from).mockReturnValue({ select: () => ({ range }) } as never);
    await expect(fetchAllRows('unified_tags')).rejects.toThrow('Unavailable');
  });
});
