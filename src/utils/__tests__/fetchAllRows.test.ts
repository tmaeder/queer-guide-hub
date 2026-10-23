import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '../excelExport';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());

function pageSource(total: number, cap: number, counted = true) {
  const data = Array.from({ length: total }, (_, id) => ({ id }));
  const range = vi.fn((start: number, end: number) => {
    const result = {
      data: data.slice(start, Math.min(end + 1, start + cap)),
      error: null,
      count: counted ? total : null,
    };
    const query = {
      order: vi.fn(() => query),
      then: Promise.resolve(result).then.bind(Promise.resolve(result)),
    };
    return query;
  });
  const select = vi.fn(() => ({ range }));
  vi.mocked(supabase.from).mockReturnValue({ select } as never);
  return { range, select };
}

describe('fetchAllRows', () => {
  it.each([1000, 250])('exports all 1001 rows with an API cap of %s', async (cap) => {
    const { range, select } = pageSource(1001, cap);
    const rows = await fetchAllRows<{ id: number }>('unified_tags', '*', { column: 'name' });
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 1001 }, (_, i) => i));
    expect(select).toHaveBeenCalledWith('*', { count: 'exact' });
    expect(range.mock.calls[1][0]).toBe(cap);
  });
  it('continues capped responses until empty if a count is unavailable', async () => {
    const { range } = pageSource(501, 250, false);
    expect(await fetchAllRows('events')).toHaveLength(501);
    expect(range.mock.calls.map((call) => call[0])).toEqual([0, 250, 500, 501]);
  });
  it('handles empty and exact-multiple tables', async () => {
    pageSource(0, 250);
    expect(await fetchAllRows('events')).toEqual([]);
    pageSource(1000, 250);
    expect(await fetchAllRows('events')).toHaveLength(1000);
  });
  it('rejects a failed later page instead of downloading a partial file', async () => {
    const range = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }], count: 2, error: null })
      .mockResolvedValueOnce({ data: null, count: null, error: { message: 'Unavailable' } });
    vi.mocked(supabase.from).mockReturnValue({ select: () => ({ range }) } as never);
    await expect(fetchAllRows('events')).rejects.toThrow('Unavailable');
  });
  it('rejects a premature empty page', async () => {
    const range = vi.fn().mockResolvedValue({ data: [], count: 5, error: null });
    vi.mocked(supabase.from).mockReturnValue({ select: () => ({ range }) } as never);
    await expect(fetchAllRows('events')).rejects.toThrow('fetched 0 of 5');
  });
  it('rejects a changing record count', async () => {
    const range = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }], count: 2, error: null })
      .mockResolvedValueOnce({ data: [{ id: 2 }], count: 3, error: null });
    vi.mocked(supabase.from).mockReturnValue({ select: () => ({ range }) } as never);
    await expect(fetchAllRows('events')).rejects.toThrow('record count changed');
  });
  it.each([0, -1, 0.5])('rejects invalid batch size %s', async (size) => {
    await expect(fetchAllRows('events', '*', undefined, size)).rejects.toThrow('positive integer');
  });
});
