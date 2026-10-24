import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ rpc: vi.fn(), excel: vi.fn(), csv: vi.fn() }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedRpc: (name: string, args: Record<string, unknown>) => Promise.resolve(m.rpc(name, args)),
}));
vi.mock('@/utils/excelExport', async (load) => ({
  ...(await load<Record<string, unknown>>()),
  exportToExcel: m.excel,
}));
vi.mock('@/utils/csvExport', () => ({ exportToCsv: m.csv }));

import { fetchAllNewsAuthors } from '@/hooks/useNewsAuthorsAdmin';
import { exportNewsAuthors, NEWS_AUTHOR_EXPORT_COLUMNS } from '@/lib/newsAuthorsExport';

const rows = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ author: `A${from + i}`, article_count: i }));

beforeEach(() => vi.clearAllMocks());

describe('fetchAllNewsAuthors', () => {
  it('pages until a short page', async () => {
    m.rpc
      .mockReturnValueOnce({ data: rows(50), error: null })
      .mockReturnValueOnce({ data: rows(50, 50), error: null })
      .mockReturnValueOnce({ data: rows(3, 100), error: null });
    expect(await fetchAllNewsAuthors('al')).toHaveLength(103);
    expect(m.rpc).toHaveBeenCalledTimes(3);
    expect(m.rpc).toHaveBeenNthCalledWith(1, 'admin_news_authors', { p_search: 'al', p_offset: 0 });
    expect(m.rpc.mock.calls[2][1]).toEqual({ p_search: 'al', p_offset: 100 });
  });
  it('ends on an empty page after a full one', async () => {
    m.rpc
      .mockReturnValueOnce({ data: rows(50), error: null })
      .mockReturnValueOnce({ data: [], error: null });
    expect(await fetchAllNewsAuthors('')).toHaveLength(50);
  });
  it('throws on an RPC error instead of exporting a partial list', async () => {
    m.rpc.mockReturnValueOnce({ data: null, error: new Error('denied') });
    await expect(fetchAllNewsAuthors('')).rejects.toThrow('denied');
  });
});

describe('exportNewsAuthors', () => {
  it('writes author and article count in each format', async () => {
    m.rpc.mockReturnValue({ data: rows(2), error: null });
    await exportNewsAuthors('', 'Excel');
    expect(m.excel).toHaveBeenCalledWith(
      rows(2),
      NEWS_AUTHOR_EXPORT_COLUMNS,
      expect.stringMatching(/\.xlsx$/),
    );
    await exportNewsAuthors('', 'CSV');
    expect(m.csv).toHaveBeenCalledWith(
      rows(2),
      NEWS_AUTHOR_EXPORT_COLUMNS,
      expect.stringMatching(/\.csv$/),
    );
    expect(NEWS_AUTHOR_EXPORT_COLUMNS.map((c) => c.header)).toEqual(['Author', 'Articles']);
  });
});
