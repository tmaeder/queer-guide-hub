import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  formatDateTime,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import { AdminDataTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { ArrowLeft, Eye, MapPin } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface UserRow {
  id: string;
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  location: string | null;
  user_mode: string | null;
  is_online: boolean | null;
  profile_completion_percentage: number | null;
  created_at: string;
  last_seen_at: string | null;
}

const columnHelper = createColumnHelper<UserRow>();

export default function AdminUsers() {
  const navigate = useNavigate();
  const { isAdmin } = useAdminRoles();

  const columns = useMemo(
    () => [
      columnHelper.accessor('display_name', {
        header: 'User',
        cell: (info) => {
          const row = info.row.original;
          const name = info.getValue() || row.first_name || row.last_name || 'Anonymous';
          return (
            <Box>
              <Box sx={{ fontWeight: 500 }}>{name}</Box>
              {row.email && (
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                  {row.email}
                </Typography>
              )}
              {row.user_mode && (
                <Typography variant="caption" color="text.secondary">
                  {row.user_mode}
                </Typography>
              )}
            </Box>
          );
        },
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('is_online', {
        header: 'Status',
        cell: (info) => (
          <Badge variant={info.getValue() ? 'default' : 'secondary'}>
            {info.getValue() ? 'Active' : 'Inactive'}
          </Badge>
        ),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('location', {
        header: 'Location',
        cell: (info) => {
          const val = info.getValue();
          return val ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <MapPin style={{ height: 12, width: 12 }} />
              {val}
            </Box>
          ) : (
            '-'
          );
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('user_mode', {
        header: 'Mode',
        cell: (info) =>
          info.getValue() ? <Badge variant="outline">{info.getValue()}</Badge> : '-',
        meta: { serverSortable: true, groupable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('profile_completion_percentage', {
        header: 'Profile %',
        cell: (info) => {
          const val = info.getValue();
          return val != null ? `${val}%` : '-';
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('created_at', {
        header: 'Joined',
        cell: (info) => new Date(info.getValue()).toLocaleDateString(),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('last_seen_at', {
        header: 'Last Seen',
        cell: (info) => {
          const val = info.getValue();
          if (!val) return 'Never';
          const d = new Date(val);
          const diff = Date.now() - d.getTime();
          const hours = Math.floor(diff / 3600000);
          if (hours < 1) return 'Just now';
          if (hours < 24) return `${hours}h ago`;
          return `${Math.floor(hours / 24)}d ago`;
        },
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
    ],
    [],
  );

  const tableConfig: AdminTableConfig<UserRow> = useMemo(
    () => ({
      tableName: 'profiles',
      select:
        'id,user_id,display_name,first_name,last_name,email,location,user_mode,is_online,profile_completion_percentage,created_at,last_seen_at',
      columns,
      defaultSort: { column: 'created_at', direction: 'desc' as const },
      defaultPageSize: 25,
      enableSelection: false,
      enableSearch: true,
      searchColumns: ['display_name', 'email', 'first_name', 'last_name'],
      entityFilters: [{ key: 'is_online', label: 'Online', type: 'boolean', column: 'is_online' }],
      rowActions: [
        {
          key: 'view',
          label: 'View Profile',
          icon: Eye,
          onClick: (row) => navigate(`/profile/${row.user_id}`),
        },
      ],
      toolbarActions: (
        <ExportExcelButton
          onExport={async () => {
            const cols: ExportColumnDef<any>[] = [
              { header: 'Display Name', accessor: (r) => r.display_name },
              { header: 'Email', accessor: (r) => r.email },
              { header: 'Location', accessor: (r) => r.location },
              { header: 'User Mode', accessor: (r) => r.user_mode },
              { header: 'Profile %', accessor: (r) => r.profile_completion_percentage },
              { header: 'Created At', accessor: (r) => formatDateTime(r.created_at) },
              { header: 'Last Seen', accessor: (r) => formatDateTime(r.last_seen_at) },
            ];
            const allData = await fetchAllRows('profiles', '*', {
              column: 'display_name',
              ascending: true,
            });
            await exportToExcel(allData, cols, generateFilename('users'));
          }}
        />
      ),
    }),
    [columns],
  );

  return (
    <Box
      sx={{ maxWidth: 'lg', mx: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <ArrowLeft style={{ height: 16, width: 16 }} /> Back to Admin
        </Button>
        <div>
          <Typography variant="h4" component="h1" sx={{ fontSize: '1.875rem', fontWeight: 700 }}>
            Users
          </Typography>
          <p style={{ color: 'var(--muted-foreground)' }}>Manage user accounts and permissions</p>
        </div>
      </Box>

      <AdminDataTable config={tableConfig} />
    </Box>
  );
}
