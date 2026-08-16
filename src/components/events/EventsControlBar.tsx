import { useTranslation } from 'react-i18next';
import { Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FilterChip } from '@/components/transit/FilterChip';
import { PresetChips, type EventPresetId } from '@/components/events/PresetChips';

interface EventsControlBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  onSearchSubmit: () => void;

  activePreset: EventPresetId | null;
  onPresetSelect: (p: EventPresetId | null) => void;
  presetCounts?: Partial<Record<EventPresetId, number>>;

  showPast: boolean;
  onToggleShowPast: () => void;

  /** How many of the sheet's own dimensions are set — the badge on Filters. */
  sheetFilterCount: number;
  onOpenFilters: () => void;
  filtersOpen: boolean;
}

/**
 * The sticky control band for /events: two rows, and nothing else.
 *
 * It replaces two stacked surfaces — a 352px `bg-card` filter block that was not
 * sticky, plus a 175px sticky result bar under it — which together put the first
 * event card 1,040px down at 390x844, 1.23 of the 1.25-screen budget in
 * `e2e/page-layout.spec.ts`. A guard with a 1% margin flaps on ordinary data
 * drift (one more active-filter chip, a longer coverage note), and a flapping
 * guard is one people learn to ignore — so the fix had to be structural rather
 * than another round of gap and padding trimming.
 *
 * Two rules govern what may live here:
 *
 *  1. **Nothing wraps.** Every row is sticky cost, charged on every screen of
 *     results for the whole session. `flex-wrap` is how the old result bar grew
 *     to 175px for content that measures 44.
 *  2. **A row must earn its 44px.** Not "should it be reachable" — everything
 *     should — but "is it worth a permanent tax on the results". Search and the
 *     Filters door earn it; the presets ARE this page's navigation. Sort, the
 *     view toggle and the result count did not, and moved to a non-sticky
 *     `EventsResultHeader` directly above the grid. The long tail lives in
 *     `EventsFilterSheet`, which used to open INLINE — pushing the results down
 *     by its full height on the one interaction that means "show me more".
 *
 * Every control here is 44px tall whatever `h-*` says: `src/index.css` sets a
 * global `min-height: 44px` on button/input/select for WCAG 2.5.5, and
 * min-height beats the height utility at the box-model level. Budget rows at 44,
 * not at the class you wrote.
 */
export function EventsControlBar({
  search,
  onSearchChange,
  onSearchSubmit,
  activePreset,
  onPresetSelect,
  presetCounts,
  showPast,
  onToggleShowPast,
  sheetFilterCount,
  onOpenFilters,
  filtersOpen,
}: EventsControlBarProps) {
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t('pages.events.filtersAriaLabel', 'Filter events')}
      className="flex flex-col gap-2 md:gap-4"
    >
      {/* Row 1 — search, and one door to everything else. */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 md:max-w-[480px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label={t('pages.events.searchLabel', 'Search events')}
            placeholder={t('pages.events.searchPlaceholder', 'Search events, cities, organizers')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearchSubmit()}
            style={{ paddingLeft: 36 }}
          />
        </div>
        <Button
          variant="outline"
          className="shrink-0"
          onClick={onOpenFilters}
          aria-label={t('pages.events.filters', 'Filters')}
          aria-expanded={filtersOpen}
          style={{ display: 'inline-flex', gap: 8 }}
        >
          <Filter size={16} />
          <span className="hidden sm:inline">{t('pages.events.filters', 'Filters')}</span>
          {sheetFilterCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center bg-foreground px-1.5 text-2xs font-bold text-background">
              {sheetFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Row 2 — presets. The past-events toggle rides the same scrollable line
          rather than claiming one of its own: it is a time window like every
          chip beside it, and it stays VISIBLE rather than being demoted into the
          sheet, because "you are looking at events that already happened" is
          state a reader must be able to see without opening anything. */}
      <PresetChips
        active={activePreset}
        onSelect={onPresetSelect}
        counts={presetCounts}
        trailing={
          <FilterChip
            active={showPast}
            onClick={onToggleShowPast}
            label={t('pages.events.showPastEvents', 'Show past events')}
          />
        }
      />
    </div>
  );
}
