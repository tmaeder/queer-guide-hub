/**
 * ContentListPanel — Paginated list view for a single content type.
 * Server-side pagination, debounced search, column sorting, bulk selection,
 * relative dates, status indicators, and polished empty states.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import Menu from '@mui/material/Menu';
import FormControlLabel from '@mui/material/FormControlLabel';
import Divider from '@mui/material/Divider';
import {
  Plus,
  Search,
  Edit,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Inbox,
  X,
  Columns3,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useParams } from 'react-router';
import { getContentType } from '@/config/contentTypeRegistry';
import { AdminShellContext } from '@/components/admin/shell/AdminShell';
import { useContext, lazy, Suspense } from 'react';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';

const BulkEnrichDialog = lazy(() => import('@/components/admin/BulkEnrichDialog'));
const BulkActionsBar = lazy(() =>
  import('./BulkActionsBar').then((m) => ({ default: m.BulkActionsBar })),
);

/** Safe hook: returns AdminShell context or no-op fallback (for use outside AdminShell) */
function useAdminShellSafe() {
  const ctx = useContext(AdminShellContext);
  return ctx ?? { openEditor: () => {}, closeEditor: () => {} };
}

// ── Types ───────────────────────────────────────────────────────────

interface ContentListPanelProps {
  /** Content type ID or undefined for "all content". Falls back to URL :type param. */
  contentTypeId?: string;
  /** Called when editing an item. Falls back to AdminShell context. */
  onEdit?: (contentType: string, itemId: string) => void;
  /** Called when creating an item. Falls back to AdminShell context. */
  onCreate?: (contentType: string) => void;
}

interface ListItem {
  id: string;
  title: string;
  description?: string;
  updatedAt?: string;
  contentType: string;
  contentTypeLabel: string;
  contentTypeColor: string;
  status?: string;
  raw?: Record<string, unknown>;
}

type SortField = string;
type SortDir = 'asc' | 'desc';

type DateRange = { from?: string; to?: string };
type NumberRange = { min?: number; max?: number };
type FilterValue = string | boolean | DateRange | NumberRange | undefined;
type FilterState = Record<string, FilterValue>;

function loadPersistedState(key: string): {
  sortField?: SortField;
  sortDir?: SortDir;
  filters?: FilterState;
  hiddenColumns?: string[];
} | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistState(
  key: string,
  state: {
    sortField: SortField;
    sortDir: SortDir;
    filters: FilterState;
    hiddenColumns: string[];
  },
) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* sessionStorage unavailable */
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  const d = new Date(dateStr);
  const thisYear = new Date().getFullYear();
  if (d.getFullYear() === thisYear) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Get the status/workflow field value from raw row data. */
function extractStatus(row: Record<string, unknown>, _ct: ContentTypeConfig): string | undefined {
  // CMS pages have workflow_state
  if ('workflow_state' in row && typeof row.workflow_state === 'string') return row.workflow_state;
  // Events and marketplace have status
  if ('status' in row && typeof row.status === 'string') return row.status;
  // Personalities have visibility
  if ('visibility' in row && typeof row.visibility === 'string') return row.visibility;
  // Personalities have verification_status
  if ('verification_status' in row && typeof row.verification_status === 'string')
    return row.verification_status;
  return undefined;
}

function getStatusColor(status: string | undefined): string {
  if (!status) return 'transparent';
  const s = status.toLowerCase();
  if (['published', 'active', 'public', 'verified'].includes(s)) return '#10b981';
  if (['draft', 'pending'].includes(s)) return '#9ca3af';
  if (['review', 'restricted'].includes(s)) return '#f59e0b';
  if (['archived', 'expired', 'sold', 'completed', 'rejected'].includes(s)) return '#6b7280';
  if (['cancelled'].includes(s)) return '#ef4444';
  return '#9ca3af';
}

function getStatusLabel(status: string | undefined): string {
  if (!status) return '';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ── Skeleton rows ───────────────────────────────────────────────────

function TableSkeleton({ columns }: { columns: number }) {
  return (
    <>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <TableRow key={i}>
          {/* Checkbox */}
          <TableCell sx={{ width: 42 }}>
            <Skeleton variant="rectangular" width={18} height={18} sx={{ borderRadius: 0.5 }} />
          </TableCell>
          {/* Title */}
          <TableCell>
            <Skeleton variant="text" width={`${55 + (i % 3) * 15}%`} height={20} />
            <Skeleton variant="text" width={`${30 + (i % 2) * 20}%`} height={14} sx={{ mt: 0.3 }} />
          </TableCell>
          {/* Type (optional) */}
          {columns >= 4 && (
            <TableCell>
              <Skeleton variant="rounded" width={70} height={20} />
            </TableCell>
          )}
          {/* Status */}
          <TableCell>
            <Skeleton variant="circular" width={8} height={8} sx={{ display: 'inline-block' }} />
          </TableCell>
          {/* Updated */}
          <TableCell>
            <Skeleton variant="text" width={60} height={16} />
          </TableCell>
          {/* Actions */}
          <TableCell align="right">
            <Skeleton variant="circular" width={24} height={24} />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ── Empty state ─────────────────────────────────────────────────────

function EmptyState({
  config,
  hasSearch,
  onClearSearch,
  onCreate,
}: {
  config: ContentTypeConfig | null;
  hasSearch: boolean;
  onClearSearch: () => void;
  onCreate: () => void;
}) {
  const Icon = config?.icon;
  const color = config?.color || '#6b7280';

  return (
    <Box
      sx={{
        py: 8,
        px: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      {/* Large icon in tinted circle */}
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: alpha(color, 0.08),
          mb: 2.5,
        }}
      >
        {Icon ? (
          <Icon size={32} style={{ color, opacity: 0.7 }} />
        ) : (
          <Inbox size={32} style={{ color, opacity: 0.7 }} />
        )}
      </Box>

      {hasSearch ? (
        <>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
            No results found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 360 }}>
            Try adjusting your search query or clear the filter to see all items.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<X size={14} />}
            onClick={onClearSearch}
          >
            Clear Search
          </Button>
        </>
      ) : (
        <>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
            No {config ? config.label.plural.toLowerCase() : 'items'} yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, maxWidth: 360 }}>
            {config
              ? `Create your first ${config.label.singular.toLowerCase()} to get started.`
              : 'Content you create will appear here.'}
          </Typography>
          {config && (
            <Button
              variant="contained"
              startIcon={<Plus size={16} />}
              onClick={onCreate}
              sx={{ textTransform: 'none' }}
            >
              Create {config.label.singular}
            </Button>
          )}
        </>
      )}
    </Box>
  );
}

// ── Sort header cell ────────────────────────────────────────────────

function SortableHeader({
  label,
  field,
  currentField,
  currentDir,
  onSort,
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const isActive = currentField === field;

  return (
    <TableCell
      sx={{
        fontWeight: 600,
        cursor: 'pointer',
        userSelect: 'none',
        '&:hover': { color: 'primary.main' },
        transition: 'color 0.15s',
      }}
      onClick={() => onSort(field)}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {label}
        {isActive ? (
          currentDir === 'asc' ? (
            <ArrowUp size={14} style={{ opacity: 0.8 }} />
          ) : (
            <ArrowDown size={14} style={{ opacity: 0.8 }} />
          )
        ) : (
          <ArrowUpDown size={14} style={{ opacity: 0.3 }} />
        )}
      </Box>
    </TableCell>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function ContentListPanel({
  contentTypeId: propTypeId,
  onEdit: propOnEdit,
  onCreate: propOnCreate,
}: ContentListPanelProps) {
  // Support route-based usage: /admin/content/:type
  const { type: routeType } = useParams<{ type?: string }>();

  // Use AdminShell context for editor if no callbacks provided
  const { openEditor } = useAdminShellSafe();

  const contentTypeId = propTypeId ?? routeType;
  const onEdit = propOnEdit ?? ((ct: string, id: string) => openEditor(ct, id));
  const onCreate = propOnCreate ?? ((ct: string) => openEditor(ct, null));

  const config = contentTypeId ? getContentType(contentTypeId) : null;
  const typeColor = config?.color || '#6b7280';

  const persistKey = contentTypeId ? `cms-list:${contentTypeId}` : null;
  const persisted = useMemo(() => (persistKey ? loadPersistedState(persistKey) : null), [persistKey]);

  const initialSortField: SortField =
    persisted?.sortField ?? config?.defaultSort?.field ?? 'updated_at';
  const initialSortDir: SortDir = persisted?.sortDir ?? config?.defaultSort?.dir ?? 'desc';

  const [items, setItems] = useState<ListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortField, setSortField] = useState<SortField>(initialSortField);
  const [sortDir, setSortDir] = useState<SortDir>(initialSortDir);
  const [filters, setFilters] = useState<FilterState>(persisted?.filters ?? {});
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(persisted?.hiddenColumns ?? []);
  const [columnsMenuAnchor, setColumnsMenuAnchor] = useState<HTMLElement | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const allListColumns: FieldConfig[] = useMemo(
    () => (config?.fields ?? []).filter((f) => f.listColumn),
    [config],
  );
  const extraColumns: FieldConfig[] = useMemo(
    () => allListColumns.filter((f) => !hiddenColumns.includes(f.name)),
    [allListColumns, hiddenColumns],
  );
  const filterFields: FieldConfig[] = useMemo(
    () => (config?.fields ?? []).filter((f) => f.filterable),
    [config],
  );

  // Persist filter+sort+columns per content type
  useEffect(() => {
    if (persistKey) persistState(persistKey, { sortField, sortDir, filters, hiddenColumns });
  }, [persistKey, sortField, sortDir, filters, hiddenColumns]);

  // ── Debounced search ──────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // ── Data loading ──────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      if (contentTypeId && config) {
        await loadSingleType(config);
      } else {
        await loadAllTypes();
      }
    } catch (err) {
      console.error('Error loading content:', err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAllTypes/loadSingleType defined below, deps control re-fetching
  }, [contentTypeId, config, page, rowsPerPage, debouncedSearch, sortField, sortDir, filters]);

  async function loadSingleType(ct: ContentTypeConfig) {
    const from = page * rowsPerPage;
    const to = from + rowsPerPage - 1;

    // Map sort field to actual DB column
    const dbSortField = sortField === 'title' ? ct.titleField : sortField;

    let query = supabase
      .from(ct.tableName as 'events')
      .select('*', { count: 'exact' })
      .order(dbSortField, { ascending: sortDir === 'asc' })
      .range(from, to);

    if (debouncedSearch) {
      query = query.ilike(ct.titleField, `%${debouncedSearch}%`);
    }

    // Apply entity filters
    for (const f of ct.fields.filter((x) => x.filterable)) {
      const val = filters[f.name];
      if (val === undefined || val === '' || val === null) continue;
      if (f.type === 'select' || f.type === 'boolean') {
        query = query.eq(f.name, val as string | boolean);
      } else if (f.type === 'datetime' || f.type === 'date') {
        const range = val as DateRange;
        if (range.from) query = query.gte(f.name, range.from);
        if (range.to) query = query.lte(f.name, range.to);
      } else if (f.type === 'number') {
        const range = val as NumberRange;
        if (range.min !== undefined) query = query.gte(f.name, range.min);
        if (range.max !== undefined) query = query.lte(f.name, range.max);
      } else if (f.type === 'text') {
        query = query.ilike(f.name, `%${val as string}%`);
      }
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const mapped = (data || []).map((row: Record<string, unknown>) => ({
      id: row[ct.primaryKey] as string,
      title: (row[ct.titleField] as string) || '(Untitled)',
      description: ct.descriptionField ? (row[ct.descriptionField] as string | undefined) : undefined,
      updatedAt: row.updated_at as string | undefined,
      contentType: ct.id,
      contentTypeLabel: ct.label.singular,
      contentTypeColor: ct.color,
      status: extractStatus(row, ct),
      raw: row,
    }));

    setItems(mapped);
    setTotalCount(count ?? 0);
  }

  async function loadAllTypes() {
    const allItems: ListItem[] = [];
    const configs = [
      'venues',
      'events',
      'personalities',
      'news_articles',
      'cities',
      'countries',
      'unified_tags',
      'marketplace_listings',
      'community_groups',
      'hotels',
      'queer_villages',
      'cms_pages',
    ]
      .map((id) => getContentType(id))
      .filter(Boolean) as ContentTypeConfig[];

    for (const ct of configs) {
      let query = supabase
        .from(ct.tableName as 'events')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .limit(100);

      if (debouncedSearch) {
        query = query.ilike(ct.titleField, `%${debouncedSearch}%`);
      }

      const { data } = await query;

      const mapped = (data || []).map((row: Record<string, unknown>) => ({
        id: row[ct.primaryKey],
        title: row[ct.titleField] || '(Untitled)',
        description: ct.descriptionField ? row[ct.descriptionField] : undefined,
        updatedAt: row.updated_at,
        contentType: ct.id,
        contentTypeLabel: ct.label.singular,
        contentTypeColor: ct.color,
        status: extractStatus(row, ct),
      }));

      allItems.push(...mapped);
    }

    // Sort
    allItems.sort((a, b) => {
      if (sortField === 'title') {
        const cmp = (a.title || '').localeCompare(b.title || '');
        return sortDir === 'asc' ? cmp : -cmp;
      }
      // Default: updated_at
      if (!a.updatedAt) return 1;
      if (!b.updatedAt) return -1;
      const cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      return sortDir === 'asc' ? cmp : -cmp;
    });

    setTotalCount(allItems.length);
    const from = page * rowsPerPage;
    setItems(allItems.slice(from, from + rowsPerPage));
  }

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Reset page on search/filter change
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [debouncedSearch, filters]);

  // On content type change, restore persisted state (or defaults) and reset
  const lastTypeRef = useRef<string | undefined>(contentTypeId);
  useEffect(() => {
    if (lastTypeRef.current === contentTypeId) return;
    lastTypeRef.current = contentTypeId;
    setPage(0);
    setSelected(new Set());
    const p = persistKey ? loadPersistedState(persistKey) : null;
    setSortField(p?.sortField ?? config?.defaultSort?.field ?? 'updated_at');
    setSortDir(p?.sortDir ?? config?.defaultSort?.dir ?? 'desc');
    setFilters(p?.filters ?? {});
    setHiddenColumns(p?.hiddenColumns ?? []);
  }, [contentTypeId, persistKey, config]);

  // Clear selection on page change
  useEffect(() => {
    setSelected(new Set());
  }, [page]);

  // ── Sort handler ──────────────────────────────────────────────

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'title' ? 'asc' : 'desc');
    }
    setPage(0);
  }

  // ── Selection handlers ────────────────────────────────────────

  const allVisibleIds = useMemo(() => items.map((it) => `${it.contentType}-${it.id}`), [items]);
  const allSelected = items.length > 0 && allVisibleIds.every((id) => selected.has(id));
  const someSelected = allVisibleIds.some((id) => selected.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allVisibleIds));
    }
  }

  function toggleSelect(itemKey: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }
      return next;
    });
  }

  // ── Column count ──────────────────────────────────────────────

  // checkbox + title + extras + (type?) + status + updated + actions
  const colCount = (contentTypeId ? 5 : 6) + extraColumns.length;

  const Icon = config?.icon;

  function setFilter(name: string, value: FilterValue) {
    setFilters((prev) => {
      const next = { ...prev };
      if (value === undefined || value === '' || value === null) {
        delete next[name];
      } else {
        next[name] = value;
      }
      return next;
    });
  }

  function clearFilters() {
    setFilters({});
  }

  function renderColumnValue(field: FieldConfig, row: Record<string, unknown> | undefined) {
    if (!row) return null;
    const v = row[field.name];
    if (v === null || v === undefined || v === '') {
      return (
        <Typography variant="caption" color="text.disabled">
          --
        </Typography>
      );
    }
    if (field.type === 'datetime' || field.type === 'date') {
      const s = String(v);
      return (
        <Tooltip title={new Date(s).toLocaleString()} placement="top">
          <Typography variant="caption" color="text.secondary">
            {relativeTime(s)}
          </Typography>
        </Tooltip>
      );
    }
    if (field.type === 'select') {
      const opt = field.options?.find((o) => o.value === v);
      const color = field.name === 'category' ? (config?.color ?? '#6b7280') : '#6b7280';
      return (
        <Chip
          label={opt?.label ?? String(v)}
          size="small"
          sx={{
            height: 20,
            fontSize: '0.7rem',
            fontWeight: 600,
            bgcolor: alpha(color, 0.1),
            color,
          }}
        />
      );
    }
    if (field.type === 'boolean') {
      return (
        <Typography variant="caption" color="text.secondary">
          {v ? 'Yes' : 'No'}
        </Typography>
      );
    }
    if (field.type === 'number') {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isNaN(n)) {
        return (
          <Typography variant="caption" color="text.disabled">
            --
          </Typography>
        );
      }
      const formatted = n >= 0 && n <= 1 ? n.toFixed(2) : n.toLocaleString();
      return (
        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
          {formatted}
        </Typography>
      );
    }
    if (field.type === 'tags' && Array.isArray(v)) {
      if (v.length === 0) {
        return (
          <Typography variant="caption" color="text.disabled">
            --
          </Typography>
        );
      }
      const shown = v.slice(0, 3);
      const remaining = v.length - shown.length;
      return (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {shown.map((tag) => (
            <Chip
              key={String(tag)}
              label={String(tag)}
              size="small"
              sx={{ height: 18, fontSize: '0.65rem' }}
            />
          ))}
          {remaining > 0 && (
            <Typography variant="caption" color="text.secondary">
              +{remaining}
            </Typography>
          )}
        </Box>
      );
    }
    return (
      <Typography variant="body2" sx={{ fontSize: '0.8rem' }} noWrap>
        {String(v)}
      </Typography>
    );
  }

  return (
    <Box>
      {/* ── Header ──────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {Icon && (
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: alpha(typeColor, 0.12),
                flexShrink: 0,
              }}
            >
              <Icon size={16} style={{ color: typeColor }} />
            </Box>
          )}
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {config ? config.label.plural : 'All Content'}
          </Typography>
          {!loading && (
            <Chip
              label={totalCount.toLocaleString()}
              size="small"
              sx={{
                height: 22,
                fontSize: '0.75rem',
                fontWeight: 600,
                bgcolor: alpha(typeColor, 0.08),
                color: typeColor,
              }}
            />
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh">
            <IconButton
              size="small"
              onClick={() => loadItems()}
              sx={{ transition: 'transform 0.3s', '&:active': { transform: 'rotate(180deg)' } }}
            >
              <RefreshCw size={16} />
            </IconButton>
          </Tooltip>
          <Suspense fallback={null}>
            <BulkEnrichDialog onComplete={() => loadItems()} />
          </Suspense>
          {config && (
            <Button
              variant="contained"
              size="small"
              startIcon={<Plus size={16} />}
              onClick={() => onCreate(config.id)}
              sx={{ textTransform: 'none' }}
            >
              New {config.label.singular}
            </Button>
          )}
        </Stack>
      </Box>

      {/* ── Toolbar: search + bulk action hint ──────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <TextField
          size="small"
          placeholder={
            config ? `Search ${config.label.plural.toLowerCase()}...` : 'Search all content...'
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: '100%', sm: 320 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearch('')} edge="end">
                    <X size={14} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
        />
        {selected.size > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {selected.size} selected
          </Typography>
        )}
        {contentTypeId && allListColumns.length > 0 && (
          <Box sx={{ ml: 'auto' }}>
            <Tooltip title="Columns">
              <Button
                size="small"
                variant="outlined"
                startIcon={<Columns3 size={14} />}
                onClick={(e) => setColumnsMenuAnchor(e.currentTarget)}
                sx={{ textTransform: 'none' }}
              >
                Columns
                {hiddenColumns.length > 0 && (
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ ml: 0.5, color: 'text.secondary' }}
                  >
                    ({allListColumns.length - hiddenColumns.length}/{allListColumns.length})
                  </Typography>
                )}
              </Button>
            </Tooltip>
            <Menu
              anchorEl={columnsMenuAnchor}
              open={Boolean(columnsMenuAnchor)}
              onClose={() => setColumnsMenuAnchor(null)}
              slotProps={{ paper: { sx: { minWidth: 220 } } }}
            >
              <Box sx={{ px: 2, py: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Visible columns
                </Typography>
              </Box>
              <Divider />
              {allListColumns.map((f) => {
                const visible = !hiddenColumns.includes(f.name);
                return (
                  <MenuItem
                    key={f.name}
                    dense
                    onClick={() =>
                      setHiddenColumns((prev) =>
                        visible ? [...prev, f.name] : prev.filter((n) => n !== f.name),
                      )
                    }
                  >
                    <FormControlLabel
                      control={<Checkbox size="small" checked={visible} sx={{ p: 0.5 }} />}
                      label={
                        <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                          {f.label}
                        </Typography>
                      }
                      sx={{ m: 0, pointerEvents: 'none' }}
                    />
                  </MenuItem>
                );
              })}
              {hiddenColumns.length > 0 && (
                <>
                  <Divider />
                  <MenuItem dense onClick={() => setHiddenColumns([])}>
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                      Show all
                    </Typography>
                  </MenuItem>
                </>
              )}
            </Menu>
          </Box>
        )}
      </Box>

      {/* ── Entity filters ──────────────────────────────────────── */}
      {filterFields.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1.25,
            mb: 2,
          }}
        >
          {filterFields.map((f) => {
            const val = filters[f.name];
            if (f.type === 'select') {
              return (
                <Select
                  key={f.name}
                  size="small"
                  displayEmpty
                  value={(val as string) ?? ''}
                  onChange={(e) => setFilter(f.name, e.target.value || undefined)}
                  sx={{ minWidth: 140, fontSize: '0.85rem' }}
                  renderValue={(v) =>
                    v
                      ? (f.options?.find((o) => o.value === v)?.label ?? String(v))
                      : `All ${f.label}`
                  }
                >
                  <MenuItem value="">
                    <em>All {f.label}</em>
                  </MenuItem>
                  {f.options?.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              );
            }
            if (f.type === 'boolean') {
              const sv = val === undefined ? '' : val ? 'true' : 'false';
              return (
                <Select
                  key={f.name}
                  size="small"
                  displayEmpty
                  value={sv}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFilter(f.name, v === '' ? undefined : v === 'true');
                  }}
                  sx={{ minWidth: 130, fontSize: '0.85rem' }}
                  renderValue={(v) =>
                    v === 'true' ? f.label : v === 'false' ? `Not ${f.label}` : `Any ${f.label}`
                  }
                >
                  <MenuItem value="">
                    <em>Any {f.label}</em>
                  </MenuItem>
                  <MenuItem value="true">{f.label}</MenuItem>
                  <MenuItem value="false">Not {f.label}</MenuItem>
                </Select>
              );
            }
            if (f.type === 'datetime' || f.type === 'date') {
              const range = (val as DateRange | undefined) ?? {};
              return (
                <Box
                  key={f.name}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
                >
                  <TextField
                    size="small"
                    type="date"
                    label={`${f.label} from`}
                    InputLabelProps={{ shrink: true }}
                    value={range.from?.slice(0, 10) ?? ''}
                    onChange={(e) =>
                      setFilter(f.name, {
                        ...range,
                        from: e.target.value ? `${e.target.value}T00:00:00Z` : undefined,
                      })
                    }
                    sx={{ width: 160 }}
                  />
                  <TextField
                    size="small"
                    type="date"
                    label="to"
                    InputLabelProps={{ shrink: true }}
                    value={range.to?.slice(0, 10) ?? ''}
                    onChange={(e) =>
                      setFilter(f.name, {
                        ...range,
                        to: e.target.value ? `${e.target.value}T23:59:59Z` : undefined,
                      })
                    }
                    sx={{ width: 130 }}
                  />
                </Box>
              );
            }
            if (f.type === 'number') {
              const range = (val as NumberRange | undefined) ?? {};
              const updateRange = (next: NumberRange) => {
                const clean: NumberRange = {};
                if (next.min !== undefined && !Number.isNaN(next.min)) clean.min = next.min;
                if (next.max !== undefined && !Number.isNaN(next.max)) clean.max = next.max;
                setFilter(
                  f.name,
                  clean.min === undefined && clean.max === undefined ? undefined : clean,
                );
              };
              return (
                <Box
                  key={f.name}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
                >
                  <TextField
                    size="small"
                    type="number"
                    label={`${f.label} ≥`}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{
                      min: f.min,
                      max: f.max,
                      step: f.max !== undefined && f.max <= 1 ? 0.05 : 1,
                    }}
                    value={range.min ?? ''}
                    onChange={(e) =>
                      updateRange({
                        ...range,
                        min: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    sx={{ width: 130 }}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="≤"
                    InputLabelProps={{ shrink: true }}
                    inputProps={{
                      min: f.min,
                      max: f.max,
                      step: f.max !== undefined && f.max <= 1 ? 0.05 : 1,
                    }}
                    value={range.max ?? ''}
                    onChange={(e) =>
                      updateRange({
                        ...range,
                        max: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    sx={{ width: 100 }}
                  />
                </Box>
              );
            }
            // text contains
            return (
              <TextField
                key={f.name}
                size="small"
                placeholder={f.label}
                value={(val as string) ?? ''}
                onChange={(e) => setFilter(f.name, e.target.value || undefined)}
                sx={{ width: 180 }}
              />
            );
          })}
          {Object.keys(filters).length > 0 && (
            <Button
              size="small"
              onClick={clearFilters}
              startIcon={<X size={14} />}
              sx={{ textTransform: 'none' }}
            >
              Clear filters
            </Button>
          )}
        </Box>
      )}

      {/* ── Table ───────────────────────────────────────────────── */}
      <Paper sx={{ overflow: 'hidden', borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: 'background.default' } }}>
                {/* Checkbox */}
                <TableCell sx={{ width: 42, pl: 1.5 }}>
                  <Checkbox
                    size="small"
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onChange={toggleSelectAll}
                    sx={{ p: 0.5 }}
                  />
                </TableCell>

                {/* Title — sortable */}
                <SortableHeader
                  label="Title"
                  field="title"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />

                {/* Per-type extra columns */}
                {extraColumns.map((f) =>
                  f.sortable ? (
                    <SortableHeader
                      key={f.name}
                      label={f.label}
                      field={f.name}
                      currentField={sortField}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                  ) : (
                    <TableCell key={f.name} sx={{ fontWeight: 600 }}>
                      {f.label}
                    </TableCell>
                  ),
                )}

                {/* Type (only in "all content" mode) */}
                {!contentTypeId && <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>}

                {/* Status */}
                <TableCell sx={{ fontWeight: 600, width: 90 }}>Status</TableCell>

                {/* Updated — sortable */}
                <SortableHeader
                  label="Updated"
                  field="updated_at"
                  currentField={sortField}
                  currentDir={sortDir}
                  onSort={handleSort}
                />

                {/* Actions */}
                <TableCell align="right" sx={{ fontWeight: 600, width: 60 }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableSkeleton columns={colCount} />
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colCount} sx={{ p: 0, border: 'none' }}>
                    <EmptyState
                      config={config}
                      hasSearch={!!debouncedSearch}
                      onClearSearch={() => setSearch('')}
                      onCreate={() => config && onCreate(config.id)}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const itemKey = `${item.contentType}-${item.id}`;
                  const isSelected = selected.has(itemKey);
                  const rowColor = item.contentTypeColor;
                  const statusColor = getStatusColor(item.status);

                  return (
                    <TableRow
                      key={itemKey}
                      hover
                      selected={isSelected}
                      sx={{
                        cursor: 'pointer',
                        borderLeft: '3px solid transparent',
                        transition: 'border-color 0.15s ease',
                        '&:hover': {
                          borderLeftColor: rowColor,
                        },
                        '&.Mui-selected': {
                          bgcolor: (_theme) => alpha(rowColor, 0.04),
                          '&:hover': {
                            bgcolor: (_theme) => alpha(rowColor, 0.07),
                          },
                        },
                      }}
                      onClick={() => onEdit(item.contentType, item.id)}
                    >
                      {/* Checkbox */}
                      <TableCell sx={{ pl: 1.5 }}>
                        <Checkbox
                          size="small"
                          checked={isSelected}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleSelect(itemKey)}
                          sx={{ p: 0.5 }}
                        />
                      </TableCell>

                      {/* Title + description */}
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
                          {item.title}
                        </Typography>
                        {item.description && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                            sx={{ maxWidth: 360, display: 'block', mt: 0.2 }}
                          >
                            {item.description}
                          </Typography>
                        )}
                      </TableCell>

                      {/* Per-type extra columns */}
                      {extraColumns.map((f) => (
                        <TableCell key={f.name}>{renderColumnValue(f, item.raw)}</TableCell>
                      ))}

                      {/* Type chip (all-content view) */}
                      {!contentTypeId && (
                        <TableCell>
                          <Chip
                            label={item.contentTypeLabel}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              bgcolor: alpha(item.contentTypeColor, 0.1),
                              color: item.contentTypeColor,
                            }}
                          />
                        </TableCell>
                      )}

                      {/* Status dot */}
                      <TableCell>
                        {item.status ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                bgcolor: statusColor,
                                flexShrink: 0,
                              }}
                            />
                            <Typography
                              variant="caption"
                              sx={{ color: statusColor, fontWeight: 500 }}
                            >
                              {getStatusLabel(item.status)}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            --
                          </Typography>
                        )}
                      </TableCell>

                      {/* Updated date — relative */}
                      <TableCell>
                        <Tooltip
                          title={item.updatedAt ? new Date(item.updatedAt).toLocaleString() : ''}
                          placement="top"
                        >
                          <Typography variant="caption" color="text.secondary">
                            {item.updatedAt ? relativeTime(item.updatedAt) : '--'}
                          </Typography>
                        </Tooltip>
                      </TableCell>

                      {/* Actions */}
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(item.contentType, item.id);
                            }}
                            sx={{
                              transition: 'color 0.15s',
                              '&:hover': { color: rowColor },
                            }}
                          >
                            <Edit size={15} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {items.length > 0 && (
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        )}
      </Paper>

      {selected.size > 0 && config && (
        <Suspense fallback={null}>
          <BulkActionsBar
            selections={Array.from(selected).map((id) => ({
              contentType: config.id,
              tableName: config.tableName,
              id,
            }))}
            onClear={() => setSelected(new Set())}
            onComplete={() => loadItems()}
          />
        </Suspense>
      )}
    </Box>
  );
}
