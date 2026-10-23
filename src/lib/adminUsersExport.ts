/**
 * Export the admin user list to Excel or CSV. Rows come from
 * fetchAdminUsersForExport (the admin_users_list RPC, paged) because a direct
 * `profiles` select only reaches the column allowlist granted to
 * `authenticated`. The columns match the long-standing Excel export.
 */
import { exportToCsv } from '@/utils/csvExport';
import { exportToExcel, generateFilename, type ExportColumnDef } from '@/utils/excelExport';
import { formatDateTime } from '@/lib/format';
import { fetchAdminUsersForExport } from '@/lib/adminUsers';

type Row = Record<string, unknown>;

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export const ADMIN_USER_EXPORT_COLUMNS: ExportColumnDef<Row>[] = [
  { header: 'Display Name', accessor: (r) => text(r.display_name) },
  { header: 'Location', accessor: (r) => text(r.location) },
  { header: 'User Mode', accessor: (r) => text(r.user_mode) },
  {
    header: 'Profile %',
    accessor: (r) =>
      typeof r.profile_completion_percentage === 'number' ? r.profile_completion_percentage : '',
  },
  {
    header: 'Created At',
    accessor: (r) => (r.created_at ? formatDateTime(r.created_at as string) : ''),
  },
  {
    header: 'Last Seen',
    accessor: (r) => (r.last_seen_at ? formatDateTime(r.last_seen_at as string) : ''),
  },
];

export async function exportAdminUsers(format: 'Excel' | 'CSV'): Promise<void> {
  const rows = await fetchAdminUsersForExport();
  const filename = generateFilename('users');
  if (format === 'CSV') {
    exportToCsv(rows, ADMIN_USER_EXPORT_COLUMNS, filename.replace(/\.xlsx$/, '.csv'));
  } else {
    await exportToExcel(rows, ADMIN_USER_EXPORT_COLUMNS, filename);
  }
}
