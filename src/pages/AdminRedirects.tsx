import { useState, useMemo, useEffect, useCallback } from 'react';
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
  Link2,
  ArrowLeft,
  ArrowRight,
  Clock,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AdminDataTable } from '@/components/admin/data-table';
import type { AdminTableConfig, AdminColumnMeta } from '@/components/admin/data-table/types';
import { createColumnHelper } from '@tanstack/react-table';
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
  type RedirectFormData,
  type RedirectType,
  type QueryMode,
  type RedirectEvent,
} from '@/hooks/useRedirects';
import {
  validateSlug,
  validateTarget,
  validateSourcePath,
  detectLoop,
} from '@/lib/redirects/validation';
import { toast } from 'sonner';
import { fetchRedirectById } from '@/hooks/usePageFetchers';
import { format } from 'date-fns';

const SUPABASE_URL = 'https://xqeacpakadqfxjxjcewc.supabase.co';

interface RedirectRow {
  id: string;
  type: RedirectType;
  slug: string | null;
  source_path: string | null;
  match_kind: string;
  target: string;
  status_code: number;
  is_enabled: boolean;
  click_count: number;
  click_limit: number | null;
  query_mode: string;
  notes: string | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
}

const columnHelper = createColumnHelper<RedirectRow>();

export default function AdminRedirects() {
  const navigate = useNavigate();
  const { createRedirect, updateRedirect, deleteRedirect, _toggleEnabled, fetchEvents, bulkImport } =
    useRedirects();
  const queryClient = useQueryClient();

  // Dialog state
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
  const columns = useMemo(
    () => [
      columnHelper.accessor('type', {
        header: 'Type',
        cell: (info) => (
          <Badge variant={info.getValue() === 'SHORT' ? 'default' : 'secondary'}>
            {info.getValue() === 'SHORT' ? (
              <Link2 style={{ height: 12, width: 12, marginRight: 4 }} />
            ) : (
              <ArrowRight style={{ height: 12, width: 12, marginRight: 4 }} />
            )}
            {info.getValue()}
          </Badge>
        ),
        meta: { serverSortable: true, groupable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('slug', {
        header: 'Source',
        cell: (info) => {
          const row = info.row.original;
          const source = row.type === 'SHORT' ? `/go/${row.slug}` : row.source_path;
          return (
            <div className="flex items-center" style={{ gap: 4 }}>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {source}
              </span>
              {(row.start_at || row.end_at) && (
                <Clock style={{ height: 12, width: 12, color: '#888' }} />
              )}
            </div>
          );
        },
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('target', {
        header: 'Target',
        cell: (info) => (
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              maxWidth: 240,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
          >
            {info.getValue()}
          </span>
        ),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('status_code', {
        header: 'Code',
        cell: (info) => (
          <Badge
            variant="outline"
            style={{ color: info.getValue() === 301 ? '#16a34a' : '#ca8a04' }}
          >
            {info.getValue()}
          </Badge>
        ),
        meta: { serverSortable: true, groupable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('click_count', {
        header: 'Clicks',
        cell: (info) => {
          const row = info.row.original;
          return (
            <span>
              {info.getValue().toLocaleString()}
              {row.click_limit ? <span style={{ color: '#888' }}> / {row.click_limit}</span> : null}
            </span>
          );
        },
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('is_enabled', {
        header: 'Enabled',
        cell: (info) => (
          <Badge variant={info.getValue() ? 'default' : 'secondary'}>
            {info.getValue() ? 'On' : 'Off'}
          </Badge>
        ),
        meta: { serverSortable: true, hideable: true } satisfies AdminColumnMeta,
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

      {/* Create / Edit Dialog */}
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

      {/* Events / Analytics Dialog */}
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

      {/* Bulk Import Dialog */}
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

      {/* Preview / Test Dialog */}
      <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </div>
  );
}

// ── Create / Edit Form Dialog ───────────────────────────────────────────────

interface RedirectFormDialogProps {
  open: boolean;
  editingRedirect: Redirect | null;
  onClose: () => void;
  onSave: (data: RedirectFormData) => Promise<void>;
}

function RedirectFormDialog({ open, editingRedirect, onClose, onSave }: RedirectFormDialogProps) {
  const [type, setType] = useState<RedirectType>('SHORT');
  const [slug, setSlug] = useState('');
  const [sourcePath, setSourcePath] = useState('');
  const [matchKind, setMatchKind] = useState<'EXACT' | 'WILDCARD' | 'REGEX'>('EXACT');
  const [target, setTarget] = useState('');
  const [statusCode, setStatusCode] = useState(301);
  const [isEnabled, setIsEnabled] = useState(true);
  const [queryMode, setQueryMode] = useState<QueryMode>('PRESERVE');
  const [queryOverride, setQueryOverride] = useState('');
  const [utmDefaults, setUtmDefaults] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [clickLimit, setClickLimit] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && editingRedirect) {
      setType(editingRedirect.type);
      setSlug(editingRedirect.slug || '');
      setSourcePath(editingRedirect.source_path || '');
      setMatchKind(editingRedirect.match_kind);
      setTarget(editingRedirect.target);
      setStatusCode(editingRedirect.status_code);
      setIsEnabled(editingRedirect.is_enabled);
      setQueryMode(editingRedirect.query_mode);
      setQueryOverride(
        editingRedirect.query_override ? JSON.stringify(editingRedirect.query_override) : '',
      );
      setUtmDefaults(
        editingRedirect.utm_defaults ? JSON.stringify(editingRedirect.utm_defaults) : '',
      );
      setStartAt(editingRedirect.start_at ? editingRedirect.start_at.substring(0, 16) : '');
      setEndAt(editingRedirect.end_at ? editingRedirect.end_at.substring(0, 16) : '');
      setClickLimit(editingRedirect.click_limit ? String(editingRedirect.click_limit) : '');
      setNotes(editingRedirect.notes || '');
    } else if (open) {
      setType('SHORT');
      setSlug('');
      setSourcePath('');
      setMatchKind('EXACT');
      setTarget('');
      setStatusCode(301);
      setIsEnabled(true);
      setQueryMode('PRESERVE');
      setQueryOverride('');
      setUtmDefaults('');
      setStartAt('');
      setEndAt('');
      setClickLimit('');
      setNotes('');
    }
    setValidationErrors({});
  }, [open, editingRedirect]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (type === 'SHORT') {
      const sv = validateSlug(slug);
      if (!sv.valid) errs.slug = sv.error!;
    } else {
      const pv = validateSourcePath(sourcePath);
      if (!pv.valid) errs.sourcePath = pv.error!;
    }
    const tv = validateTarget(target);
    if (!tv.valid) errs.target = tv.error!;
    if (tv.valid) {
      const loop = detectLoop(type === 'SHORT' ? `/go/${slug}` : sourcePath, target);
      if (!loop.safe) errs.target = loop.error!;
    }
    if (queryOverride) {
      try {
        JSON.parse(queryOverride);
      } catch {
        errs.queryOverride = 'Must be valid JSON';
      }
    }
    if (utmDefaults) {
      try {
        JSON.parse(utmDefaults);
      } catch {
        errs.utmDefaults = 'Must be valid JSON';
      }
    }
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    await onSave({
      type,
      slug: type === 'SHORT' ? slug.toLowerCase().trim() : undefined,
      source_path: type === 'PATH' ? sourcePath.trim() : undefined,
      match_kind: matchKind,
      target: target.trim(),
      status_code: statusCode,
      is_enabled: isEnabled,
      query_mode: queryMode,
      query_override: queryOverride ? JSON.parse(queryOverride) : null,
      utm_defaults: utmDefaults ? JSON.parse(utmDefaults) : null,
      start_at: startAt || null,
      end_at: endAt || null,
      click_limit: clickLimit ? parseInt(clickLimit, 10) : null,
      notes: notes || undefined,
    });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingRedirect ? 'Edit Redirect' : 'New Redirect'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col" style={{ gap: 16, paddingTop: 8 }}>
          <Tabs value={type} onValueChange={(v) => setType(v as RedirectType)} style={{ marginBottom: 8 }}>
            <TabsList>
              <TabsTrigger value="SHORT" className="flex items-center" style={{ gap: 4 }}>
                <Link2 size={16} />
                Short Link
              </TabsTrigger>
              <TabsTrigger value="PATH" className="flex items-center" style={{ gap: 4 }}>
                <ArrowRight size={16} />
                Path Redirect
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {type === 'SHORT' ? (
            <div>
              <Label>Slug</Label>
              <div className="flex items-center" style={{ gap: 4 }}>
                <span style={{ color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>/go/</span>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="flex-1"
                />
              </div>
              <p
                className="text-xs"
                style={{ marginTop: 4, color: validationErrors.slug ? 'hsl(var(--destructive))' : 'var(--muted-foreground)' }}
              >
                {validationErrors.slug || `Short URL: queer.guide/go/${slug || '...'}`}
              </p>
            </div>
          ) : (
            <div className="flex" style={{ gap: 8 }}>
              <div className="flex-1">
                <Label>Source Path</Label>
                <Input
                  value={sourcePath}
                  onChange={(e) => setSourcePath(e.target.value)}
                  placeholder="/old/page"
                />
                {validationErrors.sourcePath && (
                  <p className="text-xs" style={{ marginTop: 4, color: 'hsl(var(--destructive))' }}>
                    {validationErrors.sourcePath}
                  </p>
                )}
              </div>
              <div style={{ minWidth: 120 }}>
                <Label>Match</Label>
                <Select value={matchKind} onValueChange={(v) => setMatchKind(v as 'EXACT' | 'WILDCARD' | 'REGEX')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXACT">Exact</SelectItem>
                    <SelectItem value="WILDCARD">Wildcard</SelectItem>
                    <SelectItem value="REGEX">Regex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div>
            <Label>Target URL</Label>
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="/events/pride-zurich-2026"
            />
            <p
              className="text-xs"
              style={{ marginTop: 4, color: validationErrors.target ? 'hsl(var(--destructive))' : 'var(--muted-foreground)' }}
            >
              {validationErrors.target || 'Relative path (/page) or allowlisted absolute URL'}
            </p>
          </div>

          <div className="flex" style={{ gap: 16 }}>
            <div style={{ minWidth: 140, flex: 1 }}>
              <Label>HTTP Status</Label>
              <Select value={String(statusCode)} onValueChange={(v) => setStatusCode(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="301">301 Permanent</SelectItem>
                  <SelectItem value="302">302 Temporary</SelectItem>
                  <SelectItem value="307">307 Temporary</SelectItem>
                  <SelectItem value="308">308 Permanent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div style={{ minWidth: 140, flex: 1 }}>
              <Label>Query Params</Label>
              <Select value={queryMode} onValueChange={(v) => setQueryMode(v as QueryMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRESERVE">Preserve</SelectItem>
                  <SelectItem value="DROP">Drop</SelectItem>
                  <SelectItem value="OVERRIDE">Override</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {queryMode === 'OVERRIDE' && (
            <div>
              <Label>Query Override (JSON)</Label>
              <Input
                value={queryOverride}
                onChange={(e) => setQueryOverride(e.target.value)}
              />
              <p
                className="text-xs"
                style={{ marginTop: 4, color: validationErrors.queryOverride ? 'hsl(var(--destructive))' : 'var(--muted-foreground)' }}
              >
                {validationErrors.queryOverride || 'e.g. {"ref":"campaign-a"}'}
              </p>
            </div>
          )}

          <div>
            <Label>UTM Defaults (JSON, optional)</Label>
            <Input value={utmDefaults} onChange={(e) => setUtmDefaults(e.target.value)} />
            <p
              className="text-xs"
              style={{ marginTop: 4, color: validationErrors.utmDefaults ? 'hsl(var(--destructive))' : 'var(--muted-foreground)' }}
            >
              {validationErrors.utmDefaults || 'Added if not already present'}
            </p>
          </div>

          <div className="flex" style={{ gap: 16 }}>
            <div className="flex-1">
              <Label>Start (optional)</Label>
              <Input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label>End (optional)</Label>
              <Input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>
          </div>

          <div className="flex" style={{ gap: 16 }}>
            <div style={{ width: 160 }}>
              <Label>Click Limit (optional)</Label>
              <Input
                type="number"
                value={clickLimit}
                onChange={(e) => setClickLimit(e.target.value)}
              />
            </div>
            <div className="flex items-center self-end" style={{ gap: 8, height: 40 }}>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
              <span className="text-sm">{isEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : editingRedirect ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bulk Import Dialog ──────────────────────────────────────────────────────

interface BulkImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (
    items: Array<{
      slug?: string;
      source_path?: string;
      target: string;
      status_code?: number;
      is_enabled?: boolean;
    }>,
  ) => Promise<{ success: number; errors: string[] }>;
}

function BulkImportDialog({ open, onClose, onImport }: BulkImportDialogProps) {
  const [csvText, setCsvText] = useState('');
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    try {
      const lines = csvText
        .trim()
        .split('\n')
        .filter((l) => l.trim());
      if (lines.length < 2) {
        setResult({ success: 0, errors: ['Need at least a header row and one data row'] });
        return;
      }
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const items = lines
        .slice(1)
        .map((line) => {
          const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
          const obj: Record<string, string | number | boolean | undefined> = {};
          headers.forEach((h, i) => {
            if (h === 'slug') obj.slug = values[i];
            if (h === 'source_path') obj.source_path = values[i];
            if (h === 'target') obj.target = values[i];
            if (h === 'status_code') obj.status_code = parseInt(values[i], 10) || 301;
            if (h === 'is_enabled') obj.is_enabled = values[i] !== 'false' && values[i] !== '0';
          });
          return obj;
        })
        .filter((item) => item.target);
      const res = await onImport(items as Array<{ slug?: string; source_path?: string; target: string; status_code?: number; is_enabled?: boolean; }>);
      setResult(res);
    } catch (err: unknown) {
      setResult({ success: 0, errors: [err instanceof Error ? err.message : 'Import failed'] });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Import (CSV)</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground" style={{ marginBottom: 16 }}>
          Paste CSV with headers: <code>slug,target,status_code,is_enabled</code> (for short links)
          or <code>source_path,target,status_code,is_enabled</code> (for path redirects).
        </p>
        <Textarea
          rows={8}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={`slug,target,status_code\npride-zrh,/events/pride-zurich-2026,301\nnyc-guide,/city/new-york,302`}
          style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
        />
        {result && (
          <div style={{ marginTop: 16 }}>
            {result.success > 0 && (
              <Alert style={{ marginBottom: 8 }}>
                <AlertDescription>Imported {result.success} redirect(s)</AlertDescription>
              </Alert>
            )}
            {result.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  {result.errors.map((e, i) => (
                    <div key={i}>{e}</div>
                  ))}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleImport} disabled={importing || !csvText.trim()}>
            {importing ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Preview / Test Dialog ───────────────────────────────────────────────────

function PreviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [testUrl, setTestUrl] = useState('');
  const [previewResult, setPreviewResult] = useState<string | null>(null);

  const handlePreview = () => {
    let slug = testUrl.trim();
    if (slug.includes('/go/')) slug = slug.split('/go/')[1]?.split('?')[0] || '';
    if (!slug) {
      setPreviewResult('Enter a slug or /go/<slug> URL');
      return;
    }
    const edgeUrl = `${SUPABASE_URL}/functions/v1/redirect-handler?slug=${encodeURIComponent(slug)}`;
    setPreviewResult(`Edge function URL:\n${edgeUrl}\n\nOpen this URL to test the redirect.`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Preview / Test Redirect</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground" style={{ marginBottom: 16 }}>
          Enter a slug or short URL to preview the redirect resolution.
        </p>
        <Input
          value={testUrl}
          onChange={(e) => setTestUrl(e.target.value)}
          placeholder="pride-zrh or https://queer.guide/go/pride-zrh"
          onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
        />
        <Button variant="outline" onClick={handlePreview} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
          Test
        </Button>
        {previewResult && (
          <div className="bg-muted" style={{ marginTop: 16, padding: 16, borderRadius: 4 }}>
            <p
              style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}
            >
              {previewResult}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
