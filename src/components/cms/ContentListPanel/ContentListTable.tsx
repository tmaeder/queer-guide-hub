/**
 * ContentListTable — table rendering for ContentListPanel including
 * sortable headers, skeleton rows, empty state, and per-row cells.
 */

import { Plus, Edit, ArrowUp, ArrowDown, ArrowUpDown, Inbox, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
          <TableCell style={{ width: 42 }}>
            <Skeleton style={{ width: 18, height: 18, borderRadius: 2 }} />
          </TableCell>
          <TableCell>
            <Skeleton style={{ width: `${55 + (i % 3) * 15}%`, height: 20 }} />
            <Skeleton className="mt-1" style={{ width: `${30 + (i % 2) * 20}%`, height: 14 }} />
          </TableCell>
          {columns >= 4 && (
            <TableCell>
              <Skeleton className="rounded" style={{ width: 70, height: 20 }} />
            </TableCell>
          )}
          <TableCell>
            <Skeleton className="rounded-full inline-block" style={{ width: 8, height: 8 }} />
          </TableCell>
          <TableCell>
            <Skeleton style={{ width: 60, height: 16 }} />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="rounded-full" style={{ width: 24, height: 24 }} />
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
    <div className="py-16 px-6 flex flex-col items-center text-center">
      <div
        className="rounded-full flex items-center justify-center mb-5"
        style={{
          width: 72,
          height: 72,
          backgroundColor: `${color}14`,
        }}
      >
        {Icon ? (
          <Icon size={32} style={{ color, opacity: 0.7 }} />
        ) : (
          <Inbox size={32} style={{ color, opacity: 0.7 }} />
        )}
      </div>

      {hasSearch ? (
        <>
          <h6 className="text-lg font-semibold mb-1">No results found</h6>
          <p className="text-sm text-muted-foreground mb-4 max-w-[360px]">
            Try adjusting your search query or clear the filter to see all items.
          </p>
          <Button variant="outline" size="sm" onClick={onClearSearch}>
            <X size={14} />
            Clear Search
          </Button>
        </>
      ) : (
        <>
          <h6 className="text-lg font-semibold mb-1">
            No {config ? config.label.plural.toLowerCase() : 'items'} yet
          </h6>
          <p className="text-sm text-muted-foreground mb-5 max-w-[360px]">
            {config
              ? `Create your first ${config.label.singular.toLowerCase()} to get started.`
              : 'Content you create will appear here.'}
          </p>
          {config && (
            <Button onClick={onCreate}>
              <Plus size={16} />
              Create {config.label.singular}
            </Button>
          )}
        </>
      )}
    </div>
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
    <TableHead
      className="font-semibold cursor-pointer select-none transition-colors hover:text-primary"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
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
      </div>
    </TableHead>
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
      return <span className="text-xs text-muted-foreground/60">--</span>;
    }
    return node;
  }
  const v = row[field.name];
  if (v === null || v === undefined || v === '') {
    return <span className="text-xs text-muted-foreground/60">--</span>;
  }
  if (field.type === 'datetime' || field.type === 'date') {
    const s = String(v);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground">{relativeTime(s)}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{new Date(s).toLocaleString()}</TooltipContent>
      </Tooltip>
    );
  }
  if (field.type === 'select') {
    const opt = field.options?.find((o) => o.value === v);
    const color = field.name === 'category' ? (config?.color ?? '#6b7280') : '#6b7280';
    return (
      <Badge
        className="h-5 text-[0.7rem] font-semibold"
        style={{ backgroundColor: `${color}1A`, color }}
      >
        {opt?.label ?? String(v)}
      </Badge>
    );
  }
  if (field.type === 'boolean') {
    return <span className="text-xs text-muted-foreground">{v ? 'Yes' : 'No'}</span>;
  }
  if (field.type === 'number') {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isNaN(n)) {
      return <span className="text-xs text-muted-foreground/60">--</span>;
    }
    const formatted = n >= 0 && n <= 1 ? n.toFixed(2) : n.toLocaleString();
    return (
      <span className="text-[0.8rem]" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatted}
      </span>
    );
  }
  if (field.type === 'tags' && Array.isArray(v)) {
    if (v.length === 0) {
      return <span className="text-xs text-muted-foreground/60">--</span>;
    }
    const shown = v.slice(0, 3);
    const remaining = v.length - shown.length;
    return (
      <div className="flex flex-wrap gap-1">
        {shown.map((tag) => (
          <Badge key={String(tag)} variant="secondary" className="h-[18px] text-[0.65rem]">
            {String(tag)}
          </Badge>
        ))}
        {remaining > 0 && (
          <span className="text-xs text-muted-foreground">+{remaining}</span>
        )}
      </div>
    );
  }
  return (
    <span className="text-[0.8rem] truncate block">
      {String(v)}
    </span>
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
  const colCount = (contentTypeId ? 5 : 6) + extraColumns.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));

  return (
    <div className="overflow-hidden rounded-element border border-border bg-background">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead style={{ width: 42, paddingLeft: 12 }}>
                <Checkbox
                  checked={someSelected && !allSelected ? 'indeterminate' : allSelected}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>

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
                  <TableHead key={f.name} className="font-semibold">
                    {f.label}
                  </TableHead>
                ),
              )}

              {!contentTypeId && <TableHead className="font-semibold">Type</TableHead>}

              <TableHead className="font-semibold" style={{ width: 90 }}>
                Status
              </TableHead>

              <SortableHeader
                label="Updated"
                field="updated_at"
                currentField={sortField}
                currentDir={sortDir}
                onSort={handleSort}
              />

              <TableHead className="text-right font-semibold" style={{ width: 60 }}>
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeleton columns={colCount} />
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="p-0 border-0">
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
                    data-state={isSelected ? 'selected' : undefined}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    style={{
                      borderLeft: '3px solid transparent',
                      ...(isSelected ? { backgroundColor: `${rowColor}0A` } : {}),
                    }}
                    onClick={() => onEdit(item.contentType, item.id)}
                  >
                    <TableCell style={{ paddingLeft: 12 }} onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(itemKey)}
                      />
                    </TableCell>

                    <TableCell>
                      <p className="text-sm font-medium leading-tight">{item.title}</p>
                      {item.description && (
                        <span className="text-xs text-muted-foreground truncate block max-w-[360px] mt-0.5">
                          {item.description}
                        </span>
                      )}
                    </TableCell>

                    {extraColumns.map((f) => (
                      <TableCell key={f.name}>{renderColumnValue(f, item.raw, config)}</TableCell>
                    ))}

                    {!contentTypeId && (
                      <TableCell>
                        <Badge
                          className="h-5 text-[0.7rem] font-semibold"
                          style={{
                            backgroundColor: `${item.contentTypeColor}1A`,
                            color: item.contentTypeColor,
                          }}
                        >
                          {item.contentTypeLabel}
                        </Badge>
                      </TableCell>
                    )}

                    <TableCell>
                      {item.status ? (
                        <div className="flex items-center gap-1.5">
                          <div
                            className="rounded-full flex-shrink-0"
                            style={{ width: 8, height: 8, backgroundColor: statusColor }}
                          />
                          <span
                            className="text-xs font-medium"
                            style={{ color: statusColor }}
                          >
                            {getStatusLabel(item.status)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">--</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {item.updatedAt ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground">
                              {relativeTime(item.updatedAt)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {new Date(item.updatedAt).toLocaleString()}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(item.contentType, item.id);
                            }}
                            style={{ ['--tw-color' as never]: rowColor } as never}
                          >
                            <Edit size={15} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Rows per page:</span>
            <Select
              value={String(rowsPerPage)}
              onValueChange={(v) => {
                setRowsPerPage(parseInt(v, 10));
                setPage(0);
              }}
            >
              <SelectTrigger className="h-7 w-[70px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>
              {page * rowsPerPage + 1}-{Math.min((page + 1) * rowsPerPage, totalCount)} of {totalCount}
            </span>
          </div>
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (page > 0) setPage(page - 1);
                  }}
                  aria-disabled={page === 0}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" isActive>
                  {page + 1}
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (page + 1 < totalPages) setPage(page + 1);
                  }}
                  aria-disabled={page + 1 >= totalPages}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
