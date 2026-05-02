/**
 * ContentListTable — table rendering for ContentListPanel including
 * sortable headers, skeleton rows, empty state, and per-row cells.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
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
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import { Plus, Edit, ArrowUp, ArrowDown, ArrowUpDown, Inbox, X } from 'lucide-react';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import {
  getStatusColor,
  getStatusLabel,
  relativeTime,
  type ListItem,
  type SortDir,
  type SortField,
} from './types';

// ── Skeleton rows ───────────────────────────────────────────────────

function TableSkeleton({ columns }: { columns: number }) {
  return (
    <>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <TableRow key={i}>
          <TableCell sx={{ width: 42 }}>
            <Skeleton variant="rectangular" width={18} height={18} sx={{ borderRadius: 0.5 }} />
          </TableCell>
          <TableCell>
            <Skeleton variant="text" width={`${55 + (i % 3) * 15}%`} height={20} />
            <Skeleton variant="text" width={`${30 + (i % 2) * 20}%`} height={14} sx={{ mt: 0.3 }} />
          </TableCell>
          {columns >= 4 && (
            <TableCell>
              <Skeleton variant="rounded" width={70} height={20} />
            </TableCell>
          )}
          <TableCell>
            <Skeleton variant="circular" width={8} height={8} sx={{ display: 'inline-block' }} />
          </TableCell>
          <TableCell>
            <Skeleton variant="text" width={60} height={16} />
          </TableCell>
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

// ── Cell renderer ───────────────────────────────────────────────────

function renderColumnValue(
  field: FieldConfig,
  row: Record<string, unknown> | undefined,
  config: ContentTypeConfig | null,
) {
  if (!row) return null;
  if (field.listRender) {
    const node = field.listRender(row);
    if (node === null || node === undefined || node === '') {
      return (
        <Typography variant="caption" color="text.disabled">
          --
        </Typography>
      );
    }
    return node;
  }
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

// ── Main table component ────────────────────────────────────────────

export interface ContentListTableProps {
  contentTypeId?: string;
  config: ContentTypeConfig | null;
  items: ListItem[];
  loading: boolean;
  totalCount: number;
  page: number;
  rowsPerPage: number;
  setPage: (n: number) => void;
  setRowsPerPage: (n: number) => void;
  sortField: SortField;
  sortDir: SortDir;
  handleSort: (field: SortField) => void;
  extraColumns: FieldConfig[];
  selected: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  toggleSelect: (key: string) => void;
  toggleSelectAll: () => void;
  debouncedSearch: string;
  onClearSearch: () => void;
  onEdit: (contentType: string, id: string) => void;
  onCreate: (contentType: string) => void;
}

export function ContentListTable({
  contentTypeId,
  config,
  items,
  loading,
  totalCount,
  page,
  rowsPerPage,
  setPage,
  setRowsPerPage,
  sortField,
  sortDir,
  handleSort,
  extraColumns,
  selected,
  allSelected,
  someSelected,
  toggleSelect,
  toggleSelectAll,
  debouncedSearch,
  onClearSearch,
  onEdit,
  onCreate,
}: ContentListTableProps) {
  // checkbox + title + extras + (type?) + status + updated + actions
  const colCount = (contentTypeId ? 5 : 6) + extraColumns.length;

  return (
    <Paper sx={{ overflow: 'hidden', borderRadius: 2 }}>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: 'background.default' } }}>
              <TableCell sx={{ width: 42, pl: 1.5 }}>
                <Checkbox
                  size="small"
                  checked={allSelected}
                  indeterminate={someSelected && !allSelected}
                  onChange={toggleSelectAll}
                  sx={{ p: 0.5 }}
                />
              </TableCell>

              <SortableHeader
                label="Title"
                field="title"
                currentField={sortField}
                currentDir={sortDir}
                onSort={handleSort}
              />

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

              {!contentTypeId && <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>}

              <TableCell sx={{ fontWeight: 600, width: 90 }}>Status</TableCell>

              <SortableHeader
                label="Updated"
                field="updated_at"
                currentField={sortField}
                currentDir={sortDir}
                onSort={handleSort}
              />

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
                    onClearSearch={onClearSearch}
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
                    <TableCell sx={{ pl: 1.5 }}>
                      <Checkbox
                        size="small"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSelect(itemKey)}
                        sx={{ p: 0.5 }}
                      />
                    </TableCell>

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

                    {extraColumns.map((f) => (
                      <TableCell key={f.name}>{renderColumnValue(f, item.raw, config)}</TableCell>
                    ))}

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
  );
}
