import { useState } from 'react';
import { Clock, CalendarDays, CalendarRange, Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MapShellFilters } from './MapShell.types';

interface MapQuickFiltersProps {
  filters: MapShellFilters;
  onChange: (next: MapShellFilters) => void;
  /** Show the Tonight/Weekend/Month chips (surfaces that expose the time filter). */
  showTime?: boolean;
  /** Saved (favorites) toggle — only rendered when the viewer is signed in. */
  canSave?: boolean;
  savedOnly?: boolean;
  onToggleSaved?: () => void;
  /** Collapse chip labels to icons below lg (desktop bar at 768–1024px). */
  compactLabels?: boolean;
}

type PresetKey = 'tonight' | 'weekend' | 'month';

const endOfDay = (d: Date) => {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
};

/** Compute a {start,end} ISO range for a preset, anchored to `now`. */
function presetRange(key: PresetKey, now = new Date()): { start: string; end: string } {
  if (key === 'tonight') {
    return { start: now.toISOString(), end: endOfDay(now).toISOString() };
  }
  if (key === 'weekend') {
    // Upcoming Fri 17:00 → Sun 23:59 (or from now if already the weekend).
    const day = now.getDay(); // 0 Sun … 6 Sat
    const fri = new Date(now);
    const daysToFri = (5 - day + 7) % 7;
    fri.setDate(now.getDate() + daysToFri);
    fri.setHours(17, 0, 0, 0);
    const sun = new Date(fri);
    sun.setDate(fri.getDate() + 2);
    const sunEnd = endOfDay(sun);
    const start = day === 0 || day === 6 || day === 5 ? now : fri;
    return { start: start.toISOString(), end: sunEnd.toISOString() };
  }
  // month → now until last day of the current month
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: now.toISOString(), end: endOfDay(end).toISOString() };
}

const PRESETS: { key: PresetKey; label: string; Icon: typeof Clock }[] = [
  { key: 'tonight', label: 'Tonight', Icon: Clock },
  { key: 'weekend', label: 'This weekend', Icon: CalendarDays },
  { key: 'month', label: 'This month', Icon: CalendarRange },
];

const PRESET_KEYS: Record<PresetKey, string> = {
  tonight: 'map.quick.tonight',
  weekend: 'map.quick.thisWeekend',
  month: 'map.quick.thisMonth',
};

/**
 * Quick-filter bar over the map: time presets (Tonight / This weekend /
 * This month) that drive the events dateRange, plus an Open-now toggle.
 * Highest-intent "what can I do right now" controls for travelers.
 */
export function MapQuickFilters({
  filters,
  onChange,
  showTime = true,
  canSave,
  savedOnly,
  onToggleSaved,
  compactLabels,
}: MapQuickFiltersProps) {
  const { t } = useTranslation();
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null);

  // Reset the active preset if the dateRange was cleared elsewhere (chip X).
  // Adjusting state during render (vs. an effect) avoids a cascading re-render.
  if (!filters.dateRange && activePreset !== null) setActivePreset(null);

  const togglePreset = (key: PresetKey) => {
    if (activePreset === key) {
      setActivePreset(null);
      const next = { ...filters };
      delete next.dateRange;
      onChange(next);
      return;
    }
    setActivePreset(key);
    onChange({ ...filters, dateRange: presetRange(key) });
  };

  const toggleOpenNow = () => {
    const next = { ...filters };
    if (filters.openNow) delete next.openNow;
    else next.openNow = true;
    onChange(next);
  };

  // h-9 keeps the chips comfortably tappable in the mobile bar's chip row.
  const chipBase =
    'h-9 md:h-8 inline-flex items-center gap-1.5 rounded-element border px-4 text-xs transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
  const on = 'border-foreground bg-foreground text-background';
  const off = 'border-border bg-background/90 text-foreground hover:bg-muted';
  // Below lg the desktop bar is tight — collapse chip labels to icons.
  const labelClass = compactLabels ? 'hidden lg:inline' : undefined;

  const openNowLabel = t('map.quick.openNow', { defaultValue: 'Open now' });
  const savedLabel = t('map.quick.saved', { defaultValue: 'Saved' });

  return (
    <div
      className="flex items-center gap-1.5 shrink-0"
      aria-label={t('map.quick.groupLabel', { defaultValue: 'Quick filters' })}
    >
      <button
        type="button"
        onClick={toggleOpenNow}
        aria-pressed={!!filters.openNow}
        aria-label={openNowLabel}
        title={openNowLabel}
        className={`${chipBase} shrink-0 ${filters.openNow ? on : off}`}
      >
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            filters.openNow ? 'bg-background' : 'bg-foreground'
          }`}
          aria-hidden
        />
        <span className={labelClass}>{openNowLabel}</span>
      </button>

      {showTime &&
        PRESETS.map(({ key, label, Icon }) => {
          const presetLabel = t(PRESET_KEYS[key], { defaultValue: label });
          return (
            <button
              key={key}
              type="button"
              onClick={() => togglePreset(key)}
              aria-pressed={activePreset === key}
              aria-label={presetLabel}
              title={presetLabel}
              className={`${chipBase} shrink-0 ${activePreset === key ? on : off}`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span className={labelClass}>{presetLabel}</span>
            </button>
          );
        })}

      {canSave && onToggleSaved && (
        <button
          type="button"
          onClick={onToggleSaved}
          aria-pressed={!!savedOnly}
          aria-label={savedLabel}
          title={savedLabel}
          className={`${chipBase} shrink-0 ${savedOnly ? on : off}`}
        >
          <Heart className={`h-3.5 w-3.5 ${savedOnly ? 'fill-current' : ''}`} aria-hidden />
          <span className={labelClass}>{savedLabel}</span>
        </button>
      )}
    </div>
  );
}

export default MapQuickFilters;
