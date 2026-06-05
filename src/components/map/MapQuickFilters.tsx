import { useEffect, useState } from 'react';
import { Clock, CalendarDays, CalendarRange } from 'lucide-react';
import type { MapShellFilters } from './MapShell.types';

interface MapQuickFiltersProps {
  filters: MapShellFilters;
  onChange: (next: MapShellFilters) => void;
  /** Show the Tonight/Weekend/Month chips (surfaces that expose the time filter). */
  showTime?: boolean;
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

/**
 * Quick-filter bar over the map: time presets (Tonight / This weekend /
 * This month) that drive the events dateRange, plus an Open-now toggle.
 * Highest-intent "what can I do right now" controls for travelers.
 */
export function MapQuickFilters({ filters, onChange, showTime = true }: MapQuickFiltersProps) {
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null);

  // Reset the active preset if the dateRange was cleared elsewhere (chip X).
  useEffect(() => {
    if (!filters.dateRange) setActivePreset(null);
  }, [filters.dateRange]);

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

  const chipBase =
    'h-8 inline-flex items-center gap-1.5 rounded-full border px-4 text-xs transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
  const on = 'border-foreground bg-foreground text-background';
  const off = 'border-border bg-background/90 text-foreground hover:bg-muted';

  return (
    <div className="flex flex-wrap items-center gap-1.5 backdrop-blur" aria-label="Quick filters">
      <button
        type="button"
        onClick={toggleOpenNow}
        aria-pressed={!!filters.openNow}
        className={`${chipBase} ${filters.openNow ? on : off}`}
      >
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            filters.openNow ? 'bg-background' : 'bg-foreground'
          }`}
          aria-hidden
        />
        Open now
      </button>

      {showTime &&
        PRESETS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => togglePreset(key)}
            aria-pressed={activePreset === key}
            className={`${chipBase} ${activePreset === key ? on : off}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        ))}
    </div>
  );
}

export default MapQuickFilters;
