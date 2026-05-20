/**
 * ContentListPanel — Paginated list view for a single content type.
 * Server-side pagination, debounced search, column sorting, bulk selection,
 * relative dates, status indicators, and polished empty states.
 */

import { lazy, Suspense } from 'react';
import { Plus, Search, RefreshCw, X, Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ContentListFilters } from './ContentListFilters';
import { ContentListTable } from './ContentListTable';
import { useContentListController } from './useContentListController';

const BulkEnrichDialog = lazy(() => import('@/components/admin/BulkEnrichDialog'));
const BulkActionsBar = lazy(() =>
  import('../BulkActionsBar').then((m) => ({ default: m.BulkActionsBar })),
);

interface ContentListPanelProps {
  contentTypeId?: string;
  onEdit?: (contentType: string, itemId: string) => void;
  onCreate?: (contentType: string) => void;
}

export function ContentListPanel(props: ContentListPanelProps) {
  const c = useContentListController(props);

  const typeColor = c.config?.color || 'hsl(var(--muted-foreground))';
  const Icon = c.config?.icon;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {Icon && (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${typeColor}1f` }}
            >
              <Icon size={16} style={{ color: typeColor }} />
            </div>
          )}
          <h5 className="text-xl font-bold">
            {c.config ? c.config.label.plural : 'All Content'}
          </h5>
          {!c.loading && (
            <Badge
              variant="secondary"
              className="h-[22px] text-xs font-semibold"
              style={{ backgroundColor: `${typeColor}14`, color: typeColor }}
            >
              {c.totalCount.toLocaleString()}
            </Badge>
          )}
        </div>
        <div className="flex flex-row gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => c.loadItems()}>
                <RefreshCw size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
          <Suspense fallback={null}>
            <BulkEnrichDialog onComplete={() => c.loadItems()} />
          </Suspense>
          {c.config && (
            <Button size="sm" onClick={() => c.onCreate(c.config!.id)}>
              <Plus size={16} className="mr-1" />
              New {c.config.label.singular}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="relative w-full sm:w-[320px]">
          <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={c.config ? `Search ${c.config.label.plural.toLowerCase()}...` : 'Search all content...'}
            value={c.search}
            onChange={(e) => c.setSearch(e.target.value)}
            className="pl-7 pr-7 h-9"
          />
          {c.search && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              onClick={() => c.setSearch('')}
            >
              <X size={14} />
            </Button>
          )}
        </div>
        {c.selected.size > 0 && (
          <p className="text-sm text-muted-foreground whitespace-nowrap">
            {c.selected.size} selected
          </p>
        )}
        {c.contentTypeId && c.allListColumns.length > 0 && (
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Columns3 size={14} className="mr-1" />
                  Columns
                  {c.hiddenColumns.length > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({c.allListColumns.length - c.hiddenColumns.length}/{c.allListColumns.length})
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-[220px]">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-semibold">
                  Visible columns
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {c.allListColumns.map((f) => {
                  const visible = !c.hiddenColumns.includes(f.name);
                  return (
                    <DropdownMenuItem
                      key={f.name}
                      onSelect={(e) => {
                        e.preventDefault();
                        c.setHiddenColumns(
                          visible
                            ? [...c.hiddenColumns, f.name]
                            : c.hiddenColumns.filter((n) => n !== f.name),
                        );
                      }}
                      className="gap-2"
                    >
                      <Checkbox checked={visible} />
                      <span className="text-sm">{f.label}</span>
                    </DropdownMenuItem>
                  );
                })}
                {c.hiddenColumns.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => c.setHiddenColumns([])}>
                      <span className="text-sm">Show all</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <ContentListFilters
        filterFields={c.filterFields}
        filters={c.filters}
        dynamicOptions={c.dynamicOptions}
        setFilter={c.setFilter}
        clearFilters={c.clearFilters}
      />

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
    </div>
  );
}
