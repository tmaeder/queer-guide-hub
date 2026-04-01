import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
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
import { AdminDataTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
import { ArrowLeft, Eye, Trash2, Lock, Globe, Users } from 'lucide-react';

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
  const { user } = useAuth();
  const { isAdmin, canManageContent } = useAdminRoles();
  const { toast } = useToast();

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Group',
        cell: (info) => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                height: 36,
                width: 36,
                borderRadius: 2,
                background: 'linear-gradient(135deg, #DB2777, #F472B6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 600,
                fontSize: '0.875rem',
                flexShrink: 0,
              }}
            >
              {info.getValue().charAt(0).toUpperCase()}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ fontWeight: 500 }}>{info.getValue()}</Box>
              {info.row.original.description && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    fontSize: '0.75rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 250,
                  }}
                >
                  {info.row.original.description}
                </Typography>
              )}
            </Box>
          </Box>
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Users style={{ height: 14, width: 14 }} />
            {info.getValue() ?? 0}
          </Box>
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
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
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
            </Box>
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
      const { error } = await supabase.from('community_groups').delete().eq('id', row.id);
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
            const cols: ExportColumnDef<any>[] = [
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
    [columns, isAdmin],
  );

  if (!user || !canManageContent()) {
    return (
      <Box sx={{ maxWidth: 'lg', mx: 'auto', p: 3, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Access Denied
        </Typography>
        <p>You don't have permission to access this page.</p>
      </Box>
    );
  }

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
            Groups
          </Typography>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Manage community groups and their settings
          </p>
        </div>
      </Box>

      <AdminDataTable config={tableConfig} />
    </Box>
  );
}
