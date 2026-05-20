import { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useDebounce } from '@/hooks/useDebounce';
import {
  useProfessionFacets,
  type PersonalityFilters,
  type PersonalitySort,
} from '@/hooks/usePersonalities';

interface Props {
  filters: PersonalityFilters;
  onFiltersChange: (filters: PersonalityFilters) => void;
}

const SORT_OPTIONS: { value: PersonalitySort; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'az', label: 'A–Z' },
  { value: 'za', label: 'Z–A' },
  { value: 'popular', label: 'Most popular' },
  { value: 'newest', label: 'Newest' },
];

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  capitalize?: boolean;
}

function FilterChip({ label, active, onClick, capitalize }: FilterChipProps) {
  return (
    <Badge
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
      className={`cursor-pointer flex-shrink-0 ${capitalize ? 'capitalize' : ''}`}
      style={{ scrollSnapAlign: 'start' }}
    >
      {label}
    </Badge>
  );
}

export function PersonalitiesFiltersBar({ filters, onFiltersChange }: Props) {
  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const debouncedSearch = useDebounce(searchInput, 300);
  const { facets } = useProfessionFacets(12);

  // Push debounced search value up
  useEffect(() => {
    if ((debouncedSearch || '') !== (filters.search || '')) {
      onFiltersChange({ ...filters, search: debouncedSearch || undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Keep local search in sync when parent clears
  useEffect(() => {
    if ((filters.search || '') !== searchInput) {
      setSearchInput(filters.search ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  const professionChips = useMemo(
    () => facets.map((f) => f.profession),
    [facets],
  );

  const setProfession = (profession: string | null) => {
    onFiltersChange({ ...filters, profession: profession ?? undefined });
  };

  const setLiving = (living: boolean | null) => {
    onFiltersChange({ ...filters, is_living: living ?? undefined });
  };

  const setSort = (sortBy: PersonalitySort) => {
    onFiltersChange({ ...filters, sortBy });
  };

  const isAllActive =
    !filters.profession && filters.is_living === undefined && !filters.featured_only;

  return (
    <div className="flex flex-col gap-4 p-4 bg-background">
      {/* Row 1: search + sort */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, profession, description..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchInput && (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 flex"
              onClick={() => setSearchInput('')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:block">Sort</span>
          <Select value={filters.sortBy ?? 'featured'} onValueChange={(v) => setSort(v as PersonalitySort)}>
            <SelectTrigger style={{ width: 160 }} aria-label="Sort personalities">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-1.5"
          aria-label="More filters"
        >
          <SlidersHorizontal size={16} />
          More
        </Button>
      </div>

      {/* Row 2: profession chips */}
      <div
        role="group"
        aria-label="Profession filters"
        tabIndex={0}
        className="flex gap-2 overflow-x-auto pb-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        <FilterChip
          label="All"
          active={isAllActive}
          onClick={() =>
            onFiltersChange({
              ...filters,
              profession: undefined,
              is_living: undefined,
              featured_only: undefined,
            })
          }
        />
        <FilterChip
          label="Living"
          active={filters.is_living === true}
          onClick={() => setLiving(filters.is_living === true ? null : true)}
        />
        <FilterChip
          label="Historical"
          active={filters.is_living === false}
          onClick={() => setLiving(filters.is_living === false ? null : false)}
        />
        {professionChips.map((profession) => {
          const active = filters.profession === profession;
          return (
            <FilterChip
              key={profession}
              label={profession}
              active={active}
              onClick={() => setProfession(active ? null : profession)}
              capitalize
            />
          );
        })}
      </div>

      {/* More filters drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>More filters</SheetTitle>
            <SheetDescription>Refine the personalities directory.</SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-6 mt-4">
            <div className="flex flex-col gap-2">
              <Label>Verification status</Label>
              <Select
                value={filters.verification_status ?? 'all'}
                onValueChange={(v) =>
                  onFiltersChange({
                    ...filters,
                    verification_status: v === 'all' ? undefined : v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="disputed">Disputed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="featured-only"
                checked={filters.featured_only === true}
                onCheckedChange={(checked) =>
                  onFiltersChange({
                    ...filters,
                    featured_only: checked === true ? true : undefined,
                  })
                }
              />
              <Label htmlFor="featured-only">
                Featured only
              </Label>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="include-adult"
                checked={filters.exclude_adult === false}
                onCheckedChange={(checked) =>
                  onFiltersChange({
                    ...filters,
                    exclude_adult: checked === true ? false : true,
                  })
                }
              />
              <div>
                <Label htmlFor="include-adult">
                  Include adult performers
                </Label>
                <span className="block text-xs text-muted-foreground">
                  Hidden by default. Opt in to browse performers alongside other personalities.
                </span>
              </div>
            </div>

            <div className="flex gap-2 mt-2">
              <Button
                variant="outline"
                style={{ flex: 1 }}
                onClick={() =>
                  onFiltersChange({
                    sortBy: filters.sortBy ?? 'featured',
                  })
                }
              >
                Reset filters
              </Button>
              <Button style={{ flex: 1 }} onClick={() => setDrawerOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
