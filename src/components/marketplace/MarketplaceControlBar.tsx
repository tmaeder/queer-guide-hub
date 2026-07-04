import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Check, Grid, List, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MarketplaceSearchSuggestions } from './MarketplaceSearchSuggestions';
import { MarketplaceFilterSheet } from './MarketplaceFilterSheet';
import { SavedSearchesButton } from './SavedSearchesButton';
import type { MarketplaceFiltersInput, MarketplaceSort } from '@/hooks/useMarketplace';
import { useMarketplaceSubcategoryTiles } from '@/hooks/useMarketplaceQueries';
import { DEPARTMENT_ORDER, departmentLabel, departmentOf, OCCASION_CHIPS } from '@/lib/marketplaceTaxonomy';
import { PRICE_BANDS, countActiveFilters, priceToToken } from '@/lib/marketplaceFilterParams';

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
}

// Spreads rest props (and React 19 ref-as-prop) so PopoverTrigger asChild works.
function FacetChip({
  active,
  children,
  ...rest
}: { active: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement> & {
    ref?: React.Ref<HTMLButtonElement>;
  }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...rest}
      className={`inline-flex min-h-0 shrink-0 items-center gap-1.5 rounded-badge border px-2 py-1 text-13 transition-colors ${
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-background text-foreground hover:bg-muted'
      }`}
    >
      {children}
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
}: MarketplaceControlBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  // Search text types locally, applies debounced; chips apply instantly.
  const [search, setSearch] = useState(filters.search ?? '');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setSearch(filters.search ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            style={{ left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16 }}
            className="absolute text-muted-foreground"
            aria-hidden="true"
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
            style={{ paddingLeft: 36 }}
            className="h-12 text-15"
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
          <SlidersHorizontal size={16} />
          <span className="hidden sm:inline">All filters</span>
          {activeCount > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-badge bg-foreground px-1.5 text-2xs font-medium text-background">
              {activeCount}
            </span>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 pb-1">
          <Popover open={deptOpen} onOpenChange={setDeptOpen}>
            <PopoverTrigger asChild>
              <FacetChip active={Boolean(filters.department)} aria-label="Filter by department">
                {filters.department ? departmentLabel(filters.department) : 'Department'}
              </FacetChip>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
              <ul className="flex flex-col">
                <li>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-element px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => pickDepartment(undefined)}
                  >
                    All departments
                    {!filters.department && <Check size={14} aria-hidden="true" />}
                  </button>
                </li>
                {departments.map((d) => (
                  <li key={d}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-element px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => pickDepartment(d)}
                    >
                      <span>
                        {departmentLabel(d)}
                        <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                          {(departmentCounts.get(d) ?? 0).toLocaleString()}
                        </span>
                      </span>
                      {filters.department === d && <Check size={14} aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>

          <FacetChip active={queerOwnedActive} onClick={toggleQueerOwned}>
            Queer-owned
          </FacetChip>

          <Popover open={priceOpen} onOpenChange={setPriceOpen}>
            <PopoverTrigger asChild>
              <FacetChip active={Boolean(filters.priceRange)} aria-label="Filter by price">
                {activeBand
                  ? activeBand.label
                  : filters.priceRange
                    ? `$${filters.priceRange.min}+`
                    : 'Price'}
              </FacetChip>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-48 p-2">
              <ul className="flex flex-col">
                <li>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-element px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => pickBand(undefined)}
                  >
                    Any price
                    {!filters.priceRange && <Check size={14} aria-hidden="true" />}
                  </button>
                </li>
                {PRICE_BANDS.map((b) => (
                  <li key={b.token}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-element px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => pickBand(b)}
                    >
                      {b.label}
                      {activeBand?.token === b.token && <Check size={14} aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>

          <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />

          {OCCASION_CHIPS.map((c) => (
            <FacetChip key={c.slug} active={activeOcc === c.slug} onClick={() => toggleOcc(c.slug)}>
              {c.label}
            </FacetChip>
          ))}
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          <SavedSearchesButton />
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="w-[150px] sm:w-[180px]" aria-label="Sort listings">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewModeChange('grid')}
            aria-label="Grid view"
          >
            <Grid size={16} />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewModeChange('list')}
            aria-label="List view"
          >
            <List size={16} />
          </Button>
        </div>
      </div>

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
