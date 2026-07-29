import { useId } from 'react';
import {
  ArrowDownUp,
  CalendarDays,
  Check,
  Columns3,
  GanttChart,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';
import {
  GROUP_BY_FIELDS,
  LAYOUTS,
  SORT_FIELDS,
  type BlockViewState,
  type FilterKey,
  type GroupByField,
  type LayoutId,
  type SortField,
} from '@/lib/databaseBlock/schema';

/**
 * Layout switcher, in-memory search, filter popover and sort popover.
 *
 * Every change calls `onChange` with the next view state. In the editor that is
 * wired to updateAttributes, so the reader-facing default is whatever the author
 * left the block looking like — the Notion behaviour.
 */

const LAYOUT_META: Record<LayoutId, { label: string; icon: typeof List }> = {
  list: { label: 'List', icon: List },
  gallery: { label: 'Gallery', icon: LayoutGrid },
  kanban: { label: 'Board', icon: Columns3 },
  timeline: { label: 'Timeline', icon: GanttChart },
  calendar: { label: 'Calendar', icon: CalendarDays },
};

const SORT_LABEL: Record<SortField, string> = {
  manual: 'Author order',
  title: 'Name',
  start_date: 'Start date',
  end_date: 'End date',
  updated_at: 'Last updated',
  quality_score: 'Quality',
  price_min: 'Price',
};

const GROUP_LABEL: Record<GroupByField, string> = {
  entity_type: 'Type',
  city: 'City',
  country: 'Country',
  category: 'Category',
  liveness_status: 'Status',
  is_featured: 'Featured',
  start_month: 'Month',
};

/** Values offered per filter, derived from what is actually loaded. */
export type FilterOptions = Partial<Record<FilterKey, string[]>>;

interface ControlBarProps {
  viewState: BlockViewState;
  onChange: (next: BlockViewState) => void;
  /** Distinct values present in the hydrated set. */
  filterOptions: FilterOptions;
  resultCount: number;
  /** Hidden when the reader cannot change the view (a locked published block). */
  readOnly?: boolean;
}

const FILTERABLE: { key: FilterKey; label: string }[] = [
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
  { key: 'category', label: 'Category' },
  { key: 'liveness_status', label: 'Status' },
];

function activeFilterCount(viewState: BlockViewState): number {
  return Object.values(viewState.filters).filter(
    (v) => v !== undefined && (!Array.isArray(v) || v.length > 0),
  ).length;
}

export function DatabaseBlockControlBar({
  viewState,
  onChange,
  filterOptions,
  resultCount,
  readOnly = false,
}: ControlBarProps) {
  const searchId = useId();
  const set = (patch: Partial<BlockViewState>) => onChange({ ...viewState, ...patch });

  const layoutOptions: SegmentedOption<LayoutId>[] = LAYOUTS.map((id) => ({
    value: id,
    label: LAYOUT_META[id].label,
    icon: LAYOUT_META[id].icon,
  }));

  const toggleFilterValue = (key: FilterKey, value: string) => {
    const current = viewState.filters[key];
    const list = Array.isArray(current) ? current : [];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    const filters = { ...viewState.filters };
    if (next.length) filters[key] = next;
    else delete filters[key];
    set({ filters });
  };

  const filterCount = activeFilterCount(viewState);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          value={viewState.activeLayout}
          options={layoutOptions}
          onChange={(activeLayout) => set({ activeLayout })}
          label="Layout"
        />

        <div className="relative min-w-40 flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <label className="sr-only" htmlFor={searchId}>
            Search these entries
          </label>
          <Input
            id={searchId}
            value={viewState.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Search"
            className="pl-8"
          />
        </div>

        {/* Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Filter
              {filterCount > 0 && <Badge variant="secondary">{filterCount}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput placeholder="Find a value" />
              <CommandList>
                <CommandEmpty>No values yet.</CommandEmpty>
                {FILTERABLE.map(({ key, label }) => {
                  const options = filterOptions[key] ?? [];
                  if (options.length === 0) return null;
                  const selected = Array.isArray(viewState.filters[key])
                    ? (viewState.filters[key] as string[])
                    : [];
                  return (
                    <CommandGroup key={key} heading={label}>
                      {options.map((value) => (
                        <CommandItem key={value} onSelect={() => toggleFilterValue(key, value)}>
                          <Check
                            className={
                              selected.includes(value)
                                ? 'mr-2 h-4 w-4 opacity-100'
                                : 'mr-2 h-4 w-4 opacity-0'
                            }
                            aria-hidden="true"
                          />
                          {value}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  );
                })}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Sort */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
              Sort
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <Command>
              <CommandList>
                <CommandGroup heading="Sort by">
                  {SORT_FIELDS.map((field) => (
                    <CommandItem
                      key={field}
                      onSelect={() =>
                        set({ sortConfig: { field, dir: viewState.sortConfig.dir } })
                      }
                    >
                      <Check
                        className={
                          viewState.sortConfig.field === field
                            ? 'mr-2 h-4 w-4 opacity-100'
                            : 'mr-2 h-4 w-4 opacity-0'
                        }
                        aria-hidden="true"
                      />
                      {SORT_LABEL[field]}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading="Direction">
                  {(['asc', 'desc'] as const).map((dir) => (
                    <CommandItem
                      key={dir}
                      onSelect={() => set({ sortConfig: { ...viewState.sortConfig, dir } })}
                    >
                      <Check
                        className={
                          viewState.sortConfig.dir === dir
                            ? 'mr-2 h-4 w-4 opacity-100'
                            : 'mr-2 h-4 w-4 opacity-0'
                        }
                        aria-hidden="true"
                      />
                      {dir === 'asc' ? 'Ascending' : 'Descending'}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Grouping only means something on a board. */}
        {viewState.activeLayout === 'kanban' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Columns3 className="h-4 w-4" aria-hidden="true" />
                {GROUP_LABEL[viewState.groupByField]}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-0" align="start">
              <Command>
                <CommandList>
                  <CommandGroup heading="Group by">
                    {GROUP_BY_FIELDS.map((field) => (
                      <CommandItem key={field} onSelect={() => set({ groupByField: field })}>
                        <Check
                          className={
                            viewState.groupByField === field
                              ? 'mr-2 h-4 w-4 opacity-100'
                              : 'mr-2 h-4 w-4 opacity-0'
                          }
                          aria-hidden="true"
                        />
                        {GROUP_LABEL[field]}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}

        {!readOnly && <span className="text-13 text-muted-foreground">{resultCount}</span>}
      </div>

      {/* Active filters, individually removable. */}
      {filterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {FILTERABLE.map(({ key, label }) => {
            const values = viewState.filters[key];
            if (!Array.isArray(values) || values.length === 0) return null;
            return values.map((value) => (
              <Button
                key={`${key}:${value}`}
                variant="secondary"
                size="sm"
                className="gap-2"
                onClick={() => toggleFilterValue(key, value)}
                aria-label={`Remove filter ${label} ${value}`}
              >
                {value}
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            ));
          })}
        </div>
      )}
    </div>
  );
}
