import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticTrigger } from '@/hooks/useHaptics';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { MapFiltersPanel } from '../MapFiltersPanel';
import { TimeRangePicker } from '../FilterPopovers';
import { isPresetActive, presetRange, type PresetKey } from '../mapTime';
import {
  LENS_LABELS,
  type MapFilterKey,
  type MapLens,
  type MapShellFilters,
} from '../MapShell.types';

const PRESETS: { key: PresetKey; label: string; icon: TransitIconName }[] = [
  { key: 'tonight', label: 'Tonight', icon: 'hours' },
  { key: 'weekend', label: 'This weekend', icon: 'events' },
  { key: 'month', label: 'This month', icon: 'events' },
];

const LENS_ICONS: Record<MapLens, TransitIconName> = {
  pins: 'near-you',
  density: 'after-dark',
  routes: 'route',
  boundary: 'map',
  combined: 'compass',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border-hairline pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-2xs uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

const chip =
  'inline-flex h-9 items-center gap-1.5 bg-muted rounded-element px-4 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';
const chipOn = 'bg-foreground text-background';
const chipOff = 'bg-background text-foreground hover:bg-foreground hover:text-background';

export interface MapControlsProps {
  availableFilters: MapFilterKey[];
  filters: MapShellFilters;
  onFiltersChange: (next: MapShellFilters) => void;
  lenses: MapLens[];
  lens: MapLens;
  onLensChange: (lens: MapLens) => void;
  canSave: boolean;
  savedOnly: boolean;
  onToggleSaved: () => void;
  onGeolocate: () => void;
  onFitBounds?: () => void;
  onShare: () => void;
  /** Mobile renders this inside a sheet, which has its own scroll + title. */
  compact?: boolean;
}

/**
 * Every map control that isn't search, in one surface.
 *
 * Before this there were four: a quick-filter chip strip in the command bar, a
 * "Filters" popover, a separate "Time" popover, and a "More" menu — plus a
 * mobile sheet that reimplemented all of it. One concept ("narrow what the map
 * shows") had four homes, and time in particular lived in two of them at once.
 *
 * The lens picker moved in here too. Pins / Density / Boundary / Combined are
 * rendering modes, not intents: they were four undecodable icon buttons
 * occupying prime space in the bar, next to search. They are a setting, so
 * they live with the settings, under a name that says what they do.
 */
export function MapControls({
  availableFilters,
  filters,
  onFiltersChange,
  lenses,
  lens,
  onLensChange,
  canSave,
  savedOnly,
  onToggleSaved,
  onGeolocate,
  onFitBounds,
  onShare,
  compact,
}: MapControlsProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const showTime = availableFilters.includes('time');

  // cmdk auto-selects the first tag on mount and calls scrollIntoView on it,
  // which scrolls THIS container — the panel opened already scrolled past
  // "When". Preventing the popover's own autofocus is not enough; the scroll
  // comes from the list, not from focus. Pin it back after the first frame.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = 0;
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const activePreset = (key: PresetKey) => isPresetActive(key, filters.dateRange);

  const setPreset = (key: PresetKey) => {
    hapticTrigger('nudge');
    onFiltersChange(
      activePreset(key)
        ? { ...filters, dateRange: undefined }
        : { ...filters, dateRange: presetRange(key) },
    );
  };

  return (
    <div
      ref={scrollRef}
      className={cn('flex flex-col gap-4', compact ? '' : 'max-h-[70dvh] overflow-y-auto')}
    >
      <Section title={t('map.controls.when', { defaultValue: 'When' })}>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={!!filters.openNow}
            onClick={() => {
              hapticTrigger('nudge');
              onFiltersChange({ ...filters, openNow: filters.openNow ? undefined : true });
            }}
            className={cn(chip, filters.openNow ? chipOn : chipOff)}
          >
            <span
              aria-hidden
              className={cn('h-2 w-2 rounded-full border-current', filters.openNow && 'bg-current')}
            />
            {t('map.filters.openNow', { defaultValue: 'Open now' })}
          </button>

          {showTime &&
            PRESETS.map(({ key, label, icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={activePreset(key)}
                onClick={() => setPreset(key)}
                className={cn(chip, activePreset(key) ? chipOn : chipOff)}
              >
                <TransitIcon name={icon} size={14} />
                {t(`map.filters.${key}`, { defaultValue: label })}
              </button>
            ))}
        </div>

        {/* The range picker is a full calendar. Kept behind a disclosure so
            the default panel stays one screen — presets answer the question
            most of the time, and an always-open calendar pushed every other
            control below the fold. */}
        {showTime && (
          <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs2 font-semibold text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              <TransitIcon name="events" size={12} />
              {t('map.filters.customDates', { defaultValue: 'Pick exact dates' })}
            </summary>
            <div className="pt-2">
              <TimeRangePicker
                value={filters.dateRange}
                onChange={(dateRange) => onFiltersChange({ ...filters, dateRange })}
                numberOfMonths={compact ? 1 : 2}
              />
            </div>
          </details>
        )}
      </Section>

      {canSave && (
        <Section title={t('map.controls.yours', { defaultValue: 'Yours' })}>
          <button
            type="button"
            aria-pressed={savedOnly}
            onClick={() => {
              hapticTrigger('nudge');
              onToggleSaved();
            }}
            className={cn(chip, 'self-start', savedOnly ? chipOn : chipOff)}
          >
            <TransitIcon name="saved" size={14} />
            {t('map.filters.saved', { defaultValue: 'Saved only' })}
          </button>
        </Section>
      )}

      {availableFilters.length > 0 && (
        <Section title={t('map.controls.narrow', { defaultValue: 'Narrow it down' })}>
          <MapFiltersPanel
            availableFilters={availableFilters}
            filters={filters}
            onFiltersChange={onFiltersChange}
          />
        </Section>
      )}

      {lenses.length > 1 && (
        <Section title={t('map.controls.view', { defaultValue: 'View' })}>
          <div
            role="radiogroup"
            aria-label={t('map.controls.view', { defaultValue: 'View' })}
            className="flex flex-wrap gap-1.5"
          >
            {lenses.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={l === lens}
                onClick={() => {
                  hapticTrigger('nudge');
                  onLensChange(l);
                }}
                className={cn(chip, l === lens ? chipOn : chipOff)}
              >
                <TransitIcon name={LENS_ICONS[l]} size={14} />
                {t(`map.lens.${l}`, { defaultValue: LENS_LABELS[l] })}
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title={t('map.controls.actions', { defaultValue: 'This map' })}>
        <div className="flex flex-col gap-1.5">
          <Button variant="outline" size="sm" className="justify-start gap-2" onClick={onGeolocate}>
            <TransitIcon name="near-you" size={16} />
            {t('map.actions.locate', { defaultValue: 'My location' })}
          </Button>
          {onFitBounds && (
            <Button
              variant="outline"
              size="sm"
              className="justify-start gap-2"
              onClick={onFitBounds}
            >
              <TransitIcon name="map" size={16} />
              {t('map.actions.fit', { defaultValue: 'Fit to results' })}
            </Button>
          )}
          <Button variant="outline" size="sm" className="justify-start gap-2" onClick={onShare}>
            <TransitIcon name="share" size={16} />
            {t('map.actions.share', { defaultValue: 'Share this view' })}
          </Button>
        </div>
      </Section>
    </div>
  );
}

export default MapControls;
