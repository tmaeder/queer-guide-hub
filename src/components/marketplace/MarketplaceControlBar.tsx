import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
// TransitIcon only in this band, never lucide alongside it — "never mix the
// two in the same surface". The Grid/List glyphs are gone entirely: they are
// two labelled chips now, which is both more legible than a pair of ambiguous
// icons and the reason no icon gap had to be filled.
import { TransitIcon } from '@/components/transit/TransitIcon';
import { FilterChip } from '@/components/transit/FilterChip';
import { StationRing } from '@/components/transit/StationRing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MarketplaceSearchSuggestions } from './MarketplaceSearchSuggestions';
import { MarketplaceFilterSheet } from './MarketplaceFilterSheet';
import { SavedSearchesButton } from './SavedSearchesButton';
import type { MarketplaceFiltersInput, MarketplaceSort } from '@/hooks/useMarketplace';
import { useMarketplaceSubcategoryTiles } from '@/hooks/useMarketplaceQueries';
import {
  DEPARTMENT_ORDER,
  departmentLabel,
  departmentOf,
  OCCASION_CHIPS,
} from '@/lib/marketplaceTaxonomy';
import { PRICE_BANDS, countActiveFilters, priceToToken } from '@/lib/marketplaceFilterParams';
import { describeActiveFilters } from './marketplaceEmptyState';

const QUEER_OWNED_VALUES = ['queer_owned', 'trans_owned'];

interface SortOption {
  value: string;
  label: string;
}

interface MarketplaceControlBarProps {
  filters: MarketplaceFiltersInput;
  /** Full-replacement callback — the page writes it to the URL. */
  onFiltersChange: (next: MarketplaceFiltersInput) => void;
  sortBy: MarketplaceSort;
  sortOptions: SortOption[];
  onSortChange: (s: string) => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (m: 'grid' | 'list') => void;
  includeAdult: boolean;
  onIncludeAdultChange: (next: boolean) => void;
  /** Live result count for the sheet footer. */
  resultCount?: number;
  /** Clears every filter param. Powers the active-filter row's "Clear all". */
  onClearAll?: () => void;
}

// The private `FacetChip` that lived here was deleted in favour of the shared
// `@/components/transit/FilterChip`. It existed only because the shared chip
// did not forward refs or rest props, so `<PopoverTrigger asChild>` could not
// use it; FilterChip now does both.

/** One row of a popover list — shared by the department and price pickers. */
function PickerRow({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="group flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-foreground hover:text-background"
      onClick={onClick}
    >
      {children}
      {/* The row fills ink on hover, so a `done` ring (which is also ink) would
          vanish into it — it flips to paper for the hovered row. */}
      {selected && (
        <StationRing
          state="done"
          className="shrink-0 group-hover:border-background group-hover:bg-background"
        />
      )}
    </button>
  );
}

/**
 * The single sticky control row for /marketplace: dominant search field,
 * the four highest-value facets as one-tap chips, and the long-tail
 * filters demoted to a Sheet. All state lives in the URL.
 */
export function MarketplaceControlBar({
  filters,
  onFiltersChange,
  sortBy,
  sortOptions,
  onSortChange,
  viewMode,
  onViewModeChange,
  includeAdult,
  onIncludeAdultChange,
  resultCount,
  onClearAll,
}: MarketplaceControlBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  // Search text types locally, applies debounced; chips apply instantly.
  const [search, setSearch] = useState(filters.search ?? '');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setSearch(filters.search ?? '');
  }, [filters.search]);
  const searchDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const applySearch = (value: string) => {
    onFiltersChange({ ...filters, search: value.trim() || undefined });
  };
  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => applySearch(value), 300);
  };
  useEffect(() => () => clearTimeout(searchDebounce.current), []);

  // Occasion chips ride the existing ?occ= param (merged into tags by the page).
  const activeOcc = searchParams.get('occ') ?? '';
  const toggleOcc = (slug: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (activeOcc === slug) next.delete('occ');
        else next.set('occ', slug);
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  // Department chip → popover with umbrella counts.
  const { data: subcategoryOptions } = useMarketplaceSubcategoryTiles(null);
  const departmentCounts = new Map<string, number>();
  for (const opt of subcategoryOptions) {
    const d = departmentOf(opt.slug);
    departmentCounts.set(d, (departmentCounts.get(d) ?? 0) + opt.count);
  }
  const departments = DEPARTMENT_ORDER.filter((d) => (departmentCounts.get(d) ?? 0) > 0);
  const [deptOpen, setDeptOpen] = useState(false);
  const pickDepartment = (d: string | undefined) => {
    setDeptOpen(false);
    onFiltersChange({
      ...filters,
      department: d,
      // Drop a subcategory that left the umbrella.
      subcategory:
        filters.subcategory && d && departmentOf(filters.subcategory) !== d
          ? undefined
          : d
            ? filters.subcategory
            : undefined,
    });
  };

  // Queer-owned chip → one-tap ownership filter.
  const owned = filters.communityOwned ?? [];
  const queerOwnedActive = QUEER_OWNED_VALUES.some((v) => owned.includes(v));
  const toggleQueerOwned = () => {
    const next = queerOwnedActive
      ? owned.filter((v) => !QUEER_OWNED_VALUES.includes(v))
      : [...new Set([...owned, ...QUEER_OWNED_VALUES])];
    onFiltersChange({ ...filters, communityOwned: next.length > 0 ? next : undefined });
  };

  // Price chip → popover with four fixed bands.
  const [priceOpen, setPriceOpen] = useState(false);
  const activeBand = filters.priceRange
    ? PRICE_BANDS.find((b) => b.token === priceToToken(filters.priceRange!))
    : undefined;
  const pickBand = (band: (typeof PRICE_BANDS)[number] | undefined) => {
    setPriceOpen(false);
    onFiltersChange({
      ...filters,
      priceRange: band ? { min: band.min, max: band.max } : undefined,
    });
  };

  const activeCount = countActiveFilters(filters);
  const facets = describeActiveFilters(filters);

  return (
    <div className="flex flex-col gap-2 md:gap-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <TransitIcon
            name="search"
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            placeholder="Search products and services..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.defaultPrevented) {
                clearTimeout(searchDebounce.current);
                applySearch(search);
              }
            }}
            style={{ paddingLeft: 42 }}
            className="h-12 border-[3px] border-foreground bg-background text-15 shadow-hard"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={false}
            aria-label="Search products and services"
          />
          <MarketplaceSearchSuggestions
            query={search}
            inputRef={inputRef}
            onPick={(q) => {
              setSearch(q);
              clearTimeout(searchDebounce.current);
              applySearch(q);
            }}
          />
        </div>
        <Button
          variant="outline"
          className="h-12"
          onClick={() => setSheetOpen(true)}
          aria-label="All filters"
        >
          <TransitIcon name="filter" size={18} />
          <span className="hidden sm:inline">All filters</span>
          {activeCount > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center bg-foreground px-1.5 text-2xs font-bold text-background">
              {activeCount}
            </span>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 pb-1">
          <Popover open={deptOpen} onOpenChange={setDeptOpen}>
            <PopoverTrigger asChild>
              <FilterChip
                active={Boolean(filters.department)}
                aria-label="Filter by department"
                label={filters.department ? departmentLabel(filters.department) : 'Department'}
              />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
              <ul className="m-0 flex list-none flex-col p-0">
                <li>
                  <PickerRow
                    selected={!filters.department}
                    onClick={() => pickDepartment(undefined)}
                  >
                    All departments
                  </PickerRow>
                </li>
                {departments.map((d) => (
                  <li key={d}>
                    <PickerRow
                      selected={filters.department === d}
                      onClick={() => pickDepartment(d)}
                    >
                      <span>
                        {departmentLabel(d)}
                        <span className="ml-1.5 text-xs tabular-nums opacity-70">
                          {(departmentCounts.get(d) ?? 0).toLocaleString()}
                        </span>
                      </span>
                    </PickerRow>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>

          <FilterChip active={queerOwnedActive} onClick={toggleQueerOwned} label="Queer-owned" />

          <Popover open={priceOpen} onOpenChange={setPriceOpen}>
            <PopoverTrigger asChild>
              <FilterChip
                active={Boolean(filters.priceRange)}
                aria-label="Filter by price"
                label={
                  activeBand
                    ? activeBand.label
                    : filters.priceRange
                      ? `$${filters.priceRange.min}+`
                      : 'Price'
                }
              />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-48 p-2">
              <ul className="m-0 flex list-none flex-col p-0">
                <li>
                  <PickerRow selected={!filters.priceRange} onClick={() => pickBand(undefined)}>
                    Any price
                  </PickerRow>
                </li>
                {PRICE_BANDS.map((b) => (
                  <li key={b.token}>
                    <PickerRow selected={activeBand?.token === b.token} onClick={() => pickBand(b)}>
                      {b.label}
                    </PickerRow>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>

          <span className="mx-1 h-5 w-px shrink-0 bg-foreground" aria-hidden="true" />

          {OCCASION_CHIPS.map((c) => (
            <FilterChip
              key={c.slug}
              active={activeOcc === c.slug}
              onClick={() => toggleOcc(c.slug)}
              label={c.label}
            />
          ))}
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          <SavedSearchesButton />
          {/* A native <select> restyled to chip DNA, following HistoryTimeline:
              src/components/ui/select.tsx is still on pre-rebrand tokens
              (bg-inverse-surface, ring-spot) and renders as a permanently
              ink-filled chip, i.e. it reads as an active filter at all times. */}
          <label className="sr-only" htmlFor="marketplace-sort">
            Sort listings
          </label>
          <select
            id="marketplace-sort"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="h-8 shrink-0 border-2 border-foreground bg-background px-2 text-13 font-bold text-foreground"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {/* Two labelled chips, not two ambiguous glyphs. */}
          <FilterChip
            active={viewMode === 'grid'}
            onClick={() => onViewModeChange('grid')}
            label="Grid"
          />
          <FilterChip
            active={viewMode === 'list'}
            onClick={() => onViewModeChange('list')}
            label="List"
          />
          {/* Default-SFW browse is a real editorial position, and until now it
              was invisible — the toggle lived inside the filter sheet, so a
              reader could not tell the catalogue was filtered at all. */}
          <FilterChip
            active={includeAdult}
            onClick={() => onIncludeAdultChange(!includeAdult)}
            label="Show 18+"
          />
        </div>
      </div>

      {/* Active-filter row — the last piece of the anti-flip work. Facets come
          from describeActiveFilters, the same list the zero-result rescue
          reads, so the two surfaces can never disagree about which dimensions
          exist or what they are called. Uncapped on purpose. */}
      {facets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t-2 border-foreground pt-4">
          <span className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
            Filtering by
          </span>
          {facets.map((facet) => (
            <FilterChip
              key={facet.noun}
              active
              onClick={() => onFiltersChange(facet.next)}
              aria-label={`Remove filter: ${facet.noun}`}
              label={
                <>
                  {facet.noun}
                  <span aria-hidden="true">×</span>
                </>
              }
            />
          ))}
          {onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-13 font-bold underline underline-offset-2"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      <MarketplaceFilterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        filters={filters}
        onFiltersChange={onFiltersChange}
        includeAdult={includeAdult}
        onIncludeAdultChange={onIncludeAdultChange}
        resultCount={resultCount}
      />
    </div>
  );
}
