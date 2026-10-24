import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ rpc: vi.fn(), excel: vi.fn(), csv: vi.fn() }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedSupabase: {
    rpc: (name: string, args: Record<string, unknown>) => ({
      returns: () => Promise.resolve(m.rpc(name, args)),
    }),
  },
}));
vi.mock('@/utils/excelExport', async (load) => ({
  ...(await load<Record<string, unknown>>()),
  exportToExcel: m.excel,
}));
vi.mock('@/utils/csvExport', () => ({ exportToCsv: m.csv }));

import { fetchAllNewsSources } from '@/hooks/useNewsSourcesAdmin';
import { exportNewsSources, NEWS_SOURCE_EXPORT_COLUMNS } from '@/lib/newsSourcesExport';

const rows = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `s${from + i}`, name: `S${from + i}` }));
const filters = { search: 'x', state: 'active', unlinked: true, organizationId: 'org-1' };

beforeEach(() => vi.clearAllMocks());

describe('fetchAllNewsSources', () => {
  it('walks every page with the list filters', async () => {
    m.rpc
      .mockReturnValueOnce({ data: { rows: rows(50), total: 120 }, error: null })
      .mockReturnValueOnce({ data: { rows: rows(50, 50), total: 120 }, error: null })
      .mockReturnValueOnce({ data: { rows: rows(20, 100), total: 120 }, error: null });
    const out = await fetchAllNewsSources(filters);
    expect(out).toHaveLength(120);
    expect(m.rpc).toHaveBeenCalledTimes(3);
    expect(m.rpc).toHaveBeenNthCalledWith(1, 'admin_news_sources_browse', {
      p_search: 'x',
      p_state: 'active',
      p_organization_id: 'org-1',
      p_unlinked: true,
      p_offset: 0,
    });
    expect(m.rpc.mock.calls[2][1].p_offset).toBe(100);
  });
  it('stops at the total when the last page is full', async () => {
    m.rpc.mockReturnValueOnce({ data: { rows: rows(50), total: 50 }, error: null });
    expect(await fetchAllNewsSources(filters)).toHaveLength(50);
    expect(m.rpc).toHaveBeenCalledTimes(1);
  });
  it('throws on an RPC error instead of exporting a partial list', async () => {
    m.rpc.mockReturnValueOnce({ data: null, error: new Error('denied') });
    await expect(fetchAllNewsSources(filters)).rejects.toThrow('denied');
  });
});

describe('exportNewsSources', () => {
  it('writes the fetched rows in each format', async () => {
    m.rpc.mockReturnValue({ data: { rows: rows(2), total: 2 }, error: null });
    await exportNewsSources(filters, 'Excel');
    expect(m.excel).toHaveBeenCalledWith(
      rows(2),
      NEWS_SOURCE_EXPORT_COLUMNS,
      expect.stringMatching(/\.xlsx$/),
    );
    await exportNewsSources(filters, 'CSV');
    expect(m.csv).toHaveBeenCalledWith(
      rows(2),
      NEWS_SOURCE_EXPORT_COLUMNS,
      expect.stringMatching(/\.csv$/),
    );
  });
  it('exports the feed, publisher and health columns', () => {
    const headers = NEWS_SOURCE_EXPORT_COLUMNS.map((c) => c.header);
    expect(headers).toEqual(
      expect.arrayContaining(['Name', 'URL', 'Publisher', 'Active', 'Articles', 'Last Error']),
    );
  });
});
