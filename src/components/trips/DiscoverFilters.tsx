import { SlidersHorizontal, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from '@/components/ui/sheet';

export type TravelerType = 'any' | 'solo' | 'couple' | 'group' | 'family';
export type DurationBucket = 'any' | 'weekend' | 'week' | 'long';

export interface DiscoverFilterState {
  travelerType: TravelerType;
  duration: DurationBucket;
  minEqualityScore: number;
  hasCover: boolean;
  hasOwnerProfile: boolean;
}

export const DEFAULT_FILTERS: DiscoverFilterState = {
  travelerType: 'any',
  duration: 'any',
  minEqualityScore: 0,
  hasCover: false,
  hasOwnerProfile: false,
};

export function filtersAreEmpty(f: DiscoverFilterState): boolean {
  return (
    f.travelerType === 'any' &&
    f.duration === 'any' &&
    f.minEqualityScore === 0 &&
    !f.hasCover &&
    !f.hasOwnerProfile
  );
}

interface Props {
  value: DiscoverFilterState;
  onChange: (next: DiscoverFilterState) => void;
}

const TRAVELER_TYPES: TravelerType[] = ['any', 'solo', 'couple', 'group', 'family'];
const DURATION_BUCKETS: DurationBucket[] = ['any', 'weekend', 'week', 'long'];

function travelerLabel(v: TravelerType): string {
  switch (v) {
    case 'any':
      return 'Any';
    case 'solo':
      return 'Solo';
    case 'couple':
      return 'Couple';
    case 'group':
      return 'Group';
    case 'family':
      return 'Family';
  }
}

function durationLabel(v: DurationBucket): string {
  switch (v) {
    case 'any':
      return 'Any length';
    case 'weekend':
      return 'Weekend (1–3 days)';
    case 'week':
      return 'Week (4–9 days)';
    case 'long':
      return 'Long (10+ days)';
  }
}

export function DiscoverFilters({ value, onChange }: Props) {
  const { t } = useTranslation();
  const activeCount =
    (value.travelerType !== 'any' ? 1 : 0) +
    (value.duration !== 'any' ? 1 : 0) +
    (value.minEqualityScore > 0 ? 1 : 0) +
    (value.hasCover ? 1 : 0) +
    (value.hasOwnerProfile ? 1 : 0);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant={activeCount > 0 ? 'default' : 'outline'}
          size="sm"
          className="h-10"
          aria-label={t('trips.discover.filtersAria', 'Open filters')}
        >
          <SlidersHorizontal style={{ width: 14, height: 14, marginRight: 6 }} />
          {t('trips.discover.filtersButton', 'Filters')}
          {activeCount > 0 && (
            <span
              className="ml-2 inline-flex items-center justify-center rounded-full bg-background text-foreground text-[0.6875rem] font-bold h-5 min-w-5 px-1"
              aria-label={t('trips.discover.activeCountAria', '{{count}} active', {
                count: activeCount,
              })}
            >
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('trips.discover.filters.title', 'Filter trips')}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-7 mt-6 pb-8">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t('trips.discover.filters.travelerType', 'Traveler type')}
            </h4>
            <div className="flex flex-wrap gap-2">
              {TRAVELER_TYPES.map((tt) => {
                const selected = value.travelerType === tt;
                return (
                  <button
                    key={tt}
                    type="button"
                    onClick={() => onChange({ ...value, travelerType: tt })}
                    aria-pressed={selected}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                      selected
                        ? 'bg-foreground text-background border-transparent'
                        : 'bg-background text-foreground border-border hover:border-foreground/40'
                    }`}
                  >
                    {t(`trips.discover.travelerType.${tt}`, travelerLabel(tt))}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t('trips.discover.filters.duration', 'Duration')}
            </h4>
            <div className="flex flex-col gap-2">
              {DURATION_BUCKETS.map((d) => {
                const selected = value.duration === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onChange({ ...value, duration: d })}
                    aria-pressed={selected}
                    className={`text-left text-sm font-medium px-3 py-2 rounded-md border transition-colors ${
                      selected
                        ? 'bg-foreground text-background border-transparent'
                        : 'bg-background text-foreground border-border hover:border-foreground/40'
                    }`}
                  >
                    {t(`trips.discover.duration.${d}`, durationLabel(d))}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('trips.discover.filters.minEquality', 'Min equality score')}
              </h4>
              <span
                className="text-xs font-bold tabular-nums"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {value.minEqualityScore === 0
                  ? t('trips.discover.filters.noMin', 'No min')
                  : `≥ ${value.minEqualityScore}`}
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={5}
              value={[value.minEqualityScore]}
              onValueChange={(v) =>
                onChange({ ...value, minEqualityScore: v[0] ?? 0 })
              }
              aria-label={t(
                'trips.discover.filters.minEqualityAria',
                'Minimum equality score',
              )}
            />
            <p className="text-[0.6875rem] text-muted-foreground mt-2 leading-relaxed">
              {t(
                'trips.discover.filters.minEqualityHint',
                'Hides trips visiting countries below this LGBTQ+ legal equality score.',
              )}
            </p>
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t('trips.discover.filters.quality', 'Trip quality')}
            </h4>
            <label className="flex items-center gap-3 cursor-pointer py-1.5">
              <input
                type="checkbox"
                checked={value.hasCover}
                onChange={(e) =>
                  onChange({ ...value, hasCover: e.target.checked })
                }
                className="h-4 w-4 accent-foreground"
              />
              <span className="text-sm">
                {t('trips.discover.filters.hasCover', 'Has cover photo')}
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer py-1.5">
              <input
                type="checkbox"
                checked={value.hasOwnerProfile}
                onChange={(e) =>
                  onChange({ ...value, hasOwnerProfile: e.target.checked })
                }
                className="h-4 w-4 accent-foreground"
              />
              <span className="text-sm">
                {t(
                  'trips.discover.filters.hasOwnerProfile',
                  'Owner has a profile',
                )}
              </span>
            </label>
          </section>
        </div>

        <SheetFooter className="border-t border-border pt-4 sticky bottom-0 bg-background">
          <Button
            variant="ghost"
            onClick={() => onChange(DEFAULT_FILTERS)}
            disabled={activeCount === 0}
          >
            <X style={{ width: 14, height: 14, marginRight: 6 }} />
            {t('trips.discover.filters.clear', 'Clear all')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function applyAdvancedFilters<
  T extends {
    duration_days: number;
    min_equality_score: number | null;
    cover_image_url: string | null;
    owner: { display_name: string | null } | null;
    traveler_type: 'solo' | 'couple' | 'group' | 'family' | null;
  },
>(trips: T[], f: DiscoverFilterState): T[] {
  return trips.filter((t) => {
    if (f.duration !== 'any') {
      const d = t.duration_days;
      if (f.duration === 'weekend' && (d < 1 || d > 3)) return false;
      if (f.duration === 'week' && (d < 4 || d > 9)) return false;
      if (f.duration === 'long' && d < 10) return false;
    }
    if (f.minEqualityScore > 0) {
      if ((t.min_equality_score ?? -1) < f.minEqualityScore) return false;
    }
    if (f.hasCover && !t.cover_image_url) return false;
    if (f.hasOwnerProfile && !t.owner?.display_name) return false;
    if (f.travelerType !== 'any' && t.traveler_type !== f.travelerType) {
      return false;
    }
    return true;
  });
}
