import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { deleteCommunityGroup } from '@/hooks/usePageFetchers';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  formatDateTime,
  formatBoolean,
  formatArray,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import { AdminEntityTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { Eye, Trash2, Lock, Globe, Users, Check, X } from 'lucide-react';
import { useGroupJoinRequests } from '@/hooks/useGroupJoinRequests';

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  featured: boolean;
  tags: string[] | null;
  member_count: number | null;
  created_at: string;
  updated_at: string;
}

const columnHelper = createColumnHelper<GroupRow>();

export default function AdminGroups() {
  const navigate = useNavigate();
  const { isAdmin } = useAdminRoles();
  const { toast } = useToast();

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Group',
        cell: (info) => (
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #DB2777, #F472B6)' }}
            >
              {info.getValue().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-medium">{info.getValue()}</div>
              {info.row.original.description && (
                <p className="text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap max-w-[250px]">
                  {info.row.original.description}
                </p>
              )}
            </div>
          </div>
        ),
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('is_private', {
        header: 'Visibility',
        cell: (info) =>
          info.getValue() ? (
            <Badge variant="secondary">
              <Lock style={{ height: 12, width: 12, marginRight: 4 }} />
              Private
            </Badge>
          ) : (
            <Badge variant="outline">
              <Globe style={{ height: 12, width: 12, marginRight: 4 }} />
              Public
            </Badge>
          ),
        meta: { serverSortable: true, groupable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('member_count', {
        header: 'Members',
        cell: (info) => (
          <div className="flex items-center gap-1">
            <Users style={{ height: 14, width: 14 }} />
            {info.getValue() ?? 0}
          </div>
        ),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('featured', {
        header: 'Featured',
        cell: (info) =>
          info.getValue() ? (
            <Badge style={{ backgroundColor: '#f3e8ff', color: '#6b21a8' }}>Featured</Badge>
          ) : null,
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('tags', {
        header: 'Tags',
        cell: (info) => {
          const tags = info.getValue();
          if (!tags || tags.length === 0) return <span style={{ color: '#999' }}>-</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 2).map((t) => (
                <Badge key={t} variant="outline" style={{ fontSize: '0.7rem' }}>
                  {t}
                </Badge>
              ))}
              {tags.length > 2 && (
                <Badge variant="outline" style={{ fontSize: '0.7rem' }}>
                  +{tags.length - 2}
                </Badge>
              )}
            </div>
          );
        },
        meta: { hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('created_at', {
        header: 'Created',
        cell: (info) => new Date(info.getValue()).toLocaleDateString(),
        meta: {
          serverSortable: true,
          defaultVisible: false,
          hideable: true,
        } satisfies AdminColumnMeta,
      }),
    ],
    [],
  );

  const handleDelete = async (row: GroupRow) => {
    if (!confirm(`Delete "${row.name}"?`)) return;
    try {
      const { error } = await deleteCommunityGroup(row.id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Group deleted' });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete group', variant: 'destructive' });
    }
  };

  const tableConfig: AdminTableConfig<GroupRow> = useMemo(
    () => ({
      tableName: 'community_groups',
      select: 'id,name,description,is_private,featured,tags,member_count,created_at,updated_at',
      columns,
      defaultSort: { column: 'name', direction: 'asc' as const },
      defaultPageSize: 25,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['name', 'description'],
      entityFilters: [
        { key: 'is_private', label: 'Visibility', type: 'boolean', column: 'is_private' },
        { key: 'featured', label: 'Featured', type: 'boolean', column: 'featured' },
      ],
      bulkEditFields: [
        { key: 'is_private', label: 'Private', type: 'boolean', column: 'is_private' },
        { key: 'featured', label: 'Featured', type: 'boolean', column: 'featured' },
      ],
      rowActions: [
        {
          key: 'view',
          label: 'View Group',
          icon: Eye,
          onClick: (row) => navigate(`/groups/${row.id}`),
        },
        ...(isAdmin
          ? [
              {
                key: 'delete',
                label: 'Delete',
                icon: Trash2,
                variant: 'destructive' as const,
                onClick: handleDelete,
              },
            ]
          : []),
      ],
      toolbarActions: (
        <ExportExcelButton
          onExport={async () => {
            const cols: ExportColumnDef<Record<string, unknown>>[] = [
              { header: 'Name', accessor: (r) => r.name },
              { header: 'Description', accessor: (r) => r.description },
              { header: 'Private', accessor: (r) => formatBoolean(r.is_private) },
              { header: 'Featured', accessor: (r) => formatBoolean(r.featured) },
              { header: 'Tags', accessor: (r) => formatArray(r.tags) },
              { header: 'Members', accessor: (r) => r.member_count },
              { header: 'Created At', accessor: (r) => formatDateTime(r.created_at) },
            ];
            const allData = await fetchAllRows('community_groups', '*', {
              column: 'name',
              ascending: true,
            });
            await exportToExcel(allData, cols, generateFilename('groups'));
          }}
        />
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleDelete/navigate are stable, adding would defeat memoization
    [columns, isAdmin],
  );

  return (
    <AdminEntityTable
      title="Groups"
      subtitle="Manage community groups and their settings"
      backHref="/admin"
      backLabel="Back to Admin"
      config={tableConfig}
      beforeTable={<PendingJoinRequestsPanel />}
    />
  );
}

function PendingJoinRequestsPanel() {
  const { requests, isLoading, approve, isApproving, reject, isRejecting } =
    useGroupJoinRequests();

  if (isLoading) return null;
  if (!requests.length) return null;

  return (
    <div className="flex flex-col gap-3 p-4 bg-background">
      <h6 className="text-base font-semibold">
        Pending Join Requests ({requests.length})
      </h6>
      <div className="flex flex-col gap-2">
        {requests.map((req) => (
          <div key={req.id} className="flex items-center justify-between gap-4 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{req.group_name ?? req.group_id}</p>
              <span className="text-xs text-muted-foreground">
                User {req.user_id.slice(0, 8)}…
                {req.message ? ` — ${req.message}` : ''} ·{' '}
                {new Date(req.created_at).toLocaleString()}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => approve(req.id)}
                disabled={isApproving || isRejecting}
              >
                <Check style={{ width: 14, height: 14, marginRight: 4 }} /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => reject(req.id)}
                disabled={isApproving || isRejecting}
              >
                <X style={{ width: 14, height: 14, marginRight: 4 }} /> Reject
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
