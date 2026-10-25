/**
 * ContentListTable — table rendering for ContentListPanel including
 * sortable headers, skeleton rows, empty state, and per-row cells.
 */

import { stripHtmlTags, decodeHtmlEntities } from '@/utils/htmlDecode';
import { WorkspaceRowMenu } from './WorkspaceRowMenu';
import type { WorkspaceListOptions } from './workspaceTypes';
import {
  Plus,
  Edit,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Inbox,
  X,
  SquareArrowOutUpRight,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminSelectionCheckbox as Checkbox } from '@/components/admin/primitives/AdminSelectionCheckbox';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { Editable } from '@/components/admin/inline/Editable';
import { getContentType } from '@/config/contentTypes';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import { ListPagination } from './ListPagination';
import {
  getStatusColor,
  getStatusLabel,
  relativeTime,
  resolveStatusField,
  tintOf,
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
            <Skeleton style={{ width: 18, height: 18, borderRadius: 'var(--radius-badge)' }} />
          </TableCell>
          <TableCell>
            <Skeleton style={{ width: `${55 + (i % 3) * 15}%`, height: 20 }} />
            <Skeleton className="mt-1" style={{ width: `${30 + (i % 2) * 20}%`, height: 14 }} />
          </TableCell>
          {columns >= 4 && (
            <TableCell>
              <Skeleton style={{ width: 70, height: 20 }} />
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
  const color = config?.color || 'hsl(var(--muted-foreground))';

  return (
    <div className="py-16 px-6 flex flex-col items-center text-center">
      <div
        className="rounded-full flex items-center justify-center mb-6"
        style={{
          width: 72,
          height: 72,
          backgroundColor: tintOf(color),
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
          {config?.canCreate !== false && (
            <p className="text-sm text-muted-foreground mb-6 max-w-[360px]">
              {config
                ? `Create your first ${config.label.singular.toLowerCase()} to get started.`
                : 'Content you create will appear here.'}
            </p>
          )}
          {config && config.canCreate !== false && (
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

/** Derived counts and scores are virtual text fields in the registry. */
function numericColumn(field: FieldConfig) {
  return field.type === 'number' || (field.virtual && /(?:_count|_score)$/.test(field.name));
}

// ── Sort header cell ────────────────────────────────────────────────

function SortableHeader({
  label,
  field,
  currentField,
  currentDir,
  onSort,
  sorts,
  align = 'left',
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (field: SortField, append?: boolean) => void;
  sorts?: { field: string; dir: 'asc' | 'desc' }[];
  align?: 'left' | 'right';
}) {
  // With a multi-sort active, "is this the primary sort" is not the same
  // question as "is this sorted at all".
  const rank = sorts ? sorts.findIndex((s) => s.field === field) : -1;
  const isActive = rank >= 0 || currentField === field;
  const dir = rank >= 0 ? sorts![rank].dir : currentDir;
  const showRank = !!sorts && sorts.length > 1 && rank >= 0;

  return (
    <TableHead
      className="font-semibold cursor-pointer select-none transition-colors hover:text-primary"
      style={{ textAlign: align }}
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={`flex min-h-10 items-center gap-1 rounded-element text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${align === 'right' ? 'ml-auto' : ''}`}
        onClick={(event) => onSort(field, event.shiftKey)}
        title="Click to sort. Shift-click to add to the sort."
      >
        {label}
        {isActive ? (
          dir === 'asc' ? (
            <ArrowUp size={14} style={{ opacity: 0.8 }} />
          ) : (
            <ArrowDown size={14} style={{ opacity: 0.8 }} />
          )
        ) : (
          <ArrowUpDown size={14} style={{ opacity: 0.3 }} />
        )}
        {showRank && <span className="text-2xs text-muted-foreground">{rank + 1}</span>}
      </button>
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
    const color =
      field.name === 'category'
        ? (config?.color ?? 'hsl(var(--muted-foreground))')
        : 'hsl(var(--muted-foreground))';
    return (
      <Badge
        className="h-5 text-xs2 font-semibold"
        style={{ backgroundColor: tintOf(color), color }}
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
    const formatted = !Number.isInteger(n) && n >= 0 && n <= 1 ? n.toFixed(2) : n.toLocaleString();
    return (
      <span className="text-13" style={{ fontVariantNumeric: 'tabular-nums' }}>
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
          <Badge key={String(tag)} variant="secondary" className="h-[18px] text-2xs">
            {String(tag)}
          </Badge>
        ))}
        {remaining > 0 && <span className="text-xs text-muted-foreground">+{remaining}</span>}
      </div>
    );
  }
  if (typeof v === 'object' || field.type === 'json') {
    const summary = summarizeStructured(v);
    return (
      <span className="text-13 truncate block" title={summary}>
        {summary}
      </span>
    );
  }
  return <span className="text-13 truncate block">{String(v)}</span>;
}

// ── Main table component ────────────────────────────────────────────

import { RowLifecycleActions } from './RowLifecycleActions';
import { livePath } from '@/lib/cmsLinks';
import { isArchived } from '@/hooks/useEntityLifecycle';
import { summarizeStructured } from '@/components/cms/fields/structured/structuredValue';

export interface ContentListTableProps extends WorkspaceListOptions {
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
  handleSort: (field: SortField, append?: boolean) => void;
  /** Ordered; used to show precedence when more than one sort is active. */
  sorts?: { field: string; dir: 'asc' | 'desc' }[];
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
  /** Refetch after an inline edit so the row shows the saved value. */
  onRefresh?: () => void;
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
  sorts,
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
  onRefresh,
  workspace,
  operational,
  onEditRow,
  rowActions,
}: ContentListTableProps) {
  const open = (item: ListItem) =>
    onEditRow ? onEditRow(item.raw ?? {}) : onEdit(item.contentType, item.id);
  const colCount = (contentTypeId ? 5 : 6) + extraColumns.length;

  return (
    <div
      data-testid="content-data-surface"
      className="overflow-hidden rounded-container bg-card shadow-soft"
    >
      <div className="overflow-x-auto">
        <Table variant="admin" aria-label={config?.label?.plural ?? 'All content'}>
          <TableHeader className="bg-card">
            <TableRow>
              <TableHead style={{ width: 60, padding: '0 8px' }}>
                <Checkbox
                  aria-label="Select all rows"
                  checked={someSelected && !allSelected ? 'indeterminate' : allSelected}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>

              <SortableHeader
                label={workspace ? 'Name' : 'Title'}
                field="title"
                currentField={sortField}
                currentDir={sortDir}
                onSort={handleSort}
                sorts={sorts}
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
                    sorts={sorts}
                    align={numericColumn(f) ? 'right' : 'left'}
                  />
                ) : (
                  <TableHead
                    key={f.name}
                    style={{ textAlign: numericColumn(f) ? 'right' : 'left' }}
                  >
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
                sorts={sorts}
              />

              <TableHead
                className={workspace ? 'sticky right-0 bg-card' : undefined}
                style={{ width: workspace ? 72 : 200, textAlign: 'right' }}
              >
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
                // A type-specific list already receives its effective config,
                // including any page-level row actions. Only the mixed "All
                // Content" view needs to resolve configuration per row.
                const rowConfig = contentTypeId
                  ? config
                  : (getContentType(item.contentType) ?? config);
                const isSelected = selected.has(itemKey);
                const rowColor = item.contentTypeColor;
                const statusColor = getStatusColor(item.status);
                // Rows the public can't see are visually set apart so editors
                // spot hidden/draft entries at a glance (feedback request).
                const rawVisibility = (item.raw as Record<string, unknown> | undefined)
                  ?.visibility as string | undefined;
                const isHidden =
                  (rawVisibility !== undefined && rawVisibility !== 'public') ||
                  (item.raw as Record<string, unknown> | undefined)?.is_public === false;
                // Archived is a DIFFERENT state from hidden and must read as
                // one: `visibility` is an editorial choice, archived means the
                // row is off the site entirely. Until this badge existed the
                // only signal was the row action flipping Archive→Restore,
                // which is invisible unless you go looking for it.
                const archived = isArchived(item.raw ?? {}, rowConfig?.lifecycle);
                const titleField = rowConfig?.titleField;
                const statusField = resolveStatusField(item.raw, rowConfig);

                return (
                  <TableRow
                    key={itemKey}
                    data-state={isSelected ? 'selected' : undefined}
                    data-admin-row=""
                    className={`focus-within:bg-muted/60 ${isHidden ? 'bg-muted/40' : ''}`}
                  >
                    <TableCell style={{ width: 60, padding: '0 8px' }}>
                      <Checkbox
                        aria-label={`Select ${item.title}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(itemKey)}
                      />
                    </TableCell>

                    <TableCell className="min-w-[240px]">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold leading-snug text-pretty text-foreground">
                        {workspace ? (
                          <button
                            type="button"
                            className="text-left font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-element"
                            onClick={() => open(item)}
                          >
                            {item.title}
                          </button>
                        ) : (
                          <Editable
                            contentType={item.contentType}
                            recordId={item.id}
                            field={titleField ?? '__title'}
                            value={titleField ? item.raw?.[titleField] : item.title}
                            requireAltClick={false}
                            as="div"
                            className={isHidden ? 'text-muted-foreground' : undefined}
                            onSaved={onRefresh}
                          >
                            <span>{item.title}</span>
                          </Editable>
                        )}
                        {isHidden && (
                          <span className="inline-block rounded-badge bg-muted px-1.5 align-middle text-2xs uppercase tracking-wide text-muted-foreground">
                            {rawVisibility && rawVisibility !== 'public' ? rawVisibility : 'hidden'}
                          </span>
                        )}
                        {archived && (
                          // The registry's own label ('Archived', 'Ghost',
                          // 'Cancelled', 'Inactive'), because the per-type word
                          // is the honest one — a ghost city is not a place at
                          // all, which "Archived" would flatten away.
                          <span
                            // Stable hook for e2e. Counting by TEXT would be
                            // ambiguous here: the view toggle itself renders
                            // "Archived only", and a status column can render
                            // the word too, so a text count can pass with zero
                            // badges actually on screen.
                            data-testid="archived-badge"
                            className="inline-block rounded-badge border border-border-hairline bg-background px-1.5 align-middle text-2xs uppercase tracking-wide text-foreground"
                          >
                            {rowConfig?.lifecycle?.archive?.label ?? 'Archived'}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <span className="mt-1 block max-w-[360px] truncate text-13 leading-relaxed text-muted-foreground">
                          {workspace
                            ? decodeHtmlEntities(stripHtmlTags(item.description))
                            : item.description}
                        </span>
                      )}
                    </TableCell>

                    {extraColumns.map((f) => (
                      <TableCell
                        key={f.name}
                        className="tabular-nums"
                        style={{ textAlign: numericColumn(f) ? 'right' : 'left' }}
                      >
                        {/* Editable resolves the field config from the registry and
                            owns the save. readOnly/unsupported types fall through to
                            plain display, so this is safe for every column. */}
                        {workspace ? (
                          renderColumnValue(f, item.raw, rowConfig)
                        ) : (
                          <Editable
                            contentType={item.contentType}
                            recordId={item.id}
                            field={f.name}
                            value={(item.raw as Record<string, unknown> | undefined)?.[f.name]}
                            requireAltClick={false}
                            as="div"
                            onSaved={onRefresh}
                          >
                            {renderColumnValue(f, item.raw, rowConfig)}
                          </Editable>
                        )}
                      </TableCell>
                    ))}

                    {!contentTypeId && (
                      <TableCell>
                        <Badge
                          className="h-5 text-xs2 font-semibold"
                          style={{
                            backgroundColor: tintOf(item.contentTypeColor),
                            color: item.contentTypeColor,
                          }}
                        >
                          {item.contentTypeLabel}
                        </Badge>
                      </TableCell>
                    )}

                    <TableCell>
                      <Editable
                        disabled={workspace}
                        contentType={item.contentType}
                        recordId={item.id}
                        field={statusField ?? '__status'}
                        value={statusField ? item.raw?.[statusField] : item.status}
                        requireAltClick={false}
                        as="div"
                        onSaved={onRefresh}
                      >
                        {item.status ? (
                          <div className="flex items-center gap-1.5">
                            <div
                              className="rounded-full flex-shrink-0"
                              style={{ width: 8, height: 8, backgroundColor: statusColor }}
                            />
                            <span className="text-xs font-medium" style={{ color: statusColor }}>
                              {getStatusLabel(item.status)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">--</span>
                        )}
                      </Editable>
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

                    <TableCell
                      className={workspace ? 'sticky right-0 bg-card text-right' : 'text-right'}
                    >
                      {workspace ? (
                        <WorkspaceRowMenu
                          item={item}
                          config={rowConfig}
                          operational={operational}
                          onEdit={() => open(item)}
                          refresh={() => onRefresh?.()}
                          actions={rowActions?.(item.raw ?? {}, () => onRefresh?.()) ?? []}
                        />
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-10 gap-2 px-2"
                                aria-label="Edit"
                                onClick={() => onEdit(item.contentType, item.id)}
                                style={{ ['--tw-color' as never]: rowColor } as never}
                              >
                                <Edit size={15} aria-hidden="true" /> Edit
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                          <div className="admin-row-secondary flex items-center gap-1 transition-opacity">
                            {(rowConfig?.rowActions ?? [])
                              .filter((a) => !a.visible || a.visible(item.raw ?? {}))
                              .map((action) => {
                                const ActionIcon = action.icon;
                                return (
                                  <Tooltip key={action.id}>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-10 w-10 p-0"
                                        aria-label={action.label}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          action.onSelect(item.raw ?? {});
                                        }}
                                      >
                                        <ActionIcon size={15} />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{action.label}</TooltipContent>
                                  </Tooltip>
                                );
                              })}

                            {rowConfig?.lifecycle && (
                              <RowLifecycleActions
                                lifecycle={rowConfig.lifecycle}
                                row={item.raw ?? {}}
                                id={item.id}
                                title={item.title || item.id}
                                onDone={() => onRefresh?.()}
                              />
                            )}

                            {/* The list is where an editor decides what to work
                            on, so it is where "what does this look like on the
                            site" belongs. Rendered only when the row actually
                            has a public page — an unsaved/unpublishable row and
                            a type with no page at all both resolve to null. */}
                            {(() => {
                              const href = livePath(item.contentType, item.raw ?? {});
                              if (!href) return null;
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-10 w-10 p-0"
                                      aria-label="View live"
                                      onClick={() => window.open(href, '_blank', 'noopener')}
                                    >
                                      <SquareArrowOutUpRight size={15} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>View live</TooltipContent>
                                </Tooltip>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <ListPagination
        page={page}
        rowsPerPage={rowsPerPage}
        totalCount={totalCount}
        setPage={setPage}
        setRowsPerPage={setRowsPerPage}
        hidden={items.length === 0}
      />
    </div>
  );
}
