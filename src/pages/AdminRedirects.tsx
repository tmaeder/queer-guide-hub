import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Upload,
  Eye,
  Copy,
  ExternalLink,
  Trash2,
  Edit2,
  BarChart3,
  ArrowLeft,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AdminDataTable } from '@/components/admin/data-table';
import type { AdminTableConfig } from '@/components/admin/data-table/types';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import {
  exportToExcel,
  fetchAllRows,
  formatDateTime,
  formatBoolean,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import {
  useRedirects,
  type Redirect,
  type RedirectEvent,
} from '@/hooks/useRedirects';
import { toast } from 'sonner';
import { fetchRedirectById } from '@/hooks/usePageFetchers';
import { format } from 'date-fns';

import type { RedirectRow } from '@/pages/admin-redirects/types';
import { SUPABASE_URL } from '@/pages/admin-redirects/types';
import { getRedirectColumns } from '@/pages/admin-redirects/redirectColumns';
import { RedirectFormDialog } from '@/pages/admin-redirects/RedirectFormDialog';
import { BulkImportDialog } from '@/pages/admin-redirects/BulkImportDialog';
import { PreviewDialog } from '@/pages/admin-redirects/PreviewDialog';

export default function AdminRedirects() {
  const navigate = useNavigate();
  const { createRedirect, updateRedirect, deleteRedirect, _toggleEnabled, fetchEvents, bulkImport } =
    useRedirects();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRedirect, setEditingRedirect] = useState<Redirect | null>(null);
  const [eventsDialogId, setEventsDialogId] = useState<string | null>(null);
  const [events, setEvents] = useState<RedirectEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const doRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin-table', 'redirects'] });
  }, [queryClient]);

  const handleCopyShortUrl = (slug: string) => {
    navigator.clipboard.writeText(`https://queer.guide/go/${slug}`);
    toast.success('Short URL copied!');
  };

  const handleShowEvents = async (redirectId: string) => {
    setEventsDialogId(redirectId);
    setEventsLoading(true);
    const data = await fetchEvents(redirectId);
    setEvents(data);
    setEventsLoading(false);
  };

  const handleDelete = async (row: RedirectRow) => {
    if (!confirm('Delete this redirect? This will also remove all analytics events.')) return;
    const ok = await deleteRedirect(row.id);
    if (ok) {
      toast.success('Redirect deleted');
      doRefresh();
    }
  };

  const columns = useMemo(() => getRedirectColumns(), []);

  const tableConfig: AdminTableConfig<RedirectRow> = useMemo(
    () => ({
      tableName: 'redirects',
      select:
        'id,type,slug,source_path,match_kind,target,status_code,is_enabled,click_count,click_limit,query_mode,notes,start_at,end_at,created_at',
      columns,
      defaultSort: { column: 'created_at', direction: 'desc' as const },
      defaultPageSize: 25,
      enableSelection: true,
      enableSearch: true,
      searchColumns: ['slug', 'source_path', 'target', 'notes'],
      entityFilters: [
        {
          key: 'type',
          label: 'Type',
          type: 'select' as const,
          column: 'type',
          options: [
            { label: 'Short Link', value: 'SHORT' },
            { label: 'Path Redirect', value: 'PATH' },
          ],
        },
        { key: 'is_enabled', label: 'Enabled', type: 'boolean' as const, column: 'is_enabled' },
      ],
      bulkEditFields: [
        { key: 'is_enabled', label: 'Enabled', type: 'boolean' as const, column: 'is_enabled' },
        {
          key: 'status_code',
          label: 'Status Code',
          type: 'select' as const,
          column: 'status_code',
          options: [
            { label: '301 Permanent', value: '301' },
            { label: '302 Temporary', value: '302' },
            { label: '307 Temporary', value: '307' },
            { label: '308 Permanent', value: '308' },
          ],
        },
      ],
      rowActions: [
        {
          key: 'copy',
          label: 'Copy Short URL',
          icon: Copy,
          visible: (row) => row.type === 'SHORT' && !!row.slug,
          onClick: (row) => handleCopyShortUrl(row.slug!),
        },
        {
          key: 'test',
          label: 'Test Redirect',
          icon: ExternalLink,
          visible: (row) => row.type === 'SHORT' && !!row.slug,
          onClick: (row) =>
            window.open(`${SUPABASE_URL}/functions/v1/redirect-handler?slug=${row.slug}`, '_blank'),
        },
        {
          key: 'analytics',
          label: 'Analytics',
          icon: BarChart3,
          onClick: (row) => handleShowEvents(row.id),
        },
        {
          key: 'edit',
          label: 'Edit',
          icon: Edit2,
          onClick: async (row) => {
            const data = await fetchRedirectById<Redirect>(row.id);
            if (data) {
              setEditingRedirect(data);
              setDialogOpen(true);
            }
          },
        },
        {
          key: 'delete',
          label: 'Delete',
          icon: Trash2,
          variant: 'destructive' as const,
          onClick: handleDelete,
        },
      ],
      toolbarActions: (
        <div className="flex" style={{ gap: 8 }}>
          <Button variant="outline" size="sm" onClick={() => setBulkDialogOpen(true)}>
            <Upload style={{ height: 14, width: 14, marginRight: 4 }} />
            Import
          </Button>
          <ExportExcelButton
            onExport={async () => {
              const cols: ExportColumnDef<Record<string, unknown>>[] = [
                { header: 'Type', accessor: (r) => r.type },
                { header: 'Slug', accessor: (r) => r.slug },
                { header: 'Source Path', accessor: (r) => r.source_path },
                { header: 'Target', accessor: (r) => r.target },
                { header: 'Status Code', accessor: (r) => r.status_code },
                { header: 'Enabled', accessor: (r) => formatBoolean(r.is_enabled) },
                { header: 'Click Count', accessor: (r) => r.click_count },
                { header: 'Notes', accessor: (r) => r.notes },
                { header: 'Created At', accessor: (r) => formatDateTime(r.created_at) },
              ];
              const allData = await fetchAllRows('redirects', '*', {
                column: 'created_at',
                ascending: false,
              });
              await exportToExcel(allData, cols, generateFilename('redirects'));
            }}
          />
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye style={{ height: 14, width: 14, marginRight: 4 }} />
            Preview
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingRedirect(null);
              setDialogOpen(true);
            }}
          >
            <Plus style={{ height: 14, width: 14, marginRight: 4 }} />
            New Redirect
          </Button>
        </div>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleDelete/handleShowEvents are stable, adding would defeat memoization
    [columns],
  );

  return (
    <div className="mx-auto flex flex-col" style={{ maxWidth: 1200, padding: 24, gap: 24 }}>
      <div className="flex items-center" style={{ gap: 16 }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <ArrowLeft style={{ height: 16, width: 16 }} /> Back to Admin
        </Button>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>
            Redirects & Short Links
          </h1>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Manage URL redirects, short links, and analytics
          </p>
        </div>
      </div>

      <AdminDataTable config={tableConfig} />

      <RedirectFormDialog
        open={dialogOpen}
        editingRedirect={editingRedirect}
        onClose={() => setDialogOpen(false)}
        onSave={async (formData) => {
          if (editingRedirect) {
            const updated = await updateRedirect(editingRedirect.id, formData);
            if (updated) {
              toast.success('Redirect updated');
              doRefresh();
              setDialogOpen(false);
            }
          } else {
            const created = await createRedirect(formData);
            if (created) {
              toast.success('Redirect created');
              doRefresh();
              setDialogOpen(false);
            }
          }
        }}
      />

      <Dialog open={!!eventsDialogId} onOpenChange={(o) => { if (!o) setEventsDialogId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              Click Analytics
              <Button variant="ghost" size="sm" onClick={() => setEventsDialogId(null)}>
                <X size={18} />
              </Button>
            </DialogTitle>
          </DialogHeader>
          {eventsLoading ? (
            <div style={{ paddingTop: 24, paddingBottom: 24 }}>
              <Skeleton style={{ height: 200, width: '100%' }} />
            </div>
          ) : events.length === 0 ? (
            <p
              className="text-center text-muted-foreground"
              style={{ paddingTop: 24, paddingBottom: 24 }}
            >
              No click events recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Referer</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell style={{ fontSize: '0.8rem' }}>
                      {format(new Date(e.ts), 'MMM d, HH:mm:ss')}
                    </TableCell>
                    <TableCell>{e.country || '—'}</TableCell>
                    <TableCell
                      style={{
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.8rem',
                      }}
                    >
                      {e.referer || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{e.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      <BulkImportDialog
        open={bulkDialogOpen}
        onClose={() => setBulkDialogOpen(false)}
        onImport={async (items) => {
          const result = await bulkImport(items);
          if (result.success > 0) {
            toast({ title: `Imported ${result.success} redirect(s)` });
            doRefresh();
          }
          return result;
        }}
      />

      <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </div>
  );
}
