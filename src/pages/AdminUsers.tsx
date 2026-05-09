import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useUserRoles } from '@/hooks/useUserRoles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  formatDateTime,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import { AdminEntityTable } from '@/components/admin/data-table/AdminEntityTable';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { Eye, ExternalLink, MapPin, Shield, UserPlus } from 'lucide-react';
import { UserStatsCards } from '@/components/admin/users/UserStatsCards';
import { UserDetailSheet } from '@/components/admin/users/UserDetailSheet';
import { CreateUserDialog } from '@/components/admin/users/CreateUserDialog';

interface UserRow {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  location: string | null;
  user_mode: string | null;
  is_online: boolean | null;
  moderation_status: string;
  profile_completion_percentage: number | null;
  pronouns: string | null;
  created_at: string;
  last_seen_at: string | null;
  _roles?: string[];
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#ef4444',
  moderator: '#f97316',
  editor: '#3b82f6',
  contributor: 'hsl(var(--foreground))',
};

const columnHelper = createColumnHelper<UserRow>();

export default function AdminUsers() {
  const navigate = useNavigate();
  const { isAdmin } = useAdminRoles();
  const { data: _roleMap } = useUserRoles();
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [_tableKey, setTableKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const columns = useMemo(
    () => [
      columnHelper.accessor('display_name', {
        header: 'User',
        cell: (info) => {
          const row = info.row.original;
          const name =
            info.getValue() || row.first_name || row.last_name || row.email || 'Anonymous';
          return (
            <div className="flex items-center gap-3">
              <Avatar style={{ width: 32, height: 32, flexShrink: 0 }}>
                <AvatarImage src={row.avatar_url ?? undefined} alt={name} />
                <AvatarFallback style={{ fontSize: '0.75rem' }}>
                  {name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {name}
                </div>
                {row.email && (
                  <span
                    className="block text-xs text-muted-foreground"
                    style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {row.email}
                  </span>
                )}
                {row.pronouns && (
                  <span className="text-xs text-muted-foreground">
                    {row.pronouns}
                  </span>
                )}
              </div>
            </div>
          );
        },
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('email', {
        header: 'Email',
        cell: (info) => info.getValue() || '-',
        meta: {
          serverSortable: true,
          hideable: true,
          defaultVisible: false,
        } satisfies AdminColumnMeta,
      }),
      columnHelper.display({
        id: 'role',
        header: 'Role',
        cell: (info) => {
          const roles = info.row.original._roles;
          if (!roles || roles.length === 0)
            return (
              <span className="text-xs text-muted-foreground">
                user
              </span>
            );
          const primary = roles.includes('admin') ? 'admin' : roles[0];
          return (
            <Badge
              variant="outline"
              style={{
                borderColor: ROLE_COLORS[primary] ?? '#888',
                color: ROLE_COLORS[primary] ?? '#888',
                fontSize: '0.7rem',
              }}
            >
              <Shield style={{ height: 10, width: 10, marginRight: 3 }} />
              {primary}
            </Badge>
          );
        },
        meta: { hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('is_online', {
        header: 'Online',
        cell: (info) => (
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: info.getValue() ? '#22c55e' : '#d1d5db',
            }}
            title={info.getValue() ? 'Online' : 'Offline'}
          />
        ),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('moderation_status' as const, {
        id: 'moderation_status',
        header: 'Status',
        cell: (info) => {
          const val = (info.getValue() as string) ?? 'approved';
          if (val === 'approved') return null;
          return (
            <Badge
              variant={val === 'banned' ? 'destructive' : 'secondary'}
              style={{ fontSize: '0.7rem' }}
            >
              {val}
            </Badge>
          );
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('location', {
        header: 'Location',
        cell: (info) => {
          const val = info.getValue();
          return val ? (
            <div className="flex items-center gap-1">
              <MapPin style={{ height: 12, width: 12, flexShrink: 0 }} />
              <span
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 150,
                }}
              >
                {val}
              </span>
            </div>
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
        meta: {
          serverSortable: true,
          groupable: true,
          hideable: true,
          defaultVisible: false,
        } satisfies AdminColumnMeta,
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
        'id,user_id,email,display_name,first_name,last_name,avatar_url,location,user_mode,is_online,moderation_status,profile_completion_percentage,pronouns,created_at,last_seen_at',
      columns,
      defaultSort: { column: 'created_at', direction: 'desc' as const },
      defaultPageSize: 25,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['display_name', 'first_name', 'last_name', 'email'],
      entityFilters: [
        { key: 'is_online', label: 'Online', type: 'boolean', column: 'is_online' },
        {
          key: 'moderation_status',
          label: 'Status',
          type: 'select',
          column: 'moderation_status',
          options: [
            { value: 'approved', label: 'Approved' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'banned', label: 'Banned' },
          ],
        },
        {
          key: 'user_mode',
          label: 'Mode',
          type: 'select',
          column: 'user_mode',
          options: 'dynamic',
          dynamicSource: { table: 'profiles', column: 'user_mode' },
        },
      ],
      bulkEditFields: [
        {
          key: 'moderation_status',
          label: 'Moderation Status',
          type: 'select',
          column: 'moderation_status',
          options: [
            { value: 'approved', label: 'Approved' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'banned', label: 'Banned' },
          ],
        },
      ],
      rowActions: [
        {
          key: 'details',
          label: 'View Details',
          icon: Eye,
          onClick: (row) => setSelectedUser(row),
        },
        {
          key: 'profile',
          label: 'View Public Profile',
          icon: ExternalLink,
          onClick: (row) => navigate(`/profile/${row.user_id}`),
        },
      ],
      toolbarActions: (
        <div className="flex gap-2">
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <UserPlus style={{ height: 14, width: 14 }} />
              Create User
            </Button>
          )}
          <ExportExcelButton
            onExport={async () => {
              const cols: ExportColumnDef<Record<string, unknown>>[] = [
                { header: 'Display Name', accessor: (r) => r.display_name },
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
        </div>
      ),
    }),
    [columns, isAdmin, navigate],
  );

  return (
    <AdminEntityTable
      title="Users"
      subtitle="Manage user accounts and permissions"
      backHref="/admin"
      backLabel="Back to Admin"
      config={tableConfig}
      beforeTable={<UserStatsCards />}
      afterTable={
        <>
          <UserDetailSheet
            user={selectedUser}
            open={!!selectedUser}
            onOpenChange={(open) => {
              if (!open) setSelectedUser(null);
            }}
            onUserUpdated={() => setTableKey((k) => k + 1)}
          />
          <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
        </>
      }
    />
  );
}
