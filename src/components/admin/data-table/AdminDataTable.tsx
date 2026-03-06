import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  flexRender,
  type SortingState,
  type VisibilityState,
  type GroupingState,
} from '@tanstack/react-table';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Checkbox from '@mui/material/Checkbox';
import { MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { useAdminTableQuery } from '@/hooks/useAdminTableQuery';
import { useAdminTableState } from '@/hooks/useAdminTableState';
import { useFilterPresets } from '@/hooks/useFilterPresets';
import { DataTableHeaderCell } from './DataTableHeader';
import { DataTableToolbar } from './DataTableToolbar';
import { DataTableFilters } from './DataTableFilters';
import { DataTablePagination } from './DataTablePagination';
import { DataTableBulkActions } from './DataTableBulkActions';
import { DataTableEmptyState } from './DataTableEmptyState';
import type { AdminTableConfig, AdminColumnMeta } from './types';

interface AdminDataTableProps<TData extends { id: string }> {
  config: AdminTableConfig<TData>;
}

export function AdminDataTable<TData extends { id: string }>({
  config,
}: AdminDataTableProps<TData>) {
  const {
    tableName,
    select,
    columns,
    entityFilters = [],
    bulkEditFields,
    rowActions,
    toolbarActions,
    defaultSort,
    defaultPageSize = 25,
    enableSelection = false,
    enableSearch = true,
    searchColumns = [],
    baseFilters,
    onBulkEditSuccess,
    onBulkDeleteSuccess,
  } = config;

  // Build default column visibility from meta
  const defaultColumnVisibility = useMemo(() => {
    const vis: Record<string, boolean> = {};
    for (const col of columns) {
      const meta = (col as { meta?: AdminColumnMeta }).meta;
      if (meta && meta.defaultVisible === false) {
        const id =
          'accessorKey' in col
            ? String((col as { accessorKey: string }).accessorKey)
            : (col as { id?: string }).id;
        if (id) vis[id] = false;
      }
    }
    return vis;
  }, [columns]);

  const {
    state,
    setSearch,
    setFilter,
    clearFilters,
    toggleSort,
    setPage,
    setPageSize,
    toggleRow,
    selectAll,
    clearSelection,
    toggleColumnVisibility,
    setGrouping,
  } = useAdminTableState({
    defaultSort,
    defaultPageSize,
    defaultColumnVisibility,
  });

  const {
    presets,
    save: savePreset,
    remove: removePreset,
    get: getPreset,
  } = useFilterPresets(tableName);

  const { data, totalCount, isLoading, isFetching, refetch } = useAdminTableQuery<TData>({
    tableName,
    select,
    searchColumns,
    baseFilters,
    state: {
      debouncedSearch: state.debouncedSearch,
      filters: state.filters,
      sorting: state.sorting,
      pagination: state.pagination,
    },
  });

  // Map state to TanStack Table format
  const sorting: SortingState = state.sorting
    ? [{ id: state.sorting.column, desc: state.sorting.direction === 'desc' }]
    : [];

  const columnVisibility: VisibilityState = state.columnVisibility;
  const grouping: GroupingState = state.grouping;

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility, grouping },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    manualSorting: true,
    manualPagination: true,
    enableMultiSort: false,
  });

  // Column info for visibility toggle
  const columnInfos = table.getAllLeafColumns().map((col) => {
    const meta = col.columnDef.meta as AdminColumnMeta | undefined;
    return {
      id: col.id,
      label: typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id,
      visible: col.getIsVisible(),
      hideable: meta?.hideable !== false,
    };
  });

  // Groupable columns from meta (plain value like columnInfos above)
  const groupableColumns = table
    .getAllLeafColumns()
    .filter((col) => (col.columnDef.meta as AdminColumnMeta | undefined)?.groupable)
    .map((col) => ({
      id: col.id,
      label: typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id,
    }));

  // Active filter count
  const activeFilterCount =
    Object.values(state.filters).filter(
      (v) => v !== undefined && v !== null && v !== '' && v !== 'all',
    ).length + (state.debouncedSearch ? 1 : 0);

  const handleApplyPreset = (id: string) => {
    const preset = getPreset(id);
    if (!preset) return;
    // Apply filters via individual setFilter calls
    clearFilters();
    for (const [key, value] of Object.entries(preset.filters)) {
      setFilter(key, value);
    }
    if (preset.search) setSearch(preset.search);
    if (preset.sorting) toggleSort(preset.sorting.column);
  };

  const handleSavePreset = (name: string) => {
    savePreset(name, state);
  };

  const allRowIds = data.map((row) => row.id);
  const allSelected = allRowIds.length > 0 && allRowIds.every((id) => state.selectedIds.has(id));
  const someSelected = allRowIds.some((id) => state.selectedIds.has(id)) && !allSelected;

  const handleRefetch = () => {
    refetch();
    onBulkEditSuccess?.();
  };

  const handleDeleteSuccess = () => {
    refetch();
    onBulkDeleteSuccess?.();
  };

  return (
    <Paper
      elevation={0}
      sx={{ border: '1px solid var(--border, #e4e4e7)', borderRadius: 2, overflow: 'hidden' }}
    >
      <DataTableToolbar
        search={state.search}
        onSearchChange={setSearch}
        enableSearch={enableSearch}
        columns={columnInfos}
        onToggleColumn={toggleColumnVisibility}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        totalCount={totalCount}
        isFetching={isFetching}
        toolbarActions={toolbarActions}
        presets={presets}
        onSavePreset={handleSavePreset}
        onApplyPreset={handleApplyPreset}
        onDeletePreset={removePreset}
        groupableColumns={groupableColumns}
        grouping={state.grouping}
        onGroupingChange={setGrouping}
      >
        {entityFilters.length > 0 && (
          <DataTableFilters filters={entityFilters} values={state.filters} onChange={setFilter} />
        )}
      </DataTableToolbar>

      {/* Bulk Actions Bar */}
      {enableSelection && (
        <DataTableBulkActions
          selectedCount={state.selectedIds.size}
          selectedIds={state.selectedIds}
          tableName={tableName}
          onClearSelection={clearSelection}
          onSuccess={handleRefetch}
          bulkEditFields={bulkEditFields}
        />
      )}

      {/* Table */}
      {isLoading || data.length === 0 ? (
        <DataTableEmptyState
          isLoading={isLoading}
          hasFilters={activeFilterCount > 0}
          columnCount={columns.length}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow style={{ backgroundColor: 'var(--muted, #f4f4f5)' }}>
              {enableSelection && (
                <th style={{ width: 44, padding: '0 8px' }}>
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={() => {
                      if (allSelected) clearSelection();
                      else selectAll(allRowIds);
                    }}
                    size="small"
                  />
                </th>
              )}
              {table.getHeaderGroups()[0]?.headers.map((header) => (
                <DataTableHeaderCell key={header.id} header={header} onSort={toggleSort} />
              ))}
              {rowActions && rowActions.length > 0 && (
                <th style={{ width: 48, padding: '0 8px' }} />
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => {
              const isSelected = state.selectedIds.has(row.original.id);
              return (
                <TableRow
                  key={row.id}
                  style={{
                    backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.04)' : undefined,
                  }}
                >
                  {enableSelection && (
                    <TableCell style={{ width: 44, padding: '0 8px' }}>
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggleRow(row.original.id)}
                        size="small"
                      />
                    </TableCell>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                  {rowActions && rowActions.length > 0 && (
                    <TableCell style={{ width: 48, padding: '0 8px' }}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" style={{ height: 28, width: 28 }}>
                            <MoreVertical style={{ height: 14, width: 14 }} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {rowActions
                            .filter((action) => !action.visible || action.visible(row.original))
                            .map((action) => (
                              <DropdownMenuItem
                                key={action.key}
                                onClick={() => action.onClick(row.original)}
                                style={
                                  action.variant === 'destructive'
                                    ? { color: 'var(--destructive)' }
                                    : undefined
                                }
                              >
                                {action.icon && (
                                  <action.icon style={{ height: 14, width: 14, marginRight: 8 }} />
                                )}
                                {action.label}
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <DataTablePagination
        page={state.pagination.page}
        pageSize={state.pagination.pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        selectedCount={state.selectedIds.size}
      />
    </Paper>
  );
}
