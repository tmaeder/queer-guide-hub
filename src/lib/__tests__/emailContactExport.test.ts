import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportEmailContacts } from '../emailContactExport';
import { supabase } from '@/integrations/supabase/client';
import { exportToExcel } from '@/utils/excelExport';
import { exportToCsv } from '@/utils/csvExport';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/utils/excelExport', () => ({ exportToExcel: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/utils/csvExport', () => ({ exportToCsv: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
describe('all contact exports', () => {
  it.each(['Excel', 'CSV'] as const)(
    'exports all cursor pages as %s from the beginning',
    async (format) => {
      const first = { id: '1', email: 'first@example.com', topics: [] };
      const last = { id: '2', email: 'last@example.com', topics: ['news'] };
      vi.mocked(supabase.functions.invoke)
        .mockResolvedValueOnce({ data: { contacts: [first], next: 'cursor2' }, error: null })
        .mockResolvedValueOnce({ data: { contacts: [last], next: null }, error: null });
      await exportEmailContacts(format);
      expect(supabase.functions.invoke).toHaveBeenNthCalledWith(
        1,
        'email-admin?resource=contacts&format=csv',
        { method: 'GET' },
      );
      expect(supabase.functions.invoke).toHaveBeenNthCalledWith(
        2,
        'email-admin?resource=contacts&format=csv&after=cursor2',
        { method: 'GET' },
      );
      expect(format === 'CSV' ? exportToCsv : exportToExcel).toHaveBeenCalledWith(
        [first, last],
        expect.any(Array),
        expect.any(String),
      );
    },
  );
  it('fails without downloading when a later page fails', async () => {
    vi.mocked(supabase.functions.invoke)
      .mockResolvedValueOnce({ data: { contacts: [{ id: '1' }], next: 'next' }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('offline') } as never);
    await expect(exportEmailContacts('CSV')).rejects.toThrow();
    expect(exportToCsv).not.toHaveBeenCalled();
  });
  it('rejects repeated cursors rather than hanging or duplicating rows', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { contacts: [{ id: '1' }], next: 'same' },
      error: null,
    });
    await expect(exportEmailContacts('CSV')).rejects.toThrow('did not advance');
    expect(exportToCsv).not.toHaveBeenCalled();
  });
  it.each([undefined, ''])('rejects an invalid terminal cursor %s', async (next) => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { contacts: [{ id: '1' }], next },
      error: null,
    });
    await expect(exportEmailContacts('CSV')).rejects.toThrow('did not advance');
    expect(exportToCsv).not.toHaveBeenCalled();
  });
  it('rejects duplicate contacts between pages', async () => {
    vi.mocked(supabase.functions.invoke)
      .mockResolvedValueOnce({ data: { contacts: [{ id: '1' }], next: 'cursor2' }, error: null })
      .mockResolvedValueOnce({ data: { contacts: [{ id: '1' }], next: null }, error: null });
    await expect(exportEmailContacts('CSV')).rejects.toThrow('Duplicate contacts');
    expect(exportToCsv).not.toHaveBeenCalled();
  });
});
