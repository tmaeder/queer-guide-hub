import { personalityProfessionLabel } from '@/lib/professionDisplay';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Search, SlidersHorizontal, X } from '@/components/icons';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { CompetedInSelect } from '@/components/personalities/CompetedInSelect';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { personGlyph } from '@/lib/cardGlyphs';
import {
  useProfessionFacets,
  type PersonalityFilters,
  type PersonalitySort,
} from '@/hooks/usePersonalities';

interface Props {
  filters: PersonalityFilters;
  onFiltersChange: (filters: PersonalityFilters) => void;
  /** Rendered beside the search box (the page's Grid / Timeline / Map switch). */
  trailing?: ReactNode;
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
  /** The same mark the personality cards carry for this profession. */
  icon?: TransitIconName;
}

/** A real `<button>`. This was a `<Badge>` carrying an `onClick` — a `<div>`
 *  with a click handler, so it was unreachable by keyboard and announced
 *  nothing about its pressed state, on the page's primary filter control. */
function FilterChip({ label, active, onClick, capitalize, icon }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-element px-4 text-13 font-bold transition-colors',
        active ? 'bg-foreground text-background' : 'bg-background hover:bg-surface-container',
        capitalize && 'capitalize',
      )}
      style={{ scrollSnapAlign: 'start' }}
    >
      {icon && <TransitIcon name={icon} size={18} />}
      {label}
    </button>
  );
}

export function PersonalitiesFiltersBar({ filters, onFiltersChange, trailing }: Props) {
  const { t } = useTranslation();
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setSearchInput(filters.search ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  const professionChips = useMemo(() => facets.map((f) => f.profession), [facets]);

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
    <div className="flex flex-col gap-4">
      {/* Row 1: search, with the view switch beside it (below it on phones) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-full sm:basis-0 sm:flex-1">
          {/* Was `text-background/70` — paper-on-paper inside a `bg-background`
              container, i.e. an invisible search icon. */}
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder={t(
              'pages.personalities.ui.search',
              'Search by name, profession, description...',
            )}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search personalities"
            className="h-11 pl-10 pr-10"
          />
          {searchInput && (
            <button
              type="button"
              aria-label={t('pages.personalities.ui.clearSearch', 'Clear search')}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex"
              onClick={() => setSearchInput('')}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {trailing}
      </div>

      {/* Row 2: competition, sort and the rest of the filters */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="hidden text-2xs font-bold uppercase tracking-label text-muted-foreground sm:block">
            Competed in
          </span>
          <CompetedInSelect
            value={filters.competed_in}
            onChange={(competed_in) => onFiltersChange({ ...filters, competed_in })}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-2xs font-bold uppercase tracking-label text-muted-foreground sm:block">
            {t('pages.personalities.ui.sort', 'Sort')}
          </span>
          <Select
            value={filters.sortBy ?? 'featured'}
            onValueChange={(v) => setSort(v as PersonalitySort)}
          >
            <SelectTrigger
              className="w-40"
              aria-label={t('pages.personalities.ui.sortPeople', 'Sort personalities')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(`pages.personalities.ui.${opt.value}`, opt.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-2"
          aria-label={t('pages.personalities.ui.moreFilters', 'More filters')}
        >
          <SlidersHorizontal size={16} />
          {t('pages.personalities.ui.more', 'More')}
        </Button>
      </div>

      {/* Row 3: profession chips, each with the mark its cards carry */}
      <div
        role="group"
        aria-label={t('pages.personalities.ui.professionFilters', 'Profession filters')}
        tabIndex={0}
        className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        <FilterChip
          label={t('pages.personalities.ui.all', 'All')}
          icon="community"
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
          label={t('pages.personalities.ui.living', 'Living')}
          icon="sparkle"
          active={filters.is_living === true}
          onClick={() => setLiving(filters.is_living === true ? null : true)}
        />
        <FilterChip
          label={t('pages.personalities.ui.historical', 'Historical')}
          icon="hours"
          active={filters.is_living === false}
          onClick={() => setLiving(filters.is_living === false ? null : false)}
        />
        {professionChips.map((profession) => {
          const active = filters.profession === profession;
          return (
            <FilterChip
              key={profession}
              label={personalityProfessionLabel(profession, t) || profession}
              icon={personGlyph(profession)}
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
            <SheetTitle>{t('pages.personalities.ui.moreFilters', 'More filters')}</SheetTitle>
            <SheetDescription>
              {t('pages.personalities.ui.refine', 'Refine the personalities directory.')}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-6 mt-4">
            <div className="flex flex-col gap-2">
              <Label>{t('pages.personalities.ui.verificationStatus', 'Verification status')}</Label>
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
                  <SelectItem value="all">{t('pages.personalities.ui.all', 'All')}</SelectItem>
                  <SelectItem value="verified">
                    {t('pages.personalities.ui.verified', 'Verified')}
                  </SelectItem>
                  <SelectItem value="pending">
                    {t('pages.personalities.ui.pending', 'Pending')}
                  </SelectItem>
                  <SelectItem value="disputed">
                    {t('pages.personalities.ui.disputed', 'Disputed')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4">
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
                {t('pages.personalities.ui.featuredOnly', 'Featured only')}
              </Label>
            </div>

            <div className="flex items-start gap-4">
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
                  {t('pages.personalities.ui.includeAdult', 'Include adult performers')}
                </Label>
                <span className="block text-xs text-muted-foreground">
                  {t(
                    'pages.personalities.ui.adultHint',
                    'Hidden by default. Opt in to browse performers alongside other personalities.',
                  )}
                </span>
              </div>
            </div>

            <div className="flex gap-2 mt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() =>
                  onFiltersChange({
                    sortBy: filters.sortBy ?? 'featured',
                  })
                }
              >
                {t('pages.personalities.ui.resetFilters', 'Reset filters')}
              </Button>
              <Button className="flex-1" onClick={() => setDrawerOpen(false)}>
                {t('pages.personalities.ui.done', 'Done')}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
