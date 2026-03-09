import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import MuiButton from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import MuiTable from '@mui/material/Table';
import MuiTableBody from '@mui/material/TableBody';
import MuiTableCell from '@mui/material/TableCell';
import MuiTableHead from '@mui/material/TableHead';
import MuiTableRow from '@mui/material/TableRow';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Skeleton from '@mui/material/Skeleton';
import Switch from '@mui/material/Switch';
import InputAdornment from '@mui/material/InputAdornment';
import Snackbar from '@mui/material/Snackbar';
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
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

const SUPABASE_URL = 'https://xqeacpakadqfxjxjcewc.supabase.co';
const WORKERS_URL = import.meta.env.VITE_WORKERS_URL || '';
const REDIRECT_BASE = WORKERS_URL || `${SUPABASE_URL}/functions/v1`;

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
  const { createRedirect, updateRedirect, deleteRedirect, toggleEnabled, fetchEvents, bulkImport } =
    useRedirects();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRedirect, setEditingRedirect] = useState<Redirect | null>(null);
  const [eventsDialogId, setEventsDialogId] = useState<string | null>(null);
  const [events, setEvents] = useState<RedirectEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [snackMsg, setSnackMsg] = useState('');

  const doRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin-table', 'redirects'] });
  }, [queryClient]);

  const handleCopyShortUrl = (slug: string) => {
    navigator.clipboard.writeText(`https://queer.guide/go/${slug}`);
    setSnackMsg('Short URL copied!');
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
      toast({ title: 'Redirect deleted' });
      doRefresh();
    }
  };

  const handleToggle = async (row: RedirectRow) => {
    const ok = await toggleEnabled(row.id, !row.is_enabled);
    if (ok) doRefresh();
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                component="span"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {source}
              </Box>
              {(row.start_at || row.end_at) && (
                <Clock style={{ height: 12, width: 12, color: '#888' }} />
              )}
            </Box>
          );
        },
        meta: { serverSortable: true, hideable: false } satisfies AdminColumnMeta,
      }),
      columnHelper.accessor('target', {
        header: 'Target',
        cell: (info) => (
          <Box
            component="span"
            sx={{
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
          </Box>
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
            window.open(`${REDIRECT_BASE}/redirect-handler?slug=${row.slug}`, '_blank'),
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
            // Fetch full redirect data for edit dialog
            const { data } = await supabase.from('redirects').select('*').eq('id', row.id).single();
            if (data) {
              setEditingRedirect(data as Redirect);
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
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outline" size="sm" onClick={() => setBulkDialogOpen(true)}>
            <Upload style={{ height: 14, width: 14, marginRight: 4 }} />
            Import
          </Button>
          <ExportExcelButton
            onExport={async () => {
              const cols: ExportColumnDef<any>[] = [
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
        </Box>
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
            Redirects & Short Links
          </Typography>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Manage URL redirects, short links, and analytics
          </p>
        </div>
      </Box>

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
              toast({ title: 'Redirect updated' });
              doRefresh();
              setDialogOpen(false);
            }
          } else {
            const created = await createRedirect(formData);
            if (created) {
              toast({ title: 'Redirect created' });
              doRefresh();
              setDialogOpen(false);
            }
          }
        }}
      />

      {/* Events / Analytics Dialog */}
      <Dialog
        open={!!eventsDialogId}
        onClose={() => setEventsDialogId(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          Click Analytics
          <IconButton size="small" onClick={() => setEventsDialogId(null)}>
            <X size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {eventsLoading ? (
            <Box sx={{ py: 3 }}>
              <Skeleton variant="rectangular" height={200} />
            </Box>
          ) : events.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
              No click events recorded yet.
            </Typography>
          ) : (
            <MuiTable size="small">
              <MuiTableHead>
                <MuiTableRow>
                  <MuiTableCell>Time</MuiTableCell>
                  <MuiTableCell>Country</MuiTableCell>
                  <MuiTableCell>Referer</MuiTableCell>
                  <MuiTableCell>Status</MuiTableCell>
                </MuiTableRow>
              </MuiTableHead>
              <MuiTableBody>
                {events.map((e) => (
                  <MuiTableRow key={e.id}>
                    <MuiTableCell sx={{ fontSize: '0.8rem' }}>
                      {format(new Date(e.ts), 'MMM d, HH:mm:ss')}
                    </MuiTableCell>
                    <MuiTableCell>{e.country || '—'}</MuiTableCell>
                    <MuiTableCell
                      sx={{
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.8rem',
                      }}
                    >
                      {e.referer || '—'}
                    </MuiTableCell>
                    <MuiTableCell>
                      <Chip label={e.status} size="small" />
                    </MuiTableCell>
                  </MuiTableRow>
                ))}
              </MuiTableBody>
            </MuiTable>
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

      <Snackbar
        open={!!snackMsg}
        autoHideDuration={3000}
        onClose={() => setSnackMsg('')}
        message={snackMsg}
      />
    </Box>
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
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editingRedirect ? 'Edit Redirect' : 'New Redirect'}</DialogTitle>
      <DialogContent
        sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}
      >
        <Tabs value={type} onChange={(_, v) => setType(v)} sx={{ mb: 1 }}>
          <Tab value="SHORT" label="Short Link" icon={<Link2 size={16} />} iconPosition="start" />
          <Tab
            value="PATH"
            label="Path Redirect"
            icon={<ArrowRight size={16} />}
            iconPosition="start"
          />
        </Tabs>

        {type === 'SHORT' ? (
          <TextField
            label="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            error={!!validationErrors.slug}
            helperText={validationErrors.slug || `Short URL: queer.guide/go/${slug || '...'}`}
            InputProps={{ startAdornment: <InputAdornment position="start">/go/</InputAdornment> }}
            fullWidth
          />
        ) : (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="Source Path"
              value={sourcePath}
              onChange={(e) => setSourcePath(e.target.value)}
              error={!!validationErrors.sourcePath}
              helperText={validationErrors.sourcePath}
              placeholder="/old/page"
              fullWidth
            />
            <TextField
              select
              label="Match"
              value={matchKind}
              onChange={(e) => setMatchKind(e.target.value as any)}
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="EXACT">Exact</MenuItem>
              <MenuItem value="WILDCARD">Wildcard</MenuItem>
              <MenuItem value="REGEX">Regex</MenuItem>
            </TextField>
          </Box>
        )}

        <TextField
          label="Target URL"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          error={!!validationErrors.target}
          helperText={
            validationErrors.target || 'Relative path (/page) or allowlisted absolute URL'
          }
          placeholder="/events/pride-zurich-2026"
          fullWidth
        />

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            select
            label="HTTP Status"
            value={statusCode}
            onChange={(e) => setStatusCode(Number(e.target.value))}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value={301}>301 Permanent</MenuItem>
            <MenuItem value={302}>302 Temporary</MenuItem>
            <MenuItem value={307}>307 Temporary</MenuItem>
            <MenuItem value={308}>308 Permanent</MenuItem>
          </TextField>
          <TextField
            select
            label="Query Params"
            value={queryMode}
            onChange={(e) => setQueryMode(e.target.value as QueryMode)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="PRESERVE">Preserve</MenuItem>
            <MenuItem value="DROP">Drop</MenuItem>
            <MenuItem value="OVERRIDE">Override</MenuItem>
          </TextField>
        </Box>

        {queryMode === 'OVERRIDE' && (
          <TextField
            label="Query Override (JSON)"
            value={queryOverride}
            onChange={(e) => setQueryOverride(e.target.value)}
            error={!!validationErrors.queryOverride}
            helperText={validationErrors.queryOverride || 'e.g. {"ref":"campaign-a"}'}
            size="small"
            fullWidth
          />
        )}

        <TextField
          label="UTM Defaults (JSON, optional)"
          value={utmDefaults}
          onChange={(e) => setUtmDefaults(e.target.value)}
          error={!!validationErrors.utmDefaults}
          helperText={validationErrors.utmDefaults || 'Added if not already present'}
          size="small"
          fullWidth
        />

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Start (optional)"
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            fullWidth
          />
          <TextField
            label="End (optional)"
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            fullWidth
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Click Limit (optional)"
            type="number"
            value={clickLimit}
            onChange={(e) => setClickLimit(e.target.value)}
            size="small"
            sx={{ width: 160 }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Switch checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
            <Typography variant="body2">{isEnabled ? 'Enabled' : 'Disabled'}</Typography>
          </Box>
        </Box>

        <TextField
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          multiline
          rows={2}
          size="small"
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <MuiButton onClick={onClose}>Cancel</MuiButton>
        <MuiButton variant="contained" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving...' : editingRedirect ? 'Update' : 'Create'}
        </MuiButton>
      </DialogActions>
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
          const obj: any = {};
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
      const res = await onImport(items);
      setResult(res);
    } catch (err: any) {
      setResult({ success: 0, errors: [err.message] });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Bulk Import (CSV)</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Paste CSV with headers: <code>slug,target,status_code,is_enabled</code> (for short links)
          or <code>source_path,target,status_code,is_enabled</code> (for path redirects).
        </Typography>
        <TextField
          multiline
          rows={8}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={`slug,target,status_code\npride-zrh,/events/pride-zurich-2026,301\nnyc-guide,/city/new-york,302`}
          fullWidth
          sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
        />
        {result && (
          <Box sx={{ mt: 2 }}>
            {result.success > 0 && (
              <Alert severity="success" sx={{ mb: 1 }}>
                Imported {result.success} redirect(s)
              </Alert>
            )}
            {result.errors.length > 0 && (
              <Alert severity="error">
                {result.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <MuiButton onClick={onClose}>Close</MuiButton>
        <MuiButton
          variant="contained"
          onClick={handleImport}
          disabled={importing || !csvText.trim()}
        >
          {importing ? 'Importing...' : 'Import'}
        </MuiButton>
      </DialogActions>
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
    const edgeUrl = `${REDIRECT_BASE}/redirect-handler?slug=${encodeURIComponent(slug)}`;
    setPreviewResult(`Edge function URL:\n${edgeUrl}\n\nOpen this URL to test the redirect.`);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Preview / Test Redirect</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Enter a slug or short URL to preview the redirect resolution.
        </Typography>
        <TextField
          value={testUrl}
          onChange={(e) => setTestUrl(e.target.value)}
          placeholder="pride-zrh or https://queer.guide/go/pride-zrh"
          fullWidth
          size="small"
          onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
        />
        <MuiButton sx={{ mt: 1 }} variant="outlined" onClick={handlePreview}>
          Test
        </MuiButton>
        {previewResult && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography
              variant="body2"
              sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}
            >
              {previewResult}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <MuiButton onClick={onClose}>Close</MuiButton>
      </DialogActions>
    </Dialog>
  );
}
