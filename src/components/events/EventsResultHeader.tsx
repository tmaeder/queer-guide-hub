import { useTranslation } from 'react-i18next';
import { FilterChip } from '@/components/transit/FilterChip';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { displayCityName } from '@/utils/cityDisplay';
import type { EventSort } from '@/utils/eventsQueryString';

type ViewMode = 'grid' | 'timeline' | 'map';

const SORT_ORDER: EventSort[] = ['date-asc', 'date-desc', 'distance', 'popularity', 'recent'];

interface EventsResultHeaderProps {
  eventsCount: number;
  totalCount: number | null | undefined;
  autoLocationLabel: string | null;
  cities: string[];
  onShowWorldwide: () => void;
  sort: EventSort;
  onSortChange: (v: EventSort) => void;
  userLocation: { lat: number; lng: number } | null;
  nearMe: boolean;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
}

/**
 * What you are looking at, and how it is arranged — count, sort, view mode.
 *
 * Deliberately NOT sticky. These three lived in a sticky bar that measured 175px
 * at 390px wide because it wrapped to three lines, and every one of those lines
 * was charged against every screen of results for the whole session. None of the
 * three is re-reached while scrolling: a count is read once, and sort and view
 * are mode switches. They belong with the results they describe, one row above
 * the grid, where wrapping costs a single 44px line instead of a permanent tax.
 */
const VIEW_ICON: Record<ViewMode, 'grid' | 'list' | 'map'> = {
  grid: 'grid',
  timeline: 'list',
  map: 'map',
};

export function EventsResultHeader({
  eventsCount,
  totalCount,
  autoLocationLabel,
  cities,
  onShowWorldwide,
  sort,
  onSortChange,
  userLocation,
  nearMe,
  viewMode,
  onViewModeChange,
}: EventsResultHeaderProps) {
  const { t, i18n } = useTranslation();

  const sortLabel: Record<EventSort, string> = {
    'date-asc': t('pages.events.sort.dateAsc', 'Soonest first'),
    'date-desc': t('pages.events.sort.dateDesc', 'Latest first'),
    distance: t('pages.events.sort.distance', 'Closest to me'),
    popularity: t('pages.events.sort.popularity', 'Most popular'),
    recent: t('pages.events.sort.recent', 'Recently added'),
  };

  const viewLabel: Record<ViewMode, string> = {
    grid: t('pages.events.gridView', 'Grid'),
    timeline: t('pages.events.timelineView', 'Timeline'),
    map: t('pages.events.mapView', 'Map'),
  };

  const isAutoCity = !!autoLocationLabel && cities.length === 1 && cities[0] === autoLocationLabel;
  const cityLabel = autoLocationLabel ? displayCityName(autoLocationLabel, i18n.language) : '';

  // D7: "Showing N of M" whenever the true total exceeds what is rendered, so
  // "24" is never read as "24 in the world".
  const countText = isAutoCity
    ? totalCount && totalCount > eventsCount
      ? t('pages.events.resultsNearOfTotal', {
          count: eventsCount,
          total: totalCount,
          city: cityLabel,
          defaultValue: `Showing ${eventsCount} of ${totalCount} events near ${cityLabel}`,
        })
      : t('pages.events.resultsNear', {
          count: eventsCount,
          city: cityLabel,
          defaultValue: `${eventsCount} events near ${cityLabel}`,
        })
    : totalCount && totalCount > eventsCount
      ? t('pages.events.resultsCountOfTotal', {
          count: eventsCount,
          total: totalCount,
          defaultValue: `Showing ${eventsCount} of ${totalCount} events`,
        })
      : t('pages.events.resultsCount', {
          count: eventsCount,
          defaultValue: `${eventsCount} ${eventsCount === 1 ? 'event' : 'events'}`,
        });

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 md:mb-6 md:gap-4">
      <p className="m-0 text-13 text-muted-foreground">
        {countText}
        {isAutoCity && (
          <button
            type="button"
            onClick={onShowWorldwide}
            className="ml-2 underline hover:text-foreground"
          >
            {t('pages.events.showWorldwide', 'Show worldwide')}
          </button>
        )}
      </p>

      <div className="flex items-center gap-2">
        {/* A native <select> restyled to the chip's DNA, following
            CitiesControlBar: src/components/ui/select.tsx is still on pre-rebrand
            tokens and renders as a permanently ink-filled chip, i.e. it reads as
            an active filter sitting in a row of filters. */}
        <label className="sr-only" htmlFor="events-sort">
          {t('pages.events.sortLabel', 'Sort events')}
        </label>
        {/* Sort as a symbol: the native select sits invisibly over the icon, so
            the platform picker still opens and the label stays accessible. */}
        <span
          className="relative grid size-11 shrink-0 place-items-center rounded-element bg-card shadow-soft hover:bg-foreground hover:text-background"
          title={sortLabel[sort]}
        >
          <TransitIcon name="sort" size={18} aria-hidden />
          <select
            id="events-sort"
            value={sort}
            onChange={(e) => onSortChange(e.target.value as EventSort)}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {SORT_ORDER.map((key) => (
              <option
                key={key}
                value={key}
                disabled={key === 'distance' && !userLocation && !nearMe}
              >
                {sortLabel[key]}
              </option>
            ))}
          </select>
        </span>
        {/* Icon-only toggles keep count, sort and view on one line at
            phone width; the name lives in aria-label and the tooltip. */}
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label={t('pages.events.viewMode', 'View mode')}
        >
          {(['grid', 'timeline', 'map'] as ViewMode[]).map((mode) => (
            <FilterChip
              key={mode}
              active={viewMode === mode}
              onClick={() => onViewModeChange(mode)}
              aria-label={viewLabel[mode]}
              title={viewLabel[mode]}
              className="min-w-11 justify-center px-0"
              label={<TransitIcon name={VIEW_ICON[mode]} size={18} aria-hidden />}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
