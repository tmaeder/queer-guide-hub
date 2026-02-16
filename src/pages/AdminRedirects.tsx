import { useState, useEffect, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Paper from '@mui/material/Paper';
import Switch from '@mui/material/Switch';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Skeleton from '@mui/material/Skeleton';
import Snackbar from '@mui/material/Snackbar';
import InputAdornment from '@mui/material/InputAdornment';
import {
  Plus, Search, Copy, ExternalLink, Download, Upload,
  Trash2, Edit2, Eye, BarChart3, Link2, ArrowRight, QrCode,
  AlertTriangle, Clock, X,
} from 'lucide-react';
import { useRedirects, type Redirect, type RedirectFormData, type RedirectType, type QueryMode, type RedirectEvent } from '@/hooks/useRedirects';
import { validateSlug, validateTarget, validateSourcePath, detectLoop, mergeQueryParams } from '@/lib/redirects/validation';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const SUPABASE_URL = 'https://xqeacpakadqfxjxjcewc.supabase.co';

// ── Main Page Component ─────────────────────────────────────────────────────

export default function AdminRedirects() {
  const {
    redirects, loading, total, error,
    fetchRedirects, createRedirect, updateRedirect, deleteRedirect, toggleEnabled,
    fetchEvents, bulkImport, exportAll,
  } = useRedirects();
  const { toast } = useToast();

  // Table state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<RedirectType | ''>('');
  const [filterEnabled, setFilterEnabled] = useState<boolean | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [eventsDialogId, setEventsDialogId] = useState<string | null>(null);
  const [events, setEvents] = useState<RedirectEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Snackbar
  const [snackMsg, setSnackMsg] = useState('');

  // Debounced search
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const doFetch = useCallback(() => {
    fetchRedirects(
      { search: searchQuery, type: filterType || undefined, is_enabled: filterEnabled },
      page,
      rowsPerPage,
    );
  }, [fetchRedirects, searchQuery, filterType, filterEnabled, page, rowsPerPage]);

  useEffect(() => { doFetch(); }, [doFetch]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setPage(0);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchRedirects(
        { search: val, type: filterType || undefined, is_enabled: filterEnabled },
        0,
        rowsPerPage,
      );
    }, 300);
  };

  // ── Event handlers ──────────────────────────────────────────────────

  const handleToggle = async (r: Redirect) => {
    const ok = await toggleEnabled(r.id, !r.is_enabled);
    if (ok) doFetch();
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    const ok = await deleteRedirect(deleteConfirmId);
    if (ok) {
      setSnackMsg('Redirect deleted');
      doFetch();
    }
    setDeleteConfirmId(null);
  };

  const handleCopyShortUrl = (slug: string) => {
    const url = `https://queer.guide/go/${slug}`;
    navigator.clipboard.writeText(url);
    setSnackMsg('Short URL copied!');
  };

  const handleShowEvents = async (redirectId: string) => {
    setEventsDialogId(redirectId);
    setEventsLoading(true);
    const data = await fetchEvents(redirectId);
    setEvents(data);
    setEventsLoading(false);
  };

  const handleExport = async () => {
    try {
      const all = await exportAll();
      const headers = ['type', 'slug', 'source_path', 'target', 'status_code', 'is_enabled', 'click_count', 'notes'];
      const csv = [
        headers.join(','),
        ...all.map(r =>
          headers.map(h => {
            const val = (r as any)[h];
            if (val === null || val === undefined) return '';
            const s = String(val);
            return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
          }).join(',')
        ),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `redirects-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setSnackMsg('CSV exported');
    } catch (err: any) {
      toast({ title: 'Export failed', description: err.message, variant: 'destructive' });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h5" fontWeight={700}>Redirects & Short Links</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" startIcon={<Upload size={16} />} onClick={() => setBulkDialogOpen(true)}>
            Import
          </Button>
          <Button size="small" variant="outlined" startIcon={<Download size={16} />} onClick={handleExport}>
            Export
          </Button>
          <Button size="small" variant="outlined" startIcon={<Eye size={16} />} onClick={() => setPreviewOpen(true)}>
            Preview
          </Button>
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => { setEditingId(null); setDialogOpen(true); }}>
            New Redirect
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="Search slug, path, target, notes..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          sx={{ minWidth: 280 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment>,
          }}
        />
        <TextField
          select
          size="small"
          label="Type"
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value as any); setPage(0); }}
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="SHORT">Short Link</MenuItem>
          <MenuItem value="PATH">Path Redirect</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="Status"
          value={filterEnabled === null ? '' : filterEnabled ? 'enabled' : 'disabled'}
          onChange={(e) => {
            const v = e.target.value;
            setFilterEnabled(v === '' ? null : v === 'enabled');
            setPage(0);
          }}
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="enabled">Enabled</MenuItem>
          <MenuItem value="disabled">Disabled</MenuItem>
        </TextField>
      </Box>

      {/* Table */}
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Source</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Target</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Code</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Clicks</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Enabled</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton variant="text" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : redirects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No redirects found. Create your first one!
                </TableCell>
              </TableRow>
            ) : (
              redirects.map((r) => (
                <TableRow key={r.id} hover sx={{ opacity: r.is_enabled ? 1 : 0.5 }}>
                  <TableCell>
                    <Chip
                      label={r.type}
                      size="small"
                      color={r.type === 'SHORT' ? 'primary' : 'secondary'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Tooltip title={r.type === 'SHORT' ? `/go/${r.slug}` : r.source_path || ''}>
                      <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {r.type === 'SHORT' ? `/go/${r.slug}` : r.source_path}
                      </Box>
                    </Tooltip>
                    {r.start_at || r.end_at ? (
                      <Tooltip title={`Schedule: ${r.start_at ? format(new Date(r.start_at), 'MMM d') : '∞'} → ${r.end_at ? format(new Date(r.end_at), 'MMM d') : '∞'}`}>
                        <Clock size={12} style={{ marginLeft: 4, verticalAlign: 'middle', color: '#888' }} />
                      </Tooltip>
                    ) : null}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Tooltip title={r.target}>
                      <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {r.target}
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={r.status_code} size="small" variant="outlined"
                      color={r.status_code === 301 ? 'success' : 'warning'}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Box
                      component="span"
                      sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                      onClick={() => handleShowEvents(r.id)}
                    >
                      {r.click_count.toLocaleString()}
                      {r.click_limit ? <span style={{ color: '#888' }}> / {r.click_limit}</span> : null}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      size="small"
                      checked={r.is_enabled}
                      onChange={() => handleToggle(r)}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      {r.type === 'SHORT' && r.slug && (
                        <Tooltip title="Copy short URL">
                          <IconButton size="small" onClick={() => handleCopyShortUrl(r.slug!)}>
                            <Copy size={14} />
                          </IconButton>
                        </Tooltip>
                      )}
                      {r.type === 'SHORT' && r.slug && (
                        <Tooltip title="Test redirect">
                          <IconButton
                            size="small"
                            component="a"
                            href={`${SUPABASE_URL}/functions/v1/redirect-handler?slug=${r.slug}`}
                            target="_blank"
                            rel="noopener"
                          >
                            <ExternalLink size={14} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Analytics">
                        <IconButton size="small" onClick={() => handleShowEvents(r.id)}>
                          <BarChart3 size={14} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => { setEditingId(r.id); setDialogOpen(true); }}>
                          <Edit2 size={14} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => setDeleteConfirmId(r.id)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </TableContainer>

      {/* Create / Edit Dialog */}
      <RedirectFormDialog
        open={dialogOpen}
        editingId={editingId}
        redirects={redirects}
        onClose={() => setDialogOpen(false)}
        onSave={async (formData) => {
          if (editingId) {
            const updated = await updateRedirect(editingId, formData);
            if (updated) { setSnackMsg('Redirect updated'); doFetch(); setDialogOpen(false); }
          } else {
            const created = await createRedirect(formData);
            if (created) { setSnackMsg('Redirect created'); doFetch(); setDialogOpen(false); }
          }
        }}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)}>
        <DialogTitle>Delete Redirect?</DialogTitle>
        <DialogContent>
          <Typography>This will permanently delete this redirect and all its analytics events. This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Events / Analytics Dialog */}
      <Dialog open={!!eventsDialogId} onClose={() => setEventsDialogId(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Click Analytics
          <IconButton size="small" onClick={() => setEventsDialogId(null)}><X size={18} /></IconButton>
        </DialogTitle>
        <DialogContent>
          {eventsLoading ? (
            <Box sx={{ py: 3 }}><Skeleton variant="rectangular" height={200} /></Box>
          ) : events.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>No click events recorded yet.</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Country</TableCell>
                  <TableCell>Referer</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {format(new Date(e.ts), 'MMM d, HH:mm:ss')}
                    </TableCell>
                    <TableCell>{e.country || '—'}</TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                      {e.referer || '—'}
                    </TableCell>
                    <TableCell><Chip label={e.status} size="small" /></TableCell>
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
            setSnackMsg(`Imported ${result.success} redirect(s)`);
            doFetch();
          }
          return result;
        }}
      />

      {/* Preview / Test Dialog */}
      <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} />

      {/* Snackbar */}
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
  editingId: string | null;
  redirects: Redirect[];
  onClose: () => void;
  onSave: (data: RedirectFormData) => Promise<void>;
}

function RedirectFormDialog({ open, editingId, redirects, onClose, onSave }: RedirectFormDialogProps) {
  const existing = editingId ? redirects.find(r => r.id === editingId) : null;

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

  // Reset form when dialog opens
  useEffect(() => {
    if (open && existing) {
      setType(existing.type);
      setSlug(existing.slug || '');
      setSourcePath(existing.source_path || '');
      setMatchKind(existing.match_kind);
      setTarget(existing.target);
      setStatusCode(existing.status_code);
      setIsEnabled(existing.is_enabled);
      setQueryMode(existing.query_mode);
      setQueryOverride(existing.query_override ? JSON.stringify(existing.query_override) : '');
      setUtmDefaults(existing.utm_defaults ? JSON.stringify(existing.utm_defaults) : '');
      setStartAt(existing.start_at ? existing.start_at.substring(0, 16) : '');
      setEndAt(existing.end_at ? existing.end_at.substring(0, 16) : '');
      setClickLimit(existing.click_limit ? String(existing.click_limit) : '');
      setNotes(existing.notes || '');
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
  }, [open, existing]);

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
      const loop = detectLoop(
        type === 'SHORT' ? `/go/${slug}` : sourcePath,
        target,
      );
      if (!loop.safe) errs.target = loop.error!;
    }

    if (queryOverride) {
      try { JSON.parse(queryOverride); }
      catch { errs.queryOverride = 'Must be valid JSON'; }
    }
    if (utmDefaults) {
      try { JSON.parse(utmDefaults); }
      catch { errs.utmDefaults = 'Must be valid JSON'; }
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
      <DialogTitle>{editingId ? 'Edit Redirect' : 'New Redirect'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {/* Type selector */}
        <Tabs value={type} onChange={(_, v) => setType(v)} sx={{ mb: 1 }}>
          <Tab value="SHORT" label="Short Link" icon={<Link2 size={16} />} iconPosition="start" />
          <Tab value="PATH" label="Path Redirect" icon={<ArrowRight size={16} />} iconPosition="start" />
        </Tabs>

        {/* Slug or source path */}
        {type === 'SHORT' ? (
          <TextField
            label="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            error={!!validationErrors.slug}
            helperText={validationErrors.slug || `Short URL: queer.guide/go/${slug || '...'}`}
            InputProps={{
              startAdornment: <InputAdornment position="start">/go/</InputAdornment>,
            }}
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

        {/* Target */}
        <TextField
          label="Target URL"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          error={!!validationErrors.target}
          helperText={validationErrors.target || 'Relative path (/page) or allowlisted absolute URL'}
          placeholder="/events/pride-zurich-2026"
          fullWidth
        />

        {/* Status code + enabled */}
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
          helperText={validationErrors.utmDefaults || 'Added if not already present, e.g. {"utm_source":"qr","utm_medium":"print"}'}
          size="small"
          fullWidth
        />

        {/* Schedule */}
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
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Bulk Import Dialog ──────────────────────────────────────────────────────

interface BulkImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (items: Array<{ slug?: string; source_path?: string; target: string; status_code?: number; is_enabled?: boolean }>) => Promise<{ success: number; errors: string[] }>;
}

function BulkImportDialog({ open, onClose, onImport }: BulkImportDialogProps) {
  const [csvText, setCsvText] = useState('');
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    try {
      const lines = csvText.trim().split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        setResult({ success: 0, errors: ['Need at least a header row and one data row'] });
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const items = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj: any = {};
        headers.forEach((h, i) => {
          if (h === 'slug') obj.slug = values[i];
          if (h === 'source_path') obj.source_path = values[i];
          if (h === 'target') obj.target = values[i];
          if (h === 'status_code') obj.status_code = parseInt(values[i], 10) || 301;
          if (h === 'is_enabled') obj.is_enabled = values[i] !== 'false' && values[i] !== '0';
        });
        return obj;
      }).filter(item => item.target);

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
              <Alert severity="success" sx={{ mb: 1 }}>Imported {result.success} redirect(s)</Alert>
            )}
            {result.errors.length > 0 && (
              <Alert severity="error">
                {result.errors.map((e, i) => <div key={i}>{e}</div>)}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={handleImport} disabled={importing || !csvText.trim()}>
          {importing ? 'Importing...' : 'Import'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Preview / Test Dialog ───────────────────────────────────────────────────

function PreviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [testUrl, setTestUrl] = useState('');
  const [previewResult, setPreviewResult] = useState<string | null>(null);

  const handlePreview = () => {
    // Extract slug from /go/ URL or just test a raw slug
    let slug = testUrl.trim();
    if (slug.includes('/go/')) {
      slug = slug.split('/go/')[1]?.split('?')[0] || '';
    }
    if (!slug) {
      setPreviewResult('Enter a slug or /go/<slug> URL');
      return;
    }
    // The actual resolution would need a server call; show the edge function URL
    const edgeUrl = `${SUPABASE_URL}/functions/v1/redirect-handler?slug=${encodeURIComponent(slug)}`;
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
        <Button sx={{ mt: 1 }} variant="outlined" onClick={handlePreview}>
          Test
        </Button>
        {previewResult && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
              {previewResult}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
