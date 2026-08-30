/**
 * ContentListPanel — Paginated list view for a single content type.
 * Server-side pagination, debounced search, column sorting, bulk selection,
 * relative dates, status indicators, and polished empty states.
 */

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
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
import { ViewBar } from './filters/ViewBar';
import { ListPagination } from './ListPagination';
import { AdminArchetypeHeader } from '@/components/admin/frames/AdminArchetypeHeader';
import { useContentViews, type SavedView } from '@/hooks/useContentViews';
import { useGroupedRows } from '@/hooks/useGroupedRows';
import { normalizeSpec, specEquals } from './viewSpec';
import { toListItem } from './types';
import { useContentListController } from './useContentListController';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import { exportContentType } from './exportContentList';

const BulkActionsBar = lazy(() =>
  import('../BulkActionsBar').then((m) => ({ default: m.BulkActionsBar })),
);

interface ContentListPanelProps {
  /**
   * Suppress this panel's own archetype header.
   *
   * Set by a page that embeds the panel AND owns the page title — otherwise
   * the route renders TWO h1s, which is both an a11y defect (a screen reader
   * announces two page titles) and the exact invariant
   * e2e/admin-route-baseline.spec.ts asserts. Introduced after adopting the
   * header here silently gave /admin/content/milestones a second one.
   */
  hideHeader?: boolean;

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
  const v = useContentViews(props.contentTypeId);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const activeView = v.views.find((x) => x.id === activeViewId) ?? null;
  // Dirty means "the live spec differs from what this view last saved". With no
  // view selected there is nothing to be dirty against.
  const dirty =
    !!activeView && !specEquals(normalizeSpec(activeView.spec, c.config ?? null), c.spec);

  // True per-group totals; only meaningful once a group column is chosen.
  const grouped = useGroupedRows({
    config: c.config ?? null,
    groupBy: c.groupBy,
    filters: c.filters,
    search: c.debouncedSearch,
    enabled: c.view === 'board',
  });

  const selectView = (view: SavedView) => {
    setActiveViewId(view.id);
    c.applySpec(normalizeSpec(view.spec, c.config ?? null));
    // `replace` so Back does not step through every view switch. Only the view
    // ID is encoded — a 15-filter spec would make an unshareable URL, and the
    // id IS the shareable handle.
    setSearchParams(
      (p) => {
        p.set('view', view.id);
        return p;
      },
      { replace: true },
    );
  };

  // Resolve the initial view ONCE per type, after the saved list arrives:
  // ?view=<id> if it names a view that exists, else the default, else nothing.
  // A stale or foreign id falls through silently rather than erroring.
  const resolvedRef = useRef<string | null>(null);
  useEffect(() => {
    const scope = props.contentTypeId ?? '';
    if (v.loading || resolvedRef.current === scope) return;
    resolvedRef.current = scope;
    const wanted = searchParams.get('view');
    const target = v.views.find((x) => x.id === wanted) ?? v.views.find((x) => x.isDefault);
    // A ?view= naming a deleted or foreign view simply falls through to the
    // default. The param is left alone rather than stripped: rewriting the URL
    // from an effect is another state write for a purely cosmetic gain.
    // The initial view can only be resolved once the saved list arrives from
    // the server, and the ref above makes this strictly one-shot per type.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (target) selectView(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.loading, v.views, props.contentTypeId]);

  const typeColor = c.config?.color || 'hsl(var(--muted-foreground))';
  const Icon = c.config?.icon;
  // The controller can return undefined (no type selected); the views model
  // "no config" as null, so normalize once here rather than at each call site.
  const config = c.config ?? null;

  return (
    <div>
      <ContentEntityTabs type={type ?? props.contentTypeId} />
      {/* Archetype A — the fixed header grammar. This route family is 24 of the
        40 admin routes, so it is the one the eight-frame claim actually rests
        on.

        The title was an <h5 className="text-xl font-bold">: the wrong heading
        LEVEL (a page has one h1, and a screen-reader user navigating by
        heading found nothing at the top of the busiest console in the product)
        and an arbitrary size off the semantic scale.

        Only the HEADER is adopted here, not AdminIndexFrame's body contract.
        The body already carries five view modes, a bulk bar and two paginators
        wired through useContentList; restructuring that in the same change as
        the header would put a behavioural rewrite inside a layout diff. The
        count rides with the title. */}
      {!props.hideHeader && (
        <AdminArchetypeHeader
          title={
            <span className="flex items-center gap-4">
              {Icon && (
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: tintOf(typeColor) }}
                >
                  <Icon size={16} style={{ color: typeColor }} />
                </span>
              )}
              {c.config ? c.config.label.plural : 'All Content'}
              {/* The record count sits with the title, not in a countLine slot:
              AdminArchetypeHeader has no such slot (that is AdminIndexFrame's,
              and adopting the full body contract here would mean restructuring
              five view modes in a layout diff). */}
              {!c.loading && (
                <Badge
                  variant="secondary"
                  className="h-[22px] text-xs font-semibold"
                  style={{ backgroundColor: tintOf(typeColor), color: typeColor }}
                >
                  {c.totalCount.toLocaleString()}
                </Badge>
              )}
            </span>
          }
          actions={
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    // A Tooltip is NOT an accessible name: its content lives in
                    // a portal and is never referenced by the trigger, so an
                    // icon-only button reads as unlabelled (axe button-name).
                    aria-label="Refresh"
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
                <ExportExcelButton
                  onExport={() => exportContentType(c.config!, c.allListColumns)}
                />
              )}
              {c.config && (
                <Button size="sm" onClick={() => c.onCreate(c.config!.id)}>
                  <Plus size={16} className="mr-1" />
                  New {c.config.label.singular}
                </Button>
              )}
            </>
          }
        />
      )}

      {c.contentTypeId && (
        <ViewBar
          views={v.views}
          activeId={activeViewId}
          dirty={dirty}
          onSelect={selectView}
          onCreate={async (name) => {
            const created = await v.createView(name, c.spec);
            if (created) setActiveViewId(created.id);
          }}
          onRename={(id, name) => void v.updateView(id, { name })}
          onDelete={async (id) => {
            await v.deleteView(id);
            if (id === activeViewId) setActiveViewId(null);
          }}
          onSetDefault={(id) => void v.setDefaultView(id)}
          onSave={() => activeViewId && void v.updateView(activeViewId, { spec: c.spec })}
          onReset={() =>
            activeView && c.applySpec(normalizeSpec(activeView.spec, c.config ?? null))
          }
        />
      )}

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
          loading={c.loading || grouped.loading}
          config={config}
          groupBy={c.groupBy}
          serverGroups={
            config && grouped.groups
              ? grouped.groups.map((g) => ({
                  key: g.key,
                  label: g.label,
                  count: g.count,
                  items: g.rows.map((row) => toListItem(row, config)),
                }))
              : null
          }
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

      {/* Every non-table view needs this too — they shipped able to show only
          the first page, which is meaningless on a 40k-row type. The table
          renders its own inside the bordered container. */}
      {c.contentTypeId && c.view !== 'table' && (
        <ListPagination
          page={c.page}
          rowsPerPage={c.rowsPerPage}
          totalCount={c.totalCount}
          setPage={c.setPage}
          setRowsPerPage={c.setRowsPerPage}
          hidden={c.items.length === 0}
        />
      )}

      {c.selected.size > 0 && c.config && (
        <Suspense fallback={null}>
          <BulkActionsBar
            bulkEditFields={c.config.bulkEditFields}
            lifecycle={c.config.lifecycle}
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
