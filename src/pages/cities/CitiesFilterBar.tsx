import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EqualityChip, TIER_LABEL } from './EqualityChip';
import { EQUALITY_TIERS, CITIES_SORT_KEYS } from '@/utils/citiesFilter';
import type {
  CitiesSortKey,
  EqualityTier,
} from '@/utils/citiesFilter';
import type { DirectoryContinent } from '@/hooks/useCitiesDirectory';

interface CitiesFilterBarProps {
  q: string;
  onQChange: (q: string) => void;
  continents: DirectoryContinent[];
  selectedContinents: Set<string>;
  onToggleContinent: (code: string) => void;
  selectedTiers: Set<EqualityTier>;
  onToggleTier: (tier: EqualityTier) => void;
  sort: CitiesSortKey;
  onSortChange: (sort: CitiesSortKey) => void;
  totalCount: number;
  filteredCount: number;
  onReset: () => void;
}

const SORT_LABEL: Record<CitiesSortKey, string> = {
  population: 'Population',
  name: 'Name (A–Z)',
  equality: 'Equality',
  venues: 'Venues',
};

const TIER_SCORE_HINT: Record<EqualityTier, number | null> = {
  'very-high': 90,
  high: 70,
  moderate: 50,
  low: 30,
  'very-low': 10,
  unknown: null,
};

function ChipButton({
  pressed,
  onPress,
  label,
  children,
}: {
  pressed: boolean;
  onPress: () => void;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onPress}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-element border px-3 py-1.5 text-13 font-medium transition-colors',
        pressed
          ? 'border-foreground bg-foreground text-background'
          : 'border-foreground/15 bg-background text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

export function CitiesFilterBar({
  q,
  onQChange,
  continents,
  selectedContinents,
  onToggleContinent,
  selectedTiers,
  onToggleTier,
  sort,
  onSortChange,
  totalCount,
  filteredCount,
  onReset,
}: CitiesFilterBarProps) {
  const { t } = useTranslation();

  const hasFilters =
    q.length > 0 || selectedContinents.size > 0 || selectedTiers.size > 0;

  return (
    <div
      className="sticky top-0 z-20 -mx-4 md:mx-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border"
      role="group"
      aria-label={t('cities.filtersAriaLabel', 'Filter cities')}
    >
      <div className="px-4 md:px-0 py-4 space-y-4">
        {/* Row 1: Search + Reset */}
        <div className="flex items-center gap-3">
          <div className="max-w-[480px] flex-1">
            <Input
              aria-label={t('cities.searchAriaLabel', 'Search cities')}
              placeholder={t('cities.searchPlaceholder', 'Search cities…')}
              value={q}
              onChange={(e) => onQChange(e.target.value)}
            />
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="shrink-0"
              aria-label={t('cities.resetFilters', 'Reset filters')}
            >
              <X size={14} aria-hidden="true" />
              <span className="ml-1.5">{t('cities.reset', 'Reset')}</span>
            </Button>
          )}
        </div>

        {/* Row 2: Continent chips */}
        {continents.length > 0 && (
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t('cities.continentsAriaLabel', 'Filter by continent')}
          >
            {continents.map((c) => {
              const code = c.code.toLowerCase();
              const pressed = selectedContinents.has(code);
              return (
                <ChipButton
                  key={c.code}
                  pressed={pressed}
                  onPress={() => onToggleContinent(c.code)}
                  label={c.name}
                >
                  {c.name}
                </ChipButton>
              );
            })}
          </div>
        )}

        {/* Row 3: Equality tier chips + sort */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t('cities.equalityAriaLabel', 'Filter by equality score')}
          >
            {EQUALITY_TIERS.map((tier) => {
              const pressed = selectedTiers.has(tier);
              return (
                <ChipButton
                  key={tier}
                  pressed={pressed}
                  onPress={() => onToggleTier(tier)}
                  label={TIER_LABEL[tier]}
                >
                  <EqualityChip
                    score={TIER_SCORE_HINT[tier]}
                    showLabel
                    className={pressed ? 'border-background/20 bg-transparent text-background' : ''}
                  />
                </ChipButton>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="cities-sort" className="text-13 text-muted-foreground">
              {t('cities.sortLabel', 'Sort')}
            </label>
            <Select
              value={sort}
              onValueChange={(v) => onSortChange(v as CitiesSortKey)}
            >
              <SelectTrigger id="cities-sort" className="w-[180px]" aria-label={t('cities.sortAriaLabel', 'Sort cities')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CITIES_SORT_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`cities.sort.${k}`, SORT_LABEL[k])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Result count */}
        <p
          className="text-13 text-muted-foreground m-0"
          aria-live="polite"
          role="status"
        >
          {t('cities.resultCount', '{{shown}} of {{total}} cities', {
            shown: filteredCount,
            total: totalCount,
          })}
        </p>
      </div>
    </div>
  );
}
