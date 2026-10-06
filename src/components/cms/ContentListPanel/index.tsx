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
import { ArchivedViewToggle } from './ArchivedViewToggle';
import { MergedViewToggle } from './MergedViewToggle';
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
import { OPERATOR_LABELS } from './filterOps';
import { FILTER_LABEL_SUFFIX } from '@/lib/cmsFilterHref';
import type { Filter } from './viewSpec';
import type { FieldConfig } from '@/types/cms';

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

function filterValueLabel(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .filter((part) => part !== undefined && part !== null && part !== '')
      .map(String)
      .join(' – ');
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

/** Query params that are not field filters. */
const RESERVED_PARAMS = new Set(['view', 'edit']);

function activeFilterLabel(filter: Filter, fields: FieldConfig[]): string {
  const field = fields.find((candidate) => candidate.name === filter.field);
  const value = filter.label || filterValueLabel(filter.value);
  return [field?.label ?? filter.field, OPERATOR_LABELS[filter.op], value]
    .filter(Boolean)
    .join(' ');
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
    archivedView: c.archivedView,
    mergedView: c.mergedView,
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
    // Deep link: any query param naming a field of this type becomes an `eq`
    // filter (e.g. `?city_id=<uuid>` from the Cities list's venue count — see
    // `cmsFilteredListPath`). Applied AFTER the view so a default view cannot
    // overwrite it, and REPLACING the filters restored from sessionStorage:
    // the link's intent is "exactly these rows". `normalizeSpec` drops unknown
    // fields and disallowed operators, so a stray param is ignored rather than
    // queried. The params are stripped so refresh/back does not re-apply them.
    if (c.config) {
      const urlFilters: Filter[] = [];
      const consumed: string[] = [];
      searchParams.forEach((value, key) => {
        if (RESERVED_PARAMS.has(key) || key.endsWith(FILTER_LABEL_SUFFIX) || !value) return;
        const label = searchParams.get(`${key}${FILTER_LABEL_SUFFIX}`) || undefined;
        urlFilters.push({ id: `url-${key}`, field: key, op: 'eq', value, label });
        consumed.push(key, `${key}${FILTER_LABEL_SUFFIX}`);
      });
      const valid = normalizeSpec({ filters: urlFilters }, c.config).filters;
      if (valid.length) c.setFilters(valid);
      if (consumed.length) {
        setSearchParams(
          (p) => {
            consumed.forEach((k) => p.delete(k));
            return p;
          },
          { replace: true },
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.loading, v.views, props.contentTypeId]);

  // Deep link: `?edit=<id>` opens the record editor for this type on mount and
  // strips the param, so refresh/back does not reopen it.
  //
  // This used to live in PersonalitiesAdmin, for personalities only, which is
  // why `cmsEditPath` can now be honest for every registry type: there is no
  // `/admin/content/:type/:id` route — the editor is a modal owned by
  // AdminShell — so a URL that opens a record has to be a query param here.
  //
  // Guarded on a resolved type: on the "All content" list there is no type to
  // open the editor against, and a bare id would be meaningless.
  const editHandledRef = useRef(false);
  const editTypeId = props.contentTypeId ?? type;
  useEffect(() => {
    if (editHandledRef.current) return;
    const id = searchParams.get('edit');
    if (!id || !editTypeId) return;
    editHandledRef.current = true;
    c.onEdit(editTypeId, id);
    setSearchParams(
      (p) => {
        p.delete('edit');
        return p;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount; c.onEdit is stable per type
  }, [editTypeId, searchParams, setSearchParams]);

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

      <section
        aria-label="Content workspace controls"
        className="mb-4 rounded-container bg-card p-2 shadow-soft"
      >
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1 lg:max-w-[560px]">
            <Search
              size={16}
              aria-hidden="true"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder={
                c.config
                  ? `Search ${c.config.label.plural.toLowerCase()}...`
                  : 'Search all content...'
              }
              value={c.search}
              onChange={(e) => c.setSearch(e.target.value)}
              className="h-10 bg-background pl-10 pr-10"
            />
            {c.search && (
              <Button
                aria-label="Clear search"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 p-0"
                onClick={() => c.setSearch('')}
              >
                <X size={14} />
              </Button>
            )}
          </div>

          {c.contentTypeId && config && (
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <FilterBuilder
                fields={config.fields}
                filters={c.filters}
                optionsFor={(f) => c.dynamicOptions[f.name] ?? f.options ?? []}
                onChange={c.setFilters}
              />

              <SortBuilder fields={config.fields} sorts={c.sorts} onChange={c.setSorts} />

              <ArchivedViewToggle
                lifecycle={config.lifecycle}
                value={c.archivedView}
                onChange={c.setArchivedView}
              />

              <MergedViewToggle
                merge={config.merge}
                value={c.mergedView}
                onChange={c.setMergedView}
              />

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

          {c.selected.size > 0 && (
            <p
              role="status"
              className="whitespace-nowrap rounded-badge bg-foreground px-2 py-1 text-xs font-bold tabular-nums text-background"
            >
              {c.selected.size} selected
            </p>
          )}
        </div>

        {c.contentTypeId && config && c.filters.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border-hairline pt-2">
            <span className="px-2 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
              Applied
            </span>
            {c.filters.map((filter) => (
              <Button
                key={filter.id}
                variant="soft"
                size="sm"
                className="h-8 max-w-full justify-start px-2 font-medium"
                aria-label={`Remove filter: ${activeFilterLabel(filter, config.fields)}`}
                onClick={() =>
                  c.setFilters(c.filters.filter((candidate) => candidate.id !== filter.id))
                }
              >
                <span className="truncate">{activeFilterLabel(filter, config.fields)}</span>
                <X size={14} aria-hidden="true" />
              </Button>
            ))}
            {c.filters.length > 1 && (
              <Button variant="ghost" size="sm" className="h-8" onClick={() => c.setFilters([])}>
                Clear all
              </Button>
            )}
          </div>
        )}
      </section>

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
            archivedView={c.archivedView}
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
