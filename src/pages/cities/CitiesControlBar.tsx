import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { FilterChip } from '@/components/transit/FilterChip';
import { EqualityChip, TIER_LABEL } from './EqualityChip';
import { EQUALITY_TIERS, CITIES_SORT_KEYS } from '@/utils/citiesFilter';
import type { CitiesSortKey, EqualityTier } from '@/utils/citiesFilter';

interface CitiesControlBarProps {
  q: string;
  onQChange: (q: string) => void;
  selectedTiers: Set<EqualityTier>;
  onToggleTier: (tier: EqualityTier) => void;
  sort: CitiesSortKey;
  onSortChange: (sort: CitiesSortKey) => void;
  totalCount: number;
  filteredCount: number;
  onReset: () => void;
  hasFilters: boolean;
}

const SORT_LABEL: Record<CitiesSortKey, string> = {
  venues: 'Most places',
  population: 'Population',
  name: 'Name (A–Z)',
  equality: 'Equality',
};

/** A representative score per tier, so the chip can show the tier's own styling
 *  rather than a bare word. Not a real measurement — never rendered as one. */
const TIER_SCORE_HINT: Record<EqualityTier, number | null> = {
  'very-high': 90,
  high: 70,
  moderate: 50,
  low: 30,
  'very-low': 10,
  unknown: null,
};

/**
 * The /cities control band.
 *
 * Continent filtering deliberately does NOT live here — it is the line index, one
 * band down, where it reads as a position on the network rather than as one more
 * dropdown. Both surfaces keep their own `role="group"`, and the two labels
 * ("Filter cities" / "Filter by continent") do not match each other's regex, so
 * the e2e locators stay unambiguous across the split.
 *
 * The sticky/border/bleed classes belong to the band WRAPPER in Cities.tsx, not to
 * this component — a full-bleed band whose own rule is its edge needs no negative
 * margins of its own.
 */
export function CitiesControlBar({
  q,
  onQChange,
  selectedTiers,
  onToggleTier,
  sort,
  onSortChange,
  totalCount,
  filteredCount,
  onReset,
  hasFilters,
}: CitiesControlBarProps) {
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t('cities.filtersAriaLabel', 'Filter cities')}
      className="flex flex-col gap-2 md:gap-4"
    >
      {/* Sort sits on the SEARCH row, not with the chips.
       *
       *  It used to share a `flex-wrap` row with the tier chips, and at 390px
       *  that row wrapped to two lines — 108px instead of ~32. Since this whole
       *  bar is sticky, those 76px were subtracted from every screen of results
       *  for the entire session. Pairing sort with the search field keeps both
       *  rows single-line at every width. */}
      <div className="flex items-center gap-2 md:gap-4">
        <div className="min-w-0 flex-1 md:max-w-[480px]">
          <Input
            aria-label={t('cities.searchAriaLabel', 'Search cities')}
            placeholder={t('cities.searchPlaceholder', 'Search cities…')}
            value={q}
            onChange={(e) => onQChange(e.target.value)}
          />
        </div>
        <label
          htmlFor="cities-sort"
          className="hidden shrink-0 text-13 text-muted-foreground md:inline"
        >
          {t('cities.sortLabel', 'Sort')}
        </label>
        {/* A native select styled to the chip's DNA. The shadcn Select trigger is
            still on pre-rebrand tokens and renders as a permanently ink-filled
            chip, which reads as an always-active filter sitting in a row of
            filters. The visible label is desktop-only; the select carries its own
            aria-label, so hiding it costs nothing to a screen reader. */}
        <select
          id="cities-sort"
          aria-label={t('cities.sortAriaLabel', 'Sort cities')}
          value={sort}
          onChange={(e) => onSortChange(e.target.value as CitiesSortKey)}
          className="h-10 max-w-[9rem] shrink-0 border-2 border-foreground bg-background px-2 text-13 font-bold text-foreground md:h-8"
        >
          {CITIES_SORT_KEYS.map((k) => (
            <option key={k} value={k}>
              {t(`cities.sort.${k}`, SORT_LABEL[k])}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={onReset}
            aria-label={t('cities.resetFilters', 'Reset filters')}
            className="shrink-0 text-13 font-bold underline underline-offset-2"
          >
            {t('cities.reset', 'Reset')}
          </button>
        )}
      </div>

      {/* One scrollable line at every width — never `flex-wrap`, which is what
          doubled this row's height on mobile. */}
      <div
        role="group"
        aria-label={t('cities.equalityAriaLabel', 'Filter by equality score')}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {EQUALITY_TIERS.map((tier) => (
          <FilterChip
            key={tier}
            active={selectedTiers.has(tier)}
            onClick={() => onToggleTier(tier)}
            // Passed explicitly: the chip's visible content is an EqualityChip
            // whose own aria-label sits on a bare <span>, which axe flags as
            // aria-prohibited-attr. The button needs its own accessible name.
            aria-label={TIER_LABEL[tier]}
            label={
              <EqualityChip
                score={TIER_SCORE_HINT[tier]}
                showLabel
                variant="ink"
                className="pointer-events-none"
              />
            }
          />
        ))}
      </div>

      <p className="m-0 text-13 text-muted-foreground" aria-live="polite" role="status">
        {t('cities.resultCount', '{{shown}} of {{total}} cities', {
          shown: filteredCount,
          total: totalCount,
        })}
      </p>
    </div>
  );
}
