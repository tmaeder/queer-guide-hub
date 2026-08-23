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
import {
  useMarketplaceSubcategoryTiles,
  useMarketplaceAttributeFacets,
  useMarketplaceAttributeVocab,
  useMarketplaceTagFacets,
} from '@/hooks/useMarketplaceQueries';
import {
  DEPARTMENT_ORDER,
  SIZE_ORDER,
  departmentLabel,
  departmentOf,
  attributeFacetsForDepartment,
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
          className="border shrink-0 group-hover:border-background group-hover:bg-background"
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

  // ONE contextual attribute chip, department-gated: Size for garment
  // departments, Genre for books_art. The full attribute surface lives in
  // the sheet — the band stays chips-not-forms.
  const deptKinds = attributeFacetsForDepartment(filters.department);
  const wantSizeChip = Boolean(filters.department) && deptKinds.includes('size');
  const wantGenreChip = filters.department === 'books_art';
  const { data: attributeFacetData } = useMarketplaceAttributeFacets(
    wantSizeChip || wantGenreChip ? filters.department : null,
    filters.subcategoryGroup,
    includeAdult,
  );
  const { data: attributeVocab } = useMarketplaceAttributeVocab();
  // Facet-driven tag chips after the divider (occasion kind first) — the
  // hardcoded OCCASION_CHIPS survive as the loading/empty fallback so the
  // band never jumps. Chips toggle their slug in ?tags= (multi-select);
  // legacy ?occ= bookmarks keep parsing in Marketplace.tsx but nothing
  // writes ?occ= anymore.
  const { data: tagFacetData } = useMarketplaceTagFacets(
    filters.department,
    filters.subcategoryGroup,
    includeAdult,
  );
  const facetChips = tagFacetData
    .filter((f) => f.kind === 'occasion' || f.kind === 'vibe')
    .sort((a, b) => (a.kind === b.kind ? b.count - a.count : a.kind === 'occasion' ? -1 : 1))
    .slice(0, 6)
    .map((f) => ({ slug: f.slug, label: f.name }));
  const bandChips = facetChips.length > 0 ? facetChips : OCCASION_CHIPS;
  const [attrOpen, setAttrOpen] = useState(false);
  const selectedTags = filters.tags ?? [];
  const toggleTagSlug = (slug: string) => {
    const next = selectedTags.includes(slug)
      ? selectedTags.filter((t) => t !== slug)
      : [...selectedTags, slug];
    onFiltersChange({ ...filters, tags: next.length > 0 ? next : undefined });
  };
  // Alpha ladder only in the band (numerics live in the sheet), in ladder
  // order — never count order (that puts M before S before XL randomly).
  const sizeChipOptions = wantSizeChip
    ? attributeFacetData
        .filter((f) => f.kind === 'size' && (SIZE_ORDER as readonly string[]).includes(f.slug))
        .sort(
          (a, b) =>
            (SIZE_ORDER as readonly string[]).indexOf(a.slug) -
            (SIZE_ORDER as readonly string[]).indexOf(b.slug),
        )
    : [];
  const genreNameBySlug = new Map(
    attributeVocab
      .filter((a) => a.kind === 'genre')
      .map((a) => [a.slug.slice('genre-'.length), a.name]),
  );
  const genreChipOptions = wantGenreChip
    ? attributeFacetData.filter((f) => f.kind === 'genre')
    : [];
  const activeSizeCount = selectedTags.filter((t) => t.startsWith('size-')).length;
  const activeGenreCount = selectedTags.filter((t) => t.startsWith('genre-')).length;

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
            className="h-12 bg-card text-15 shadow-soft rounded-container"
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

          {(sizeChipOptions.length > 0 || genreChipOptions.length > 0) && (
            <Popover open={attrOpen} onOpenChange={setAttrOpen}>
              <PopoverTrigger asChild>
                <FilterChip
                  active={wantGenreChip ? activeGenreCount > 0 : activeSizeCount > 0}
                  aria-label={wantGenreChip ? 'Filter by genre' : 'Filter by size'}
                  label={
                    wantGenreChip
                      ? activeGenreCount > 0
                        ? `Genre · ${activeGenreCount}`
                        : 'Genre'
                      : activeSizeCount > 0
                        ? `Size · ${activeSizeCount}`
                        : 'Size'
                  }
                />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-2">
                <ul className="m-0 flex list-none flex-col p-0">
                  {(wantGenreChip ? genreChipOptions : sizeChipOptions).map((opt) => {
                    const slug = wantGenreChip ? `genre-${opt.slug}` : `size-${opt.slug}`;
                    const label = wantGenreChip
                      ? (genreNameBySlug.get(opt.slug) ?? opt.slug)
                      : opt.slug === 'one-size'
                        ? 'One size'
                        : opt.slug.toUpperCase();
                    return (
                      <li key={opt.slug}>
                        <PickerRow
                          selected={selectedTags.includes(slug)}
                          onClick={() => toggleTagSlug(slug)}
                        >
                          <span>
                            {label}
                            <span className="ml-1.5 text-xs tabular-nums opacity-70">
                              {opt.count.toLocaleString()}
                            </span>
                          </span>
                        </PickerRow>
                      </li>
                    );
                  })}
                </ul>
              </PopoverContent>
            </Popover>
          )}

          <span className="mx-1 h-5 w-px shrink-0 bg-foreground" aria-hidden="true" />

          {bandChips.map((c) => (
            <FilterChip
              key={c.slug}
              active={selectedTags.includes(c.slug) || activeOcc === c.slug}
              onClick={() => {
                // Retire legacy single-select ?occ= writes: an active legacy
                // chip clears via the old param; everything else multi-selects
                // through ?tags=.
                if (activeOcc === c.slug) toggleOcc(c.slug);
                else toggleTagSlug(c.slug);
              }}
              label={c.label}
            />
          ))}
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          <SavedSearchesButton />
          {/* A native <select> restyled to chip DNA, following HistoryTimeline.
              This used to say the Select primitive was stuck on pre-rebrand
              tokens; it is not — `ui/select.tsx` moved to `border-input` +
              `bg-muted` and no longer reads as a permanently-active chip. What
              keeps the native control here is the chip DNA itself: this row is
              chips, and the primitive is a field. */}
          <label className="sr-only" htmlFor="marketplace-sort">
            Sort listings
          </label>
          <select
            id="marketplace-sort"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="h-8 shrink-0 bg-card px-2 text-13 font-bold text-foreground rounded-container shadow-soft"
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
        <div className="flex flex-wrap items-center gap-2 border-t border-border-hairline pt-4">
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
