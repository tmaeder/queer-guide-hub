/**
 * ContentListPanel — Paginated list view for a single content type.
 * Server-side pagination, debounced search, column sorting, bulk selection,
 * relative dates, status indicators, and polished empty states.
 */

import { lazy, Suspense } from 'react';
import { useParams } from 'react-router';
import { Plus, Search, RefreshCw, X } from 'lucide-react';
import { ContentEntityTabs } from '@/components/admin/ContentEntityTabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

import { tintOf } from './types';
import { ContentListTable } from './ContentListTable';
import { ContentListGallery } from './ContentListGallery';
import { ContentListBoard } from './ContentListBoard';
import { ContentListTimeline } from './ContentListTimeline';
import { ContentListCalendar } from './ContentListCalendar';
import { FilterBuilder } from './filters/FilterBuilder';
import { SortBuilder } from './filters/SortBuilder';
import { ViewSettings } from './filters/ViewSettings';
import { useContentListController } from './useContentListController';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import { exportContentType } from './exportContentList';

const BulkActionsBar = lazy(() =>
  import('../BulkActionsBar').then((m) => ({ default: m.BulkActionsBar })),
);

interface ContentListPanelProps {
  contentTypeId?: string;
  onEdit?: (contentType: string, itemId: string) => void;
  onCreate?: (contentType: string) => void;
}

/**
 * Remounts the body whenever the content type changes.
 *
 * This route element is shared by `content` and `content/:type` (routes.tsx),
 * and it reads `useParams` itself, so React Router never remounts it on a type
 * switch. That shared lifetime is what let one commit exist with the new type's
 * persist key and the old type's state — see the note in
 * useContentListController. Keying here is the fix, and it costs three lines.
 */
export function ContentListPanel(props: ContentListPanelProps) {
  const { type } = useParams();
  const typeId = props.contentTypeId ?? type;
  return <ContentListPanelBody key={typeId ?? '__all__'} {...props} contentTypeId={typeId} />;
}

function ContentListPanelBody(props: ContentListPanelProps) {
  const c = useContentListController(props);
  const { type } = useParams();

  const typeColor = c.config?.color || 'hsl(var(--muted-foreground))';
  const Icon = c.config?.icon;
  // The controller can return undefined (no type selected); the views model
  // "no config" as null, so normalize once here rather than at each call site.
  const config = c.config ?? null;

  return (
    <div>
      <ContentEntityTabs type={type ?? props.contentTypeId} />
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {Icon && (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: tintOf(typeColor) }}
            >
              <Icon size={16} style={{ color: typeColor }} />
            </div>
          )}
          <h5 className="text-xl font-bold">{c.config ? c.config.label.plural : 'All Content'}</h5>
          {!c.loading && (
            <Badge
              variant="secondary"
              className="h-[22px] text-xs font-semibold"
              style={{ backgroundColor: tintOf(typeColor), color: typeColor }}
            >
              {c.totalCount.toLocaleString()}
            </Badge>
          )}
        </div>
        <div className="flex flex-row gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => c.loadItems()}
              >
                <RefreshCw size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
          {c.config?.toolbarActions?.()}
          {c.config && c.allListColumns.length > 0 && (
            <ExportExcelButton onExport={() => exportContentType(c.config!, c.allListColumns)} />
          )}
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
          <Search
            size={16}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder={
              c.config
                ? `Search ${c.config.label.plural.toLowerCase()}...`
                : 'Search all content...'
            }
            value={c.search}
            onChange={(e) => c.setSearch(e.target.value)}
            className="pl-8 pr-8 h-9"
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
        {c.contentTypeId && config && (
          <FilterBuilder
            fields={config.fields}
            filters={c.filters}
            optionsFor={(f) => c.dynamicOptions[f.name] ?? f.options ?? []}
            onChange={c.setFilters}
          />
        )}

        {c.contentTypeId && config && (
          <SortBuilder fields={config.fields} sorts={c.sorts} onChange={c.setSorts} />
        )}

        {c.contentTypeId && config && (
          <div className="ml-auto">
            <ViewSettings
              config={config}
              view={c.view}
              columns={c.columns}
              groupBy={c.groupBy}
              dateField={c.dateField}
              onViewChange={c.setView}
              onColumnsChange={c.setColumns}
              onGroupByChange={c.setGroupBy}
              onDateFieldChange={c.setDateField}
            />
          </div>
        )}
      </div>

      {c.view === 'gallery' ? (
        <ContentListGallery
          items={c.items}
          loading={c.loading}
          config={config}
          selected={c.selected}
          toggleSelect={c.toggleSelect}
          onEdit={c.onEdit}
        />
      ) : c.view === 'timeline' ? (
        <ContentListTimeline
          items={c.items}
          loading={c.loading}
          dateField={c.dateField}
          onEdit={c.onEdit}
        />
      ) : c.view === 'calendar' ? (
        <ContentListCalendar
          items={c.items}
          loading={c.loading}
          dateField={c.dateField}
          onEdit={c.onEdit}
        />
      ) : c.view === 'board' ? (
        <ContentListBoard
          items={c.items}
          loading={c.loading}
          config={config}
          groupBy={c.groupBy}
          onEdit={c.onEdit}
        />
      ) : (
        <ContentListTable
          contentTypeId={c.contentTypeId}
          config={config}
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
          sorts={c.sorts}
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
          onRefresh={c.loadItems}
        />
      )}

      {c.selected.size > 0 && c.config && (
        <Suspense fallback={null}>
          <BulkActionsBar
            bulkEditFields={c.config.bulkEditFields}
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
