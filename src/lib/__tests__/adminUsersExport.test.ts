import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_USER_EXPORT_COLUMNS, exportAdminUsers } from '../adminUsersExport';
import { fetchAdminUsersForExport } from '@/lib/adminUsers';
import { exportToExcel } from '@/utils/excelExport';
import { exportToCsv } from '@/utils/csvExport';

vi.mock('@/lib/adminUsers', () => ({ fetchAdminUsersForExport: vi.fn() }));
vi.mock('@/utils/excelExport', () => ({
  exportToExcel: vi.fn().mockResolvedValue(undefined),
  generateFilename: () => 'queerguide-users-2026-10-23.xlsx',
}));
vi.mock('@/utils/csvExport', () => ({ exportToCsv: vi.fn() }));

const rows = [
  {
    display_name: 'Ana',
    location: 'Berlin',
    user_mode: 'traveler',
    profile_completion_percentage: 80,
  },
  { display_name: null, location: undefined, user_mode: 'local' },
];

beforeEach(() => {
  vi.mocked(fetchAdminUsersForExport).mockResolvedValue(rows);
});

describe('exportAdminUsers', () => {
  it.each([
    ['Excel', exportToExcel, /\.xlsx$/],
    ['CSV', exportToCsv, /\.csv$/],
  ] as const)('%s exports every user with the same columns', async (format, writer, ext) => {
    vi.mocked(writer).mockClear();
    await exportAdminUsers(format);
    expect(fetchAdminUsersForExport).toHaveBeenCalledWith();
    const [data, columns, filename] = vi.mocked(writer).mock.lastCall!;
    expect(data).toBe(rows);
    expect(columns).toBe(ADMIN_USER_EXPORT_COLUMNS);
    expect(filename).toMatch(ext);
  });

  it('writes blanks, never "null"/"undefined", for missing values', () => {
    const cells = ADMIN_USER_EXPORT_COLUMNS.map((c) => c.accessor(rows[1]));
    expect(cells).toEqual(['', '', 'local', '', '', '']);
  });
});
