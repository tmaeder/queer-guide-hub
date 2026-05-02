/**
 * ContentListPanel — Paginated list view for a single content type.
 * Server-side pagination, debounced search, column sorting, bulk selection,
 * relative dates, status indicators, and polished empty states.
 */

import { useState, lazy, Suspense } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import Menu from '@mui/material/Menu';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Divider from '@mui/material/Divider';
import { Plus, Search, RefreshCw, X, Columns3 } from 'lucide-react';
import { ContentListFilters } from './ContentListFilters';
import { ContentListTable } from './ContentListTable';
import { useContentListController } from './useContentListController';

const BulkEnrichDialog = lazy(() => import('@/components/admin/BulkEnrichDialog'));
const BulkActionsBar = lazy(() =>
  import('../BulkActionsBar').then((m) => ({ default: m.BulkActionsBar })),
);

interface ContentListPanelProps {
  /** Content type ID or undefined for "all content". Falls back to URL :type param. */
  contentTypeId?: string;
  /** Called when editing an item. Falls back to AdminShell context. */
  onEdit?: (contentType: string, itemId: string) => void;
  /** Called when creating an item. Falls back to AdminShell context. */
  onCreate?: (contentType: string) => void;
}

export function ContentListPanel(props: ContentListPanelProps) {
  const c = useContentListController(props);

  const [columnsMenuAnchor, setColumnsMenuAnchor] = useState<HTMLElement | null>(null);

  const typeColor = c.config?.color || '#6b7280';
  const Icon = c.config?.icon;

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
            {c.config ? c.config.label.plural : 'All Content'}
          </Typography>
          {!c.loading && (
            <Chip
              label={c.totalCount.toLocaleString()}
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
              onClick={() => c.loadItems()}
              sx={{ transition: 'transform 0.3s', '&:active': { transform: 'rotate(180deg)' } }}
            >
              <RefreshCw size={16} />
            </IconButton>
          </Tooltip>
          <Suspense fallback={null}>
            <BulkEnrichDialog onComplete={() => c.loadItems()} />
          </Suspense>
          {c.config && (
            <Button
              variant="contained"
              size="small"
              startIcon={<Plus size={16} />}
              onClick={() => c.onCreate(c.config!.id)}
              sx={{ textTransform: 'none' }}
            >
              New {c.config.label.singular}
            </Button>
          )}
        </Stack>
      </Box>

      {/* ── Toolbar: search + columns menu ──────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <TextField
          size="small"
          placeholder={
            c.config
              ? `Search ${c.config.label.plural.toLowerCase()}...`
              : 'Search all content...'
          }
          value={c.search}
          onChange={(e) => c.setSearch(e.target.value)}
          sx={{ width: { xs: '100%', sm: 320 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
              endAdornment: c.search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => c.setSearch('')} edge="end">
                    <X size={14} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
        />
        {c.selected.size > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {c.selected.size} selected
          </Typography>
        )}
        {c.contentTypeId && c.allListColumns.length > 0 && (
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
                {c.hiddenColumns.length > 0 && (
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ ml: 0.5, color: 'text.secondary' }}
                  >
                    ({c.allListColumns.length - c.hiddenColumns.length}/{c.allListColumns.length})
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
              {c.allListColumns.map((f) => {
                const visible = !c.hiddenColumns.includes(f.name);
                return (
                  <MenuItem
                    key={f.name}
                    dense
                    onClick={() =>
                      c.setHiddenColumns(
                        visible
                          ? [...c.hiddenColumns, f.name]
                          : c.hiddenColumns.filter((n) => n !== f.name),
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
              {c.hiddenColumns.length > 0 && (
                <>
                  <Divider />
                  <MenuItem dense onClick={() => c.setHiddenColumns([])}>
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
      <ContentListFilters
        filterFields={c.filterFields}
        filters={c.filters}
        dynamicOptions={c.dynamicOptions}
        setFilter={c.setFilter}
        clearFilters={c.clearFilters}
      />

      {/* ── Table ───────────────────────────────────────────────── */}
      <ContentListTable
        contentTypeId={c.contentTypeId}
        config={c.config}
        items={c.items}
        loading={c.loading}
        totalCount={c.totalCount}
        page={c.page}
        rowsPerPage={c.rowsPerPage}
        setPage={c.setPage}
        setRowsPerPage={c.setRowsPerPage}
        sortField={c.sortField}
        sortDir={c.sortDir}
        handleSort={c.handleSort}
        extraColumns={c.extraColumns}
        selected={c.selected}
        allSelected={c.allSelected}
        someSelected={c.someSelected}
        toggleSelect={c.toggleSelect}
        toggleSelectAll={c.toggleSelectAll}
        debouncedSearch={c.debouncedSearch}
        onClearSearch={() => c.setSearch('')}
        onEdit={c.onEdit}
        onCreate={c.onCreate}
      />

      {c.selected.size > 0 && c.config && (
        <Suspense fallback={null}>
          <BulkActionsBar
            selections={Array.from(c.selected).map((id) => ({
              contentType: c.config!.id,
              tableName: c.config!.tableName,
              id,
            }))}
            onClear={() => c.setSelected(new Set())}
            onComplete={() => c.loadItems()}
          />
        </Suspense>
      )}
    </Box>
  );
}
