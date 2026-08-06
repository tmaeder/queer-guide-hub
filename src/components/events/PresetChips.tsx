/* eslint-disable react-refresh/only-export-components -- intentionally co-locates helpers/constants with the primary component */

import { useTranslation } from 'react-i18next';
import {
  MapPin,
  Sparkles,
  Ticket,
  Flag,
  CalendarDays,
  Moon,
  CalendarRange,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type EventPresetId =
  | 'tonight'
  | 'this-weekend'
  | 'next-7-days'
  | 'near-me'
  | 'pride'
  | 'free'
  | 'featured'
  | 'new-this-week';

export interface EventPreset {
  id: EventPresetId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface PresetChipsProps {
  active: EventPresetId | null;
  onSelect: (preset: EventPresetId | null) => void;
  disabled?: EventPresetId[];
  /**
   * How many events each preset would return. Where a count is supplied it is
   * shown on the chip, and a zero count disables it.
   *
   * This exists because the corpus is thin: 253 future events in total, 10 in
   * the next seven days. "Tonight" was a live, clickable promise that resolved
   * to an empty grid for virtually every visitor — which reads as "the scene is
   * dead here" rather than "we have no listings". Showing the number turns a
   * broken promise into an honest one, and costs a `head: true` count.
   */
  counts?: Partial<Record<EventPresetId, number>>;
}

export function PresetChips({ active, onSelect, disabled = [], counts }: PresetChipsProps) {
  const { t } = useTranslation();

  const presets: EventPreset[] = [
    { id: 'tonight', label: t('pages.events.preset.tonight', 'Tonight'), icon: Moon },
    {
      id: 'this-weekend',
      label: t('pages.events.preset.thisWeekend', 'This weekend'),
      icon: CalendarDays,
    },
    {
      id: 'next-7-days',
      label: t('pages.events.preset.next7Days', 'Next 7 days'),
      icon: CalendarRange,
    },
    { id: 'near-me', label: t('pages.events.preset.nearMe', 'Near me'), icon: MapPin },
    { id: 'pride', label: t('pages.events.preset.pride', 'Pride season'), icon: Flag },
    { id: 'free', label: t('pages.events.preset.free', 'Free'), icon: Ticket },
    { id: 'featured', label: t('pages.events.preset.featured', 'Featured'), icon: Sparkles },
    {
      id: 'new-this-week',
      label: t('pages.events.preset.newThisWeek', 'New this week'),
      icon: Plus,
    },
  ];

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scrollbar-thin"
      role="tablist"
      aria-label={t('pages.events.preset.label', 'Quick filters')}
    >
      {presets.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        const count = counts?.[id];
        // A preset that can only return an empty grid is not a filter, it is a
        // dead end. Disable it rather than letting the reader discover that by
        // clicking — but never hide it, so the absence stays visible and
        // legible as thin coverage rather than a missing feature.
        const isDisabled = disabled.includes(id) || count === 0;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={isDisabled}
            onClick={() => onSelect(isActive ? null : id)}
            className={cn(
              'shrink-0 snap-start inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors bg-surface-container',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-border hover:bg-muted',
              isDisabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
            {typeof count === 'number' ? (
              <span className="tabular-nums text-13 opacity-70">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function getPresetDateRange(id: EventPresetId): { start: Date; end: Date } | null {
  const now = new Date();
  if (id === 'tonight') {
    // From now (or 18:00 if earlier) through 06:00 tomorrow
    const start = new Date(now);
    if (start.getHours() < 18) start.setHours(18, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setHours(6, 0, 0, 0);
    return { start, end };
  }
  if (id === 'this-weekend') {
    const day = now.getDay();
    const friday = new Date(now);
    friday.setDate(now.getDate() + ((5 - day + 7) % 7));
    friday.setHours(0, 0, 0, 0);
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);
    sunday.setHours(23, 59, 59, 999);
    return { start: friday, end: sunday };
  }
  if (id === 'next-7-days') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (id === 'pride') {
    const year = now.getFullYear();
    const start = new Date(year, 5, 1, 0, 0, 0, 0);
    const end = new Date(year, 6, 31, 23, 59, 59, 999);
    if (now > end) {
      return { start: new Date(year + 1, 5, 1), end: new Date(year + 1, 6, 31, 23, 59, 59, 999) };
    }
    return { start: now > start ? now : start, end };
  }
  if (id === 'new-this-week') {
    // Visible range = next 90 days (sort by created_at handled separately).
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 90);
    return { start, end };
  }
  return null;
}
