import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Grid, GanttChart, MapPin } from 'lucide-react';
import { displayCityName } from '@/utils/cityDisplay';
import { ShareFiltersButton } from '@/components/events/ShareFiltersButton';
import type { EventSort } from '@/utils/eventsQueryString';

type ViewMode = 'grid' | 'timeline' | 'map';

interface EventsResultBarProps {
  eventsCount: number;
  totalCount: number | null | undefined;
  autoLocationLabel: string | null;
  cities: string[];
  onShowWorldwide: () => void;
  showPast: boolean;
  onToggleShowPast: () => void;
  sort: EventSort;
  onSortChange: (v: EventSort) => void;
  userLocation: { lat: number; lng: number } | null;
  nearMe: boolean;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
}

/** Result count + past-events toggle + sort + share + grid/timeline/map view toggle. */
export function EventsResultBar({
  eventsCount,
  totalCount,
  autoLocationLabel,
  cities,
  onShowWorldwide,
  showPast,
  onToggleShowPast,
  sort,
  onSortChange,
  userLocation,
  nearMe,
  viewMode,
  onViewModeChange,
}: EventsResultBarProps) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {/* D7: show "Showing N of M events" whenever the true total
            exceeds what's currently rendered, so users aren't misled
            that "24" means "24 in the world". */}
        {autoLocationLabel && cities.length === 1 && cities[0] === autoLocationLabel
          ? totalCount && totalCount > eventsCount
            ? t('pages.events.resultsNearOfTotal', {
                count: eventsCount,
                total: totalCount,
                city: displayCityName(autoLocationLabel, i18n.language),
                defaultValue: `Showing ${eventsCount} of ${totalCount} events near ${displayCityName(autoLocationLabel, i18n.language)}`,
              })
            : t('pages.events.resultsNear', {
                count: eventsCount,
                city: displayCityName(autoLocationLabel, i18n.language),
                defaultValue: `${eventsCount} events near ${displayCityName(autoLocationLabel, i18n.language)}`,
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
              })}
        {autoLocationLabel && cities.length === 1 && cities[0] === autoLocationLabel && (
          <button
            type="button"
            onClick={onShowWorldwide}
            className="ml-2 underline hover:text-foreground"
          >
            {t('pages.events.showWorldwide', 'Show worldwide')}
          </button>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={showPast ? 'default' : 'outline'}
          size="sm"
          onClick={onToggleShowPast}
          aria-pressed={showPast}
        >
          {t('pages.events.showPastEvents', 'Past events')}
        </Button>
        <Select value={sort} onValueChange={(v) => onSortChange(v as EventSort)}>
          <SelectTrigger
            className="w-full sm:w-[160px]"
            aria-label={t('pages.events.sortLabel', 'Sort events')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date-asc">{t('pages.events.sort.dateAsc', 'Soonest first')}</SelectItem>
            <SelectItem value="date-desc">{t('pages.events.sort.dateDesc', 'Latest first')}</SelectItem>
            <SelectItem value="distance" disabled={!userLocation && !nearMe}>
              {t('pages.events.sort.distance', 'Closest to me')}
            </SelectItem>
            <SelectItem value="popularity">{t('pages.events.sort.popularity', 'Most popular')}</SelectItem>
            <SelectItem value="recent">{t('pages.events.sort.recent', 'Recently added')}</SelectItem>
          </SelectContent>
        </Select>
        <ShareFiltersButton />
        <div
          className="flex items-center gap-1 p-1 bg-muted rounded-element"
          role="group"
          aria-label={t('pages.events.viewMode', 'View mode')}
        >
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('grid')}
            aria-pressed={viewMode === 'grid'}
            aria-label={t('pages.events.gridView', 'Grid')}
            style={{ display: 'inline-flex', gap: 6 }}
          >
            <Grid size={16} />
            <span className="hidden sm:inline">{t('pages.events.gridView', 'Grid')}</span>
          </Button>
          <Button
            variant={viewMode === 'timeline' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('timeline')}
            aria-pressed={viewMode === 'timeline'}
            aria-label={t('pages.events.timelineView', 'Timeline')}
            style={{ display: 'inline-flex', gap: 6 }}
          >
            <GanttChart size={16} />
            <span className="hidden sm:inline">{t('pages.events.timelineView', 'Timeline')}</span>
          </Button>
          <Button
            variant={viewMode === 'map' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewModeChange('map')}
            aria-pressed={viewMode === 'map'}
            aria-label={t('pages.events.mapView', 'Map')}
            style={{ display: 'inline-flex', gap: 6 }}
          >
            <MapPin size={16} />
            <span className="hidden sm:inline">{t('pages.events.mapView', 'Map')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
